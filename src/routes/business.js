'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, paginate, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireKYC } = require('../middleware/auth');
const { notify } = require('../helpers/notify');

// ── Cuentas empresariales ─────────────────────────────

// POST /v1/business/accounts — Crear cuenta empresarial
router.post('/accounts', requireAuth, requireKYC, (req, res) => {
  const { company_name, tax_id, industry, country, address, website } = req.body;
  if (!company_name || !tax_id || !industry || !country) {
    return error(res, 'Campos requeridos: company_name, tax_id, industry, country', 400);
  }

  const existing = DB.business_accounts.find(b => b.owner_id === req.user.sub);
  if (existing) return error(res, 'Ya tienes una cuenta empresarial activa', 409);

  const account = {
    id: `biz_${uuidv4().slice(0, 8)}`,
    owner_id: req.user.sub,
    company_name, tax_id, industry, country,
    address: address || null,
    website: website || null,
    status: 'active',
    plan: 'basic',
    monthly_limit_eur: 10000,
    created_at: new Date().toISOString()
  };
  DB.business_accounts.push(account);

  // Actualizar rol del usuario
  const user = DB.users.find(u => u.id === req.user.sub);
  if (user) user.role = 'circular_autorizada';

  triggerWebhook('business.account_created', { id: account.id, company_name });
  notify(req.user.sub, {
    title: 'Cuenta empresarial activada',
    body: `Tu cuenta empresarial "${company_name}" está lista. Plan básico: hasta ${account.monthly_limit_eur}€/mes.`,
    type: 'success'
  });

  return success(res, account, 201);
});

// GET /v1/business/accounts/me — Mi cuenta empresarial
router.get('/accounts/me', requireAuth, (req, res) => {
  const account = DB.business_accounts.find(b => b.owner_id === req.user.sub);
  if (!account) return error(res, 'No tienes cuenta empresarial. Crea una con POST /v1/business/accounts', 404);

  const myInvoices    = DB.invoices.filter(i => i.issuer_id === req.user.sub);
  const myBulk        = DB.bulk_payments.filter(b => b.owner_id === req.user.sub);
  const totalInvoiced = myInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total_eur, 0);

  return success(res, {
    ...account,
    stats: {
      invoices_total: myInvoices.length,
      invoices_paid: myInvoices.filter(i => i.status === 'paid').length,
      total_invoiced_eur: Math.round(totalInvoiced * 100) / 100,
      bulk_payments: myBulk.length
    }
  });
});

// PATCH /v1/business/accounts/me — Actualizar datos empresa
router.patch('/accounts/me', requireAuth, (req, res) => {
  const account = DB.business_accounts.find(b => b.owner_id === req.user.sub);
  if (!account) return error(res, 'No tienes cuenta empresarial', 404);

  const allowed = ['address', 'website', 'industry'];
  allowed.forEach(field => {
    if (req.body[field] !== undefined) account[field] = req.body[field];
  });
  account.updated_at = new Date().toISOString();
  return success(res, account);
});

// ── Pagos masivos (Bulk) ──────────────────────────────

// POST /v1/business/bulk/payments — Lanzar pago masivo
router.post('/bulk/payments', requireAuth, requireKYC, (req, res) => {
  const { recipients, currency = 'XAF', description } = req.body;
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return error(res, 'recipients requerido: array de {user_id, amount}', 400);
  }
  if (recipients.length > 500) return error(res, 'Máximo 500 destinatarios por lote', 400);

  const account = DB.business_accounts.find(b => b.owner_id === req.user.sub);
  if (!account) return error(res, 'Necesitas una cuenta empresarial para pagos masivos', 403);

  const wallet   = DB.wallets[req.user.sub];
  const balKey   = `balance_${currency.toLowerCase()}`;
  const totalAmt = recipients.reduce((s, r) => s + (r.amount || 0), 0);

  if (!wallet || wallet[balKey] < totalAmt) {
    return error(res, `Saldo ${currency} insuficiente. Necesitas ${totalAmt}, tienes ${wallet?.[balKey] || 0}`, 422);
  }

  const results = [];
  let succeeded = 0;
  let failed    = 0;

  for (const rec of recipients) {
    const recipient = DB.users.find(u => u.id === rec.user_id || u.email === rec.user_id || u.phone === rec.user_id);
    if (!recipient || !rec.amount || rec.amount <= 0) {
      results.push({ recipient_ref: rec.user_id, status: 'failed', reason: recipient ? 'Importe inválido' : 'Usuario no encontrado' });
      failed++;
      continue;
    }
    wallet[balKey] -= rec.amount;
    const recWallet = DB.wallets[recipient.id] || { balance_eur: 0, balance_usd: 0, balance_xaf: 0, balance_xof: 0 };
    recWallet[balKey] = (recWallet[balKey] || 0) + rec.amount;
    DB.wallets[recipient.id] = recWallet;

    notify(recipient.id, {
      title: 'Pago recibido',
      body: `Has recibido ${rec.amount} ${currency} de ${account.company_name}.`,
      type: 'success', data: { amount: rec.amount, currency, from: account.company_name }
    });
    results.push({ recipient_ref: rec.user_id, recipient_name: recipient.name, amount: rec.amount, status: 'completed' });
    succeeded++;
  }

  const bulk = {
    id: `bulk_${uuidv4().slice(0, 8)}`,
    owner_id: req.user.sub,
    company: account.company_name,
    description: description || null,
    currency,
    total_amount: totalAmt,
    recipients_total: recipients.length,
    succeeded, failed,
    results,
    status: failed === 0 ? 'completed' : 'partial',
    created_at: new Date().toISOString()
  };
  DB.bulk_payments.push(bulk);
  triggerWebhook('bulk_payment.completed', { id: bulk.id, succeeded, failed, total_amount: totalAmt });

  return success(res, {
    id: bulk.id, status: bulk.status,
    total_amount: totalAmt, currency,
    succeeded, failed,
    results,
    created_at: bulk.created_at
  }, 201);
});

