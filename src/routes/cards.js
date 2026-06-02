'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireKYC } = require('../middleware/auth');

const CURRENCY_FIELD = { EUR: 'balanceEur', USD: 'balanceUsd', XAF: 'balanceXaf', XOF: 'balanceXof' };

function generateCardNumber() {
  return Array.from({ length: 4 }, () => Math.floor(1000 + Math.random() * 9000)).join(' ');
}
function generateCVV() { return String(Math.floor(100 + Math.random() * 900)); }
function generateExpiry() {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getFullYear() + 3).slice(2)}`;
}

// POST /v1/cards — Crear tarjeta virtual
router.post('/', requireAuth, requireKYC, async (req, res) => {
  const { label, currency = 'EUR', initial_load = 0 } = req.body;
  if (!label) return error(res, 'label requerido (ej: "Compras Amazon")', 400);

  const validCurrencies = ['EUR', 'USD'];
  if (!validCurrencies.includes(currency)) {
    return error(res, `Divisa no soportada para tarjetas. Opciones: ${validCurrencies.join(', ')}`, 400);
  }

  const userCardsCount = await prisma.virtualCard.count({ where: { userId: req.user.sub, status: 'active' } });
  if (userCardsCount >= 5) return error(res, 'Límite de 5 tarjetas activas por usuario', 400);

  if (initial_load > 0) {
    const balanceField = CURRENCY_FIELD[currency];
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
    if (!wallet || wallet[balanceField] < initial_load) {
      return error(res, `Saldo ${currency} insuficiente para la carga inicial`, 422);
    }
    await prisma.wallet.update({ where: { userId: req.user.sub }, data: { [balanceField]: { decrement: initial_load } } });
  }

  const card = await prisma.virtualCard.create({
    data: {
      id: `card_${uuidv4().slice(0, 8)}`,
      userId: req.user.sub, label,
      number: generateCardNumber(), cvv: generateCVV(), expiry: generateExpiry(),
      currency, balance: initial_load, status: 'active', frozen: false
    }
  });

  await triggerWebhook('card.created', { id: card.id, label, currency, initial_load });

  return success(res, {
    id: card.id, label: card.label, number: card.number,
    cvv: card.cvv, expiry: card.expiry, currency: card.currency,
    balance: card.balance, status: card.status,
    message: 'Tarjeta virtual creada. Guarda los datos — el CVV no se mostrará de nuevo.',
    created_at: card.createdAt
  }, 201);
});

// GET /v1/cards — Listar tarjetas del usuario
router.get('/', requireAuth, async (req, res) => {
  const cards = await prisma.virtualCard.findMany({ where: { userId: req.user.sub } });
  return success(res, {
    cards: cards.map(c => ({
      id: c.id, label: c.label,
      number_masked: `**** **** **** ${c.number.slice(-4)}`,
      expiry: c.expiry, currency: c.currency,
      balance: c.balance, status: c.status, frozen: c.frozen,
      spent_total: c.spentTotal, created_at: c.createdAt
    })),
    total: cards.length
  });
});

// GET /v1/cards/:id — Detalle de tarjeta
router.get('/:id', requireAuth, async (req, res) => {
  const card = await prisma.virtualCard.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
  if (!card) return error(res, 'Tarjeta no encontrada', 404);

  const txns = await prisma.virtualCardTransaction.findMany({
    where: { cardId: card.id }, orderBy: { createdAt: 'desc' }, take: 10
  });

  return success(res, {
    id: card.id, label: card.label,
    number_masked: `**** **** **** ${card.number.slice(-4)}`,
    expiry: card.expiry, currency: card.currency,
    balance: card.balance, status: card.status, frozen: card.frozen,
    spent_total: card.spentTotal, transactions: txns, created_at: card.createdAt
  });
});

// POST /v1/cards/:id/topup — Recargar tarjeta
router.post('/:id/topup', requireAuth, requireKYC, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return error(res, 'amount requerido y mayor que 0', 400);

  const card = await prisma.virtualCard.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
  if (!card) return error(res, 'Tarjeta no encontrada', 404);
  if (card.status !== 'active') return error(res, 'Tarjeta inactiva o cancelada', 400);
  if (card.frozen) return error(res, 'Tarjeta congelada. Descongélala primero.', 400);

  const balanceField = CURRENCY_FIELD[card.currency];
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  if (!wallet || wallet[balanceField] < amount) return error(res, `Saldo ${card.currency} insuficiente`, 422);

  await prisma.$transaction([
    prisma.wallet.update({ where: { userId: req.user.sub }, data: { [balanceField]: { decrement: amount } } }),
    prisma.virtualCard.update({ where: { id: card.id }, data: { balance: { increment: amount } } }),
    prisma.virtualCardTransaction.create({
      data: { id: `ctop_${uuidv4().slice(0, 8)}`, cardId: card.id, type: 'topup', amount }
    })
  ]);

  await triggerWebhook('card.topup', { card_id: card.id, amount, currency: card.currency });

  return success(res, {
    card_id: card.id, label: card.label,
    topup_amount: amount, currency: card.currency,
    new_balance: card.balance + amount
  });
});

// PATCH /v1/cards/:id/freeze — Congelar / descongelar
router.patch('/:id/freeze', requireAuth, async (req, res) => {
  const card = await prisma.virtualCard.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
  if (!card) return error(res, 'Tarjeta no encontrada', 404);
  if (card.status !== 'active') return error(res, 'Tarjeta inactiva o cancelada', 400);

  const updated = await prisma.virtualCard.update({ where: { id: card.id }, data: { frozen: !card.frozen } });
  await triggerWebhook(updated.frozen ? 'card.frozen' : 'card.unfrozen', { card_id: card.id });

  return success(res, {
    card_id: card.id, label: card.label, frozen: updated.frozen,
    message: updated.frozen ? 'Tarjeta congelada. No se pueden realizar pagos.' : 'Tarjeta descongelada. Lista para usar.'
  });
});

// DELETE /v1/cards/:id — Cancelar tarjeta
router.delete('/:id', requireAuth, async (req, res) => {
  const card = await prisma.virtualCard.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
  if (!card) return error(res, 'Tarjeta no encontrada', 404);
  if (card.status === 'cancelled') return error(res, 'La tarjeta ya está cancelada', 400);

  const ops = [prisma.virtualCard.update({ where: { id: card.id }, data: { status: 'cancelled', balance: 0 } })];
  if (card.balance > 0) {
    const balanceField = CURRENCY_FIELD[card.currency];
    ops.push(prisma.wallet.upsert({
      where: { userId: req.user.sub },
      update: { [balanceField]: { increment: card.balance } },
      create: { userId: req.user.sub, [balanceField]: card.balance }
    }));
  }
  await prisma.$transaction(ops);

  await triggerWebhook('card.cancelled', { card_id: card.id, refund: card.balance, currency: card.currency });

  return success(res, {
    card_id: card.id, label: card.label, status: 'cancelled',
    refunded_to_wallet: card.balance, currency: card.currency,
    message: card.balance > 0 ? `Saldo de ${card.balance} ${card.currency} devuelto a tu wallet.` : 'Tarjeta cancelada.'
  });
});

// ── Tarjetas físicas (admin) ─────────────────────────────
const { requireRole } = require('../middleware/auth');

let PHYSICAL_CARDS = [
  {id:'pc-001',user:'Amara Diallo',email:'amara@test.com',country:'GQ',network:'Visa',last4:'4521',status:'activo',limit:500000,currency:'XAF',requested:'2026-05-10',issued:'2026-05-18'},
  {id:'pc-002',user:'Carlos Martínez',email:'carlos@test.com',country:'ES',network:'Mastercard',last4:'7823',status:'activo',limit:2000,currency:'EUR',requested:'2026-05-20',issued:'2026-05-28'},
  {id:'pc-003',user:'Fatou Seck',email:'fatou@test.com',country:'SN',network:'Visa',last4:'3390',status:'bloqueada',limit:250000,currency:'XOF',requested:'2026-04-01',issued:'2026-04-10'},
  {id:'pc-004',user:'Jean-Pierre N.',email:'jp@test.com',country:'CM',network:'Mastercard',last4:'6641',status:'pendiente',limit:300000,currency:'XAF',requested:'2026-06-01',issued:null}
];

// GET /v1/cards/physical
router.get('/physical', requireAuth, requireRole('admin','super_admin','kyc_officer','finance_officer','country_manager','regional_director'), async (req, res) => {
  return success(res, PHYSICAL_CARDS);
});

// POST /v1/cards/physical
router.post('/physical', requireAuth, requireRole('admin','super_admin','kyc_officer','finance_officer'), async (req, res) => {
  const { user, email, country, network, limit, currency } = req.body;
  if (!user || !email || !country) return error(res, 'Faltan campos obligatorios', 400);
  const card = {
    id: 'pc-'+uuidv4().slice(0,8),
    user, email, country,
    network: network||'Visa',
    last4: String(Math.floor(1000+Math.random()*9000)),
    status: 'pendiente',
    limit: limit||100000,
    currency: currency||'XAF',
    requested: new Date().toISOString().split('T')[0],
    issued: null
  };
  PHYSICAL_CARDS.push(card);
  return success(res, card, 201);
});

// PATCH /v1/cards/physical/:id — actualizar estado
router.patch('/physical/:id', requireAuth, requireRole('admin','super_admin','kyc_officer','finance_officer','risk_officer'), async (req, res) => {
  const card = PHYSICAL_CARDS.find(c => c.id === req.params.id);
  if (!card) return error(res, 'Tarjeta no encontrada', 404);
  Object.assign(card, req.body);
  return success(res, card);
});

// PUT /v1/cards/physical/:id/block
router.put('/physical/:id/block', requireAuth, requireRole('admin','super_admin','kyc_officer','finance_officer','risk_officer'), async (req, res) => {
  const card = PHYSICAL_CARDS.find(c => c.id === req.params.id);
  if (!card) return error(res, 'Tarjeta no encontrada', 404);
  card.status = 'bloqueada';
  return success(res, card);
});

// PUT /v1/cards/physical/:id/issue
router.put('/physical/:id/issue', requireAuth, requireRole('admin','super_admin','finance_officer'), async (req, res) => {
  const card = PHYSICAL_CARDS.find(c => c.id === req.params.id);
  if (!card) return error(res, 'Tarjeta no encontrada', 404);
  card.status = 'activo';
  card.issued = new Date().toISOString().split('T')[0];
  return success(res, card);
});

module.exports = router;
