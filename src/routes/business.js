'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, paginate, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireKYC } = require('../middleware/auth');
const { notify } = require('../helpers/notify');
const { syncWalletToSupabase } = require('../helpers/supabaseSync'); // FIX v1: sincronización con Supabase

const CURRENCY_FIELD = { EUR: 'balanceEur', USD: 'balanceUsd', XAF: 'balanceXaf', XOF: 'balanceXof' };

// POST /v1/business/accounts — Crear cuenta empresarial
router.post('/accounts', requireAuth, requireKYC, async (req, res) => {
  const { company_name, tax_id, industry, country, address, website } = req.body;
  if (!company_name || !tax_id || !industry || !country) {
    return error(res, 'Campos requeridos: company_name, tax_id, industry, country', 400);
  }

  const existing = await prisma.businessAccount.findFirst({ where: { ownerId: req.user.sub } });
  if (existing) return error(res, 'Ya tienes una cuenta empresarial activa', 409);

  const account = await prisma.businessAccount.create({
    data: {
      id: `biz_${uuidv4().slice(0, 8)}`,
      ownerId: req.user.sub,
      companyName: company_name, taxId: tax_id, industry, country,
      address: address || null, website: website || null,
      status: 'active', plan: 'basic', monthlyLimitEur: 10000
    }
  });

  await prisma.user.update({ where: { id: req.user.sub }, data: { role: 'circular_autorizada' } });
  await triggerWebhook('business.account_created', { id: account.id, company_name });
  notify(req.user.sub, {
    title: 'Cuenta empresarial activada',
    body: `Tu cuenta empresarial "${company_name}" está lista. Plan básico: hasta ${account.monthlyLimitEur}€/mes.`,
    type: 'success'
  });

  return success(res, account, 201);
});

// GET /v1/business/accounts/me — Mi cuenta empresarial
router.get('/accounts/me', requireAuth, async (req, res) => {
  const account = await prisma.businessAccount.findFirst({ where: { ownerId: req.user.sub } });
  if (!account) return error(res, 'No tienes cuenta empresarial. Crea una con POST /v1/business/accounts', 404);

  const [invoices, bulkPayments] = await Promise.all([
    prisma.invoice.findMany({ where: { issuerId: req.user.sub } }),
    prisma.bulkPayment.findMany({ where: { ownerId: req.user.sub } })
  ]);

  const paidInvoices = invoices.filter(i => i.status === 'paid');
  const totalInvoiced = paidInvoices.reduce((s, i) => s + i.totalEur, 0);

  return success(res, {
    ...account,
    stats: {
      invoices_total: invoices.length,
      invoices_paid: paidInvoices.length,
      total_invoiced_eur: Math.round(totalInvoiced * 100) / 100,
      bulk_payments: bulkPayments.length
    }
  });
});

// PATCH /v1/business/accounts/me — Actualizar datos empresa
router.patch('/accounts/me', requireAuth, async (req, res) => {
  const account = await prisma.businessAccount.findFirst({ where: { ownerId: req.user.sub } });
  if (!account) return error(res, 'No tienes cuenta empresarial', 404);

  const data = {};
  if (req.body.address !== undefined) data.address = req.body.address;
  if (req.body.website !== undefined) data.website = req.body.website;
  if (req.body.industry !== undefined) data.industry = req.body.industry;

  const updated = await prisma.businessAccount.update({ where: { id: account.id }, data });
  return success(res, updated);
});