// GET /v1/business/bulk/payments — Historial
router.get('/bulk/payments', requireAuth, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const payments = DB.bulk_payments
    .filter(b => b.owner_id === req.user.sub)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return success(res, paginate(payments, page, limit));
});

// GET /v1/business/bulk/payments/:id — Detalle
router.get('/bulk/payments/:id', requireAuth, (req, res) => {
  const payment = DB.bulk_payments.find(b => b.id === req.params.id && b.owner_id === req.user.sub);
  if (!payment) return error(res, 'Pago masivo no encontrado', 404);
  return success(res, payment);
});

// ── Facturas digitales ────────────────────────────────

// POST /v1/business/invoices — Crear factura
router.post('/invoices', requireAuth, requireKYC, (req, res) => {
  const { client_id, client_name, client_email, items, currency = 'EUR', due_date, notes } = req.body;
  if (!items || items.length === 0) return error(res, 'items requerido: array de {description, quantity, unit_price}', 400);
  if (!client_name && !client_id) return error(res, 'Indica client_id o client_name', 400);

  const account = DB.business_accounts.find(b => b.owner_id === req.user.sub);
  if (!account) return error(res, 'Necesitas una cuenta empresarial para crear facturas', 403);

  const lineItems = items.map(item => ({
    description: item.description,
    quantity: item.quantity || 1,
    unit_price: item.unit_price,
    subtotal: Math.round(item.unit_price * (item.quantity || 1) * 100) / 100
  }));
  const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
  const tax_rate = 0.19;
  const tax      = Math.round(subtotal * tax_rate * 100) / 100;
  const total    = Math.round((subtotal + tax) * 100) / 100;

  const invoice_number = `INV-${account.id.slice(-4).toUpperCase()}-${String(DB.invoices.filter(i => i.issuer_id === req.user.sub).length + 1).padStart(4, '0')}`;

  const invoice = {
    id: `inv_${uuidv4().slice(0, 8)}`,
    invoice_number,
    issuer_id: req.user.sub,
    issuer_name: account.company_name,
    client_id: client_id || null,
    client_name,
    client_email: client_email || null,
    currency,
    items: lineItems,
    subtotal: Math.round(subtotal * 100) / 100,
    tax_rate,
    tax_amount: tax,
    total_eur: total,
    notes: notes || null,
    status: 'draft',
    due_date: due_date || null,
    created_at: new Date().toISOString()
  };
  DB.invoices.push(invoice);
  return success(res, invoice, 201);
});

// GET /v1/business/invoices — Listar mis facturas
router.get('/invoices', requireAuth, (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  let invoices = DB.invoices.filter(i => i.issuer_id === req.user.sub);
  if (status) invoices = invoices.filter(i => i.status === status);
  invoices.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return success(res, paginate(invoices, page, limit));
});

// GET /v1/business/invoices/:id
router.get('/invoices/:id', requireAuth, (req, res) => {
  const invoice = DB.invoices.find(i => i.id === req.params.id &&
    (i.issuer_id === req.user.sub || i.client_id === req.user.sub));
  if (!invoice) return error(res, 'Factura no encontrada', 404);
  return success(res, invoice);
});

