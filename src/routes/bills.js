'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, paginate, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireKYC } = require('../middleware/auth');
const { syncWalletToSupabase } = require('../helpers/supabaseSync'); // FIX v1: sincronización con Supabase

const CURRENCY_FIELD = { EUR: 'balanceEur', USD: 'balanceUsd', XAF: 'balanceXaf', XOF: 'balanceXof' };

// GET /v1/bills/providers — Listar todos los proveedores
router.get('/providers', async (req, res) => {
  const { category, country } = req.query;
  const where = {};
  if (category) where.category = category;
  if (country) where.country = country.toUpperCase();

  const providers = await prisma.billProvider.findMany({ where });
  const allProviders = await prisma.billProvider.findMany({ select: { category: true } });
  const categories = [...new Set(allProviders.map(p => p.category))];
  return success(res, { providers, total: providers.length, categories });
});

// GET /v1/bills/providers/:id — Detalle de proveedor
router.get('/providers/:id', async (req, res) => {
  const provider = await prisma.billProvider.findUnique({ where: { id: req.params.id } });
  if (!provider) return error(res, 'Proveedor no encontrado', 404);
  return success(res, provider);
});

// POST /v1/bills/pay — Pagar factura
router.post('/pay', requireAuth, requireKYC, async (req, res) => {
  const { provider_id, amount, reference_number, note } = req.body;
  if (!provider_id || !amount || !reference_number) {
    return error(res, 'Campos requeridos: provider_id, amount, reference_number', 400);
  }

  const provider = await prisma.billProvider.findUnique({ where: { id: provider_id } });
  if (!provider) return error(res, 'Proveedor no encontrado', 404);

  if (amount < provider.minAmount || amount > provider.maxAmount) {
    return error(res, `Importe fuera de rango. Mín: ${provider.minAmount} ${provider.currency}, Máx: ${provider.maxAmount} ${provider.currency}`, 422);
  }

  const balanceField = CURRENCY_FIELD[provider.currency] || 'balanceXaf';
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  if (!wallet || wallet[balanceField] < amount) {
    return error(res, `Saldo ${provider.currency} insuficiente`, 422);
  }

  const [walletAfter, payment] = await prisma.$transaction([
    prisma.wallet.update({ where: { userId: req.user.sub }, data: { [balanceField]: { decrement: amount } } }),
    prisma.billPayment.create({
      data: {
        id: `bill_${uuidv4().slice(0, 8)}`,
        userId: req.user.sub, providerId: provider_id,
        amount, currency: provider.currency,
        referenceNumber: reference_number,
        note: note || null,
        status: 'completed',
        confirmationCode: `CONF_${uuidv4().slice(0, 10).toUpperCase()}`
      }
    })
  ]);

  // FIX v1: sin esto, el pago de factura no se veía reflejado en XenderMoney
  syncWalletToSupabase(req.user.sub, walletAfter).catch(function(){});

  await triggerWebhook('bill.paid', { id: payment.id, provider: provider.name, amount, category: provider.category });

  return success(res, {
    id: payment.id, status: payment.status,
    provider: { id: provider.id, name: provider.name, category: provider.category },
    amount, currency: provider.currency,
    reference_number,
    confirmation_code: payment.confirmationCode,
    message: `Pago de ${provider.category} procesado correctamente.`,
    created_at: payment.createdAt
  });
});

// GET /v1/bills/history — Historial de pagos de facturas
router.get('/history', requireAuth, async (req, res) => {
  const { page = 1, limit = 20, category } = req.query;
  const where = { userId: req.user.sub };
  if (category) {
    const provIds = (await prisma.billProvider.findMany({ where: { category }, select: { id: true } })).map(p => p.id);
    where.providerId = { in: provIds };
  }

  const payments = await prisma.billPayment.findMany({
    where, include: { provider: { select: { name: true, category: true } } },
    orderBy: { createdAt: 'desc' }
  });
  return success(res, paginate(payments, page, limit));
});

// GET /v1/bills/history/:id — Detalle de un pago
router.get('/history/:id', requireAuth, async (req, res) => {
  const payment = await prisma.billPayment.findFirst({
    where: { id: req.params.id, userId: req.user.sub },
    include: { provider: true }
  });
  if (!payment) return error(res, 'Pago no encontrado', 404);
  return success(res, payment);
});

module.exports = router;
