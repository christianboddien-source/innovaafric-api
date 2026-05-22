'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, paginate, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireKYC } = require('../middleware/auth');

// GET /v1/bills/providers — Listar todos los proveedores
router.get('/providers', (req, res) => {
  const { category, country } = req.query;
  let providers = [...DB.bill_providers];
  if (category) providers = providers.filter(p => p.category === category);
  if (country)  providers = providers.filter(p => p.country === country.toUpperCase());

  const categories = [...new Set(DB.bill_providers.map(p => p.category))];
  return success(res, { providers, total: providers.length, categories });
});

// GET /v1/bills/providers/:id — Detalle de proveedor
router.get('/providers/:id', (req, res) => {
  const provider = DB.bill_providers.find(p => p.id === req.params.id);
  if (!provider) return error(res, 'Proveedor no encontrado', 404);
  return success(res, provider);
});

// POST /v1/bills/pay — Pagar factura
router.post('/pay', requireAuth, requireKYC, (req, res) => {
  const { provider_id, amount, reference_number, note } = req.body;
  if (!provider_id || !amount || !reference_number) {
    return error(res, 'Campos requeridos: provider_id, amount, reference_number', 400);
  }

  const provider = DB.bill_providers.find(p => p.id === provider_id);
  if (!provider) return error(res, 'Proveedor no encontrado', 404);

  if (amount < provider.min_amount || amount > provider.max_amount) {
    return error(res, `Importe fuera de rango. Mín: ${provider.min_amount} ${provider.currency}, Máx: ${provider.max_amount} ${provider.currency}`, 422);
  }

  const wallet = DB.wallets[req.user.sub];
  const balanceKey = `balance_${provider.currency.toLowerCase()}`;
  if (!wallet || wallet[balanceKey] < amount) {
    return error(res, `Saldo ${provider.currency} insuficiente`, 422);
  }

  wallet[balanceKey] -= amount;

  const payment = {
    id: `bill_${uuidv4().slice(0, 8)}`,
    user_id: req.user.sub,
    provider_id,
    provider_name: provider.name,
    category: provider.category,
    amount,
    currency: provider.currency,
    reference_number,
    note: note || null,
    status: 'completed',
    confirmation_code: `CONF_${uuidv4().slice(0, 10).toUpperCase()}`,
    created_at: new Date().toISOString()
  };
  DB.bill_payments.push(payment);
  triggerWebhook('bill.paid', { id: payment.id, provider: provider.name, amount, category: provider.category });

  return success(res, {
    id: payment.id,
    status: payment.status,
    provider: { id: provider.id, name: provider.name, category: provider.category },
    amount, currency: provider.currency,
    reference_number,
    confirmation_code: payment.confirmation_code,
    message: `Pago de ${provider.category} procesado correctamente.`,
    created_at: payment.created_at
  });
});

// GET /v1/bills/history — Historial de pagos de facturas
router.get('/history', requireAuth, (req, res) => {
  const { page = 1, limit = 20, category } = req.query;
  let payments = DB.bill_payments.filter(p => p.user_id === req.user.sub);
  if (category) payments = payments.filter(p => p.category === category);
  payments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return success(res, paginate(payments, page, limit));
});

// GET /v1/bills/history/:id — Detalle de un pago
router.get('/history/:id', requireAuth, (req, res) => {
  const payment = DB.bill_payments.find(p => p.id === req.params.id && p.user_id === req.user.sub);
  if (!payment) return error(res, 'Pago no encontrado', 404);
  return success(res, payment);
});

module.exports = router;