// POST /v1/business/bulk/payments — Lanzar pago masivo
router.post('/bulk/payments', requireAuth, requireKYC, async (req, res) => {
  const { recipients, currency = 'XAF', description } = req.body;
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return error(res, 'recipients requerido: array de {user_id, amount}', 400);
  }
  if (recipients.length > 500) return error(res, 'Máximo 500 destinatarios por lote', 400);

  const account = await prisma.businessAccount.findFirst({ where: { ownerId: req.user.sub } });
  if (!account) return error(res, 'Necesitas una cuenta empresarial para pagos masivos', 403);

  const balanceField = CURRENCY_FIELD[currency] || 'balanceXaf';
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  const totalAmt = recipients.reduce((s, r) => s + (r.amount || 0), 0);

  if (!wallet || wallet[balanceField] < totalAmt) {
    return error(res, `Saldo ${currency} insuficiente. Necesitas ${totalAmt}, tienes ${wallet?.[balanceField] || 0}`, 422);
  }

  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (const rec of recipients) {
    const recipient = await prisma.user.findFirst({
      where: { OR: [{ id: rec.user_id }, { email: rec.user_id }, { phone: rec.user_id }] }
    });
    if (!recipient || !rec.amount || rec.amount <= 0) {
      results.push({ recipient_ref: rec.user_id, status: 'failed', reason: recipient ? 'Importe inválido' : 'Usuario no encontrado' });
      failed++;
      continue;
    }
    const payTx = await prisma.$transaction([
      prisma.wallet.update({ where: { userId: req.user.sub }, data: { [balanceField]: { decrement: rec.amount } } }),
      prisma.wallet.upsert({
        where: { userId: recipient.id },
        update: { [balanceField]: { increment: rec.amount } },
        create: { userId: recipient.id, [balanceField]: rec.amount }
      })
    ]);
    // FIX v1: sincronizar ambos wallets con Supabase
    syncWalletToSupabase(req.user.sub, payTx[0]).catch(function(){});
    syncWalletToSupabase(recipient.id, payTx[1]).catch(function(){});
    notify(recipient.id, {
      title: 'Pago recibido',
      body: `Has recibido ${rec.amount} ${currency} de ${account.companyName}.`,
      type: 'success', data: { amount: rec.amount, currency, from: account.companyName }
    });
    results.push({ recipient_ref: rec.user_id, recipient_name: recipient.name, amount: rec.amount, status: 'completed' });
    succeeded++;
  }

  const bulk = await prisma.bulkPayment.create({
    data: {
      id: `bulk_${uuidv4().slice(0, 8)}`,
      ownerId: req.user.sub, companyName: account.companyName,
      description: description || null, currency,
      totalAmount: totalAmt, recipientsTotal: recipients.length,
      succeeded, failed,
      status: failed === 0 ? 'completed' : 'partial',
      results: { create: results.map(r => ({ recipientRef: r.recipient_ref, status: r.status, amount: r.amount || null, reason: r.reason || null })) }
    }
  });

  await triggerWebhook('bulk_payment.completed', { id: bulk.id, succeeded, failed, total_amount: totalAmt });

  return success(res, {
    id: bulk.id, status: bulk.status,
    total_amount: totalAmt, currency, succeeded, failed, results,
    created_at: bulk.createdAt
  }, 201);
});

// GET /v1/business/bulk/payments — Historial
router.get('/bulk/payments', requireAuth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const payments = await prisma.bulkPayment.findMany({
    where: { ownerId: req.user.sub }, orderBy: { createdAt: 'desc' }
  });
  return success(res, paginate(payments, page, limit));
});

// GET /v1/business/bulk/payments/:id — Detalle
router.get('/bulk/payments/:id', requireAuth, async (req, res) => {
  const payment = await prisma.bulkPayment.findFirst({
    where: { id: req.params.id, ownerId: req.user.sub },
    include: { results: true }
  });
  if (!payment) return error(res, 'Pago masivo no encontrado', 404);
  return success(res, payment);
});

// POST /v1/business/invoices — Crear factura
router.post('/invoices', requireAuth, requireKYC, async (req, res) => {
  const { client_id, client_name, client_email, items, currency = 'EUR', due_date, notes } = req.body;
  if (!items || items.length === 0) return error(res, 'items requerido: array de {description, quantity, unit_price}', 400);
  if (!client_name && !client_id) return error(res, 'Indica client_id o client_name', 400);

  const account = await prisma.businessAccount.findFirst({ where: { ownerId: req.user.sub } });
  if (!account) return error(res, 'Necesitas una cuenta empresarial para crear facturas', 403);

  const lineItems = items.map(item => ({
    description: item.description,
    quantity: item.quantity || 1,
    unitPrice: item.unit_price,
    subtotal: Math.round(item.unit_price * (item.quantity || 1) * 100) / 100
  }));
  const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
  const taxRate = 0.19;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  const invoiceCount = await prisma.invoice.count({ where: { issuerId: req.user.sub } });
  const invoiceNumber = `INV-${account.id.slice(-4).toUpperCase()}-${String(invoiceCount + 1).padStart(4, '0')}`;

  const invoice = await prisma.invoice.create({
    data: {
      id: `inv_${uuidv4().slice(0, 8)}`,
      invoiceNumber, issuerId: req.user.sub,
      issuerName: account.companyName,
      clientId: client_id || null, clientName: client_name || null, clientEmail: client_email || null,
      currency,
      subtotal: Math.round(subtotal * 100) / 100,
      taxRate, taxAmount: tax, totalEur: total,
      notes: notes || null, status: 'draft',
      dueDate: due_date ? new Date(due_date) : null,
      items: { create: lineItems }
    },
    include: { items: true }
  });
  return success(res, invoice, 201);
});

// GET /v1/business/invoices — Listar mis facturas
router.get('/invoices', requireAuth, async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const where = { issuerId: req.user.sub };
  if (status) where.status = status;

  const invoices = await prisma.invoice.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' } });
  return success(res, paginate(invoices, page, limit));
});

// GET /v1/business/invoices/:id
router.get('/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, OR: [{ issuerId: req.user.sub }, { clientId: req.user.sub }] },
    include: { items: true }
  });
  if (!invoice) return error(res, 'Factura no encontrada', 404);
  return success(res, invoice);
});