// PATCH /v1/business/invoices/:id/send — Enviar factura al cliente
router.patch('/invoices/:id/send', requireAuth, (req, res) => {
  const invoice = DB.invoices.find(i => i.id === req.params.id && i.issuer_id === req.user.sub);
  if (!invoice) return error(res, 'Factura no encontrada', 404);
  if (invoice.status !== 'draft') return error(res, 'Solo se pueden enviar facturas en estado draft', 400);

  invoice.status = 'sent';
  invoice.sent_at = new Date().toISOString();

  if (invoice.client_id) {
    notify(invoice.client_id, {
      title: 'Nueva factura recibida',
      body: `${invoice.issuer_name} te ha enviado la factura ${invoice.invoice_number} por ${invoice.total_eur} ${invoice.currency}.`,
      type: 'info', data: { invoice_id: invoice.id, total: invoice.total_eur }
    });
  }
  triggerWebhook('invoice.sent', { id: invoice.id, invoice_number: invoice.invoice_number, total: invoice.total_eur });
  return success(res, { id: invoice.id, invoice_number: invoice.invoice_number, status: 'sent', sent_at: invoice.sent_at });
});

// PATCH /v1/business/invoices/:id/pay — Pagar factura (cliente paga desde su wallet)
router.patch('/invoices/:id/pay', requireAuth, requireKYC, (req, res) => {
  const invoice = DB.invoices.find(i => i.id === req.params.id);
  if (!invoice) return error(res, 'Factura no encontrada', 404);
  if (!['sent', 'draft'].includes(invoice.status)) return error(res, 'Esta factura ya fue pagada o cancelada', 400);

  const wallet  = DB.wallets[req.user.sub];
  const balKey  = `balance_${invoice.currency.toLowerCase()}`;
  if (!wallet || wallet[balKey] < invoice.total_eur) {
    return error(res, `Saldo ${invoice.currency} insuficiente`, 422);
  }

  wallet[balKey] -= invoice.total_eur;

  const issuerWallet = DB.wallets[invoice.issuer_id];
  if (issuerWallet) issuerWallet[balKey] = (issuerWallet[balKey] || 0) + invoice.total_eur;

  invoice.status  = 'paid';
  invoice.paid_at = new Date().toISOString();
  invoice.paid_by = req.user.sub;

  notify(invoice.issuer_id, {
    title: 'Factura pagada',
    body: `La factura ${invoice.invoice_number} ha sido pagada. Importe: ${invoice.total_eur} ${invoice.currency}.`,
    type: 'success', data: { invoice_id: invoice.id, amount: invoice.total_eur }
  });
  triggerWebhook('invoice.paid', { id: invoice.id, amount: invoice.total_eur, currency: invoice.currency });

  return success(res, { id: invoice.id, invoice_number: invoice.invoice_number, status: 'paid', paid_at: invoice.paid_at, amount: invoice.total_eur });
});

// ── Analíticas ────────────────────────────────────────

// GET /v1/business/analytics — Panel analítico del negocio
router.get('/analytics', requireAuth, (req, res) => {
  const account = DB.business_accounts.find(b => b.owner_id === req.user.sub);
  if (!account) return error(res, 'No tienes cuenta empresarial', 404);

  const myOrders   = DB.orders.filter(o => o.user_id === req.user.sub);
  const myInvoices = DB.invoices.filter(i => i.issuer_id === req.user.sub);
  const myBulk     = DB.bulk_payments.filter(b => b.owner_id === req.user.sub);
  const myTxns     = DB.transactions.filter(t => t.user_id === req.user.sub);

  const invoicePaid = myInvoices.filter(i => i.status === 'paid');
  const revenue_eur = invoicePaid.reduce((s, i) => s + i.total_eur, 0);

  const now      = new Date();
  const month30  = new Date(now - 30 * 86400000);
  const recentTx = myTxns.filter(t => new Date(t.created_at) > month30);

  return success(res, {
    company: account.company_name,
    plan: account.plan,
    period: 'all_time',
    revenue: {
      total_eur: Math.round(revenue_eur * 100) / 100,
      invoices_paid: invoicePaid.length,
      invoices_pending: myInvoices.filter(i => i.status === 'sent').length,
      invoices_draft: myInvoices.filter(i => i.status === 'draft').length
    },
    bulk_payments: {
      total: myBulk.length,
      recipients_paid: myBulk.reduce((s, b) => s + b.succeeded, 0),
      total_disbursed_xaf: myBulk.filter(b => b.currency === 'XAF').reduce((s, b) => s + b.total_amount, 0)
    },
    transactions_last_30d: {
      count: recentTx.length,
      volume_eur: recentTx.filter(t => t.currency_sent === 'EUR').reduce((s, t) => s + (t.amount_sent || t.amount || 0), 0)
    },
    wallet: DB.wallets[req.user.sub] || {}
  });
});

module.exports = router;