// PATCH /v1/business/invoices/:id/send — Enviar factura al cliente
router.patch('/invoices/:id/send', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, issuerId: req.user.sub } });
  if (!invoice) return error(res, 'Factura no encontrada', 404);
  if (invoice.status !== 'draft') return error(res, 'Solo se pueden enviar facturas en estado draft', 400);

  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'sent', sentAt: new Date() } });

  if (invoice.clientId) {
    notify(invoice.clientId, {
      title: 'Nueva factura recibida',
      body: `${invoice.issuerName} te ha enviado la factura ${invoice.invoiceNumber} por ${invoice.totalEur} ${invoice.currency}.`,
      type: 'info', data: { invoice_id: invoice.id, total: invoice.totalEur }
    });
  }
  await triggerWebhook('invoice.sent', { id: invoice.id, invoice_number: invoice.invoiceNumber, total: invoice.totalEur });
  return success(res, { id: invoice.id, invoice_number: invoice.invoiceNumber, status: 'sent', sent_at: updated.sentAt });
});

// PATCH /v1/business/invoices/:id/pay — Pagar factura
router.patch('/invoices/:id/pay', requireAuth, requireKYC, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) return error(res, 'Factura no encontrada', 404);
  if (!['sent', 'draft'].includes(invoice.status)) return error(res, 'Esta factura ya fue pagada o cancelada', 400);

  const balanceField = CURRENCY_FIELD[invoice.currency] || 'balanceEur';
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  if (!wallet || wallet[balanceField] < invoice.totalEur) {
    return error(res, `Saldo ${invoice.currency} insuficiente`, 422);
  }

  const payInvoiceTx = await prisma.$transaction([
    prisma.wallet.update({ where: { userId: req.user.sub }, data: { [balanceField]: { decrement: invoice.totalEur } } }),
    prisma.wallet.upsert({
      where: { userId: invoice.issuerId },
      update: { [balanceField]: { increment: invoice.totalEur } },
      create: { userId: invoice.issuerId, [balanceField]: invoice.totalEur }
    }),
    prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'paid', paidAt: new Date(), paidBy: req.user.sub } })
  ]);

  // FIX v1: sincronizar ambos wallets (pagador y emisor de la factura)
  syncWalletToSupabase(req.user.sub, payInvoiceTx[0]).catch(function(){});
  syncWalletToSupabase(invoice.issuerId, payInvoiceTx[1]).catch(function(){});

  notify(invoice.issuerId, {
    title: 'Factura pagada',
    body: `La factura ${invoice.invoiceNumber} ha sido pagada. Importe: ${invoice.totalEur} ${invoice.currency}.`,
    type: 'success', data: { invoice_id: invoice.id, amount: invoice.totalEur }
  });
  await triggerWebhook('invoice.paid', { id: invoice.id, amount: invoice.totalEur, currency: invoice.currency });

  return success(res, { id: invoice.id, invoice_number: invoice.invoiceNumber, status: 'paid', paid_at: new Date(), amount: invoice.totalEur });
});

// GET /v1/business/analytics — Panel analítico del negocio
router.get('/analytics', requireAuth, async (req, res) => {
  const account = await prisma.businessAccount.findFirst({ where: { ownerId: req.user.sub } });
  if (!account) return error(res, 'No tienes cuenta empresarial', 404);

  const now = new Date();
  const month30 = new Date(now - 30 * 86400000);

  const [invoices, bulkPayments, recentTxns, wallet] = await Promise.all([
    prisma.invoice.findMany({ where: { issuerId: req.user.sub } }),
    prisma.bulkPayment.findMany({ where: { ownerId: req.user.sub } }),
    prisma.transaction.findMany({ where: { userId: req.user.sub, createdAt: { gte: month30 } } }),
    prisma.wallet.findUnique({ where: { userId: req.user.sub } })
  ]);

  const paidInvoices = invoices.filter(i => i.status === 'paid');
  const revenue_eur = paidInvoices.reduce((s, i) => s + i.totalEur, 0);

  return success(res, {
    company: account.companyName, plan: account.plan, period: 'all_time',
    revenue: {
      total_eur: Math.round(revenue_eur * 100) / 100,
      invoices_paid: paidInvoices.length,
      invoices_pending: invoices.filter(i => i.status === 'sent').length,
      invoices_draft: invoices.filter(i => i.status === 'draft').length
    },
    bulk_payments: {
      total: bulkPayments.length,
      recipients_paid: bulkPayments.reduce((s, b) => s + b.succeeded, 0),
      total_disbursed_xaf: bulkPayments.filter(b => b.currency === 'XAF').reduce((s, b) => s + b.totalAmount, 0)
    },
    transactions_last_30d: {
      count: recentTxns.length,
      volume_eur: recentTxns.filter(t => t.currencySent === 'EUR').reduce((s, t) => s + (t.amountSent || 0), 0)
    },
    wallet: wallet || {}
  });
});

module.exports = router;
