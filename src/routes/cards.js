'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireKYC } = require('../middleware/auth');

function generateCardNumber() {
  const groups = Array.from({ length: 4 }, () =>
    Math.floor(1000 + Math.random() * 9000)
  );
  return groups.join(' ');
}

function generateCVV() {
  return String(Math.floor(100 + Math.random() * 900));
}

function generateExpiry() {
  const now = new Date();
  const year  = now.getFullYear() + 3;
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${month}/${String(year).slice(2)}`;
}

// POST /v1/cards — Crear tarjeta virtual
router.post('/', requireAuth, requireKYC, (req, res) => {
  const { label, currency = 'EUR', initial_load = 0 } = req.body;
  if (!label) return error(res, 'label requerido (ej: "Compras Amazon")', 400);

  const validCurrencies = ['EUR', 'USD'];
  if (!validCurrencies.includes(currency)) {
    return error(res, `Divisa no soportada para tarjetas. Opciones: ${validCurrencies.join(', ')}`, 400);
  }

  const userCards = DB.virtual_cards.filter(c => c.user_id === req.user.sub && c.status === 'active');
  if (userCards.length >= 5) return error(res, 'Límite de 5 tarjetas activas por usuario', 400);

  if (initial_load > 0) {
    const wallet = DB.wallets[req.user.sub];
    const balanceKey = `balance_${currency.toLowerCase()}`;
    if (!wallet || wallet[balanceKey] < initial_load) {
      return error(res, `Saldo ${currency} insuficiente para la carga inicial`, 422);
    }
    wallet[balanceKey] -= initial_load;
  }

  const card = {
    id: `card_${uuidv4().slice(0, 8)}`,
    user_id: req.user.sub,
    label,
    number: generateCardNumber(),
    cvv: generateCVV(),
    expiry: generateExpiry(),
    currency,
    balance: initial_load,
    status: 'active',
    frozen: false,
    spent_total: 0,
    transactions: [],
    created_at: new Date().toISOString()
  };
  DB.virtual_cards.push(card);
  triggerWebhook('card.created', { id: card.id, label, currency, initial_load });

  return success(res, {
    id: card.id,
    label: card.label,
    number: card.number,
    cvv: card.cvv,
    expiry: card.expiry,
    currency: card.currency,
    balance: card.balance,
    status: card.status,
    message: 'Tarjeta virtual creada. Guarda los datos — el CVV no se mostrará de nuevo.',
    created_at: card.created_at
  }, 201);
});

// GET /v1/cards — Listar tarjetas del usuario
router.get('/', requireAuth, (req, res) => {
  const cards = DB.virtual_cards
    .filter(c => c.user_id === req.user.sub)
    .map(c => ({
      id: c.id,
      label: c.label,
      number_masked: `**** **** **** ${c.number.slice(-4)}`,
      expiry: c.expiry,
      currency: c.currency,
      balance: c.balance,
      status: c.status,
      frozen: c.frozen,
      spent_total: c.spent_total,
      created_at: c.created_at
    }));
  return success(res, { cards, total: cards.length });
});

// GET /v1/cards/:id — Detalle de tarjeta
router.get('/:id', requireAuth, (req, res) => {
  const card = DB.virtual_cards.find(c => c.id === req.params.id && c.user_id === req.user.sub);
  if (!card) return error(res, 'Tarjeta no encontrada', 404);

  return success(res, {
    id: card.id,
    label: card.label,
    number_masked: `**** **** **** ${card.number.slice(-4)}`,
    expiry: card.expiry,
    currency: card.currency,
    balance: card.balance,
    status: card.status,
    frozen: card.frozen,
    spent_total: card.spent_total,
    transactions: card.transactions.slice(-10),
    created_at: card.created_at
  });
});

// POST /v1/cards/:id/topup — Recargar tarjeta
router.post('/:id/topup', requireAuth, requireKYC, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return error(res, 'amount requerido y mayor que 0', 400);

  const card = DB.virtual_cards.find(c => c.id === req.params.id && c.user_id === req.user.sub);
  if (!card) return error(res, 'Tarjeta no encontrada', 404);
  if (card.status !== 'active') return error(res, 'Tarjeta inactiva o cancelada', 400);
  if (card.frozen) return error(res, 'Tarjeta congelada. Descongélala primero.', 400);

  const wallet = DB.wallets[req.user.sub];
  const balanceKey = `balance_${card.currency.toLowerCase()}`;
  if (!wallet || wallet[balanceKey] < amount) {
    return error(res, `Saldo ${card.currency} insuficiente`, 422);
  }

  wallet[balanceKey] -= amount;
  card.balance += amount;

  const txn = { id: `ctop_${uuidv4().slice(0, 8)}`, type: 'topup', amount, created_at: new Date().toISOString() };
  card.transactions.push(txn);
  triggerWebhook('card.topup', { card_id: card.id, amount, currency: card.currency });

  return success(res, {
    card_id: card.id,
    label: card.label,
    topup_amount: amount,
    currency: card.currency,
    new_balance: card.balance
  });
});

// PATCH /v1/cards/:id/freeze — Congelar / descongelar
router.patch('/:id/freeze', requireAuth, (req, res) => {
  const card = DB.virtual_cards.find(c => c.id === req.params.id && c.user_id === req.user.sub);
  if (!card) return error(res, 'Tarjeta no encontrada', 404);
  if (card.status !== 'active') return error(res, 'Tarjeta inactiva o cancelada', 400);

  card.frozen = !card.frozen;
  triggerWebhook(card.frozen ? 'card.frozen' : 'card.unfrozen', { card_id: card.id });

  return success(res, {
    card_id: card.id,
    label: card.label,
    frozen: card.frozen,
    message: card.frozen ? 'Tarjeta congelada. No se pueden realizar pagos.' : 'Tarjeta descongelada. Lista para usar.'
  });
});

// DELETE /v1/cards/:id — Cancelar tarjeta
router.delete('/:id', requireAuth, (req, res) => {
  const card = DB.virtual_cards.find(c => c.id === req.params.id && c.user_id === req.user.sub);
  if (!card) return error(res, 'Tarjeta no encontrada', 404);
  if (card.status === 'cancelled') return error(res, 'La tarjeta ya está cancelada', 400);

  // Devolver saldo restante al wallet
  if (card.balance > 0) {
    const wallet = DB.wallets[req.user.sub];
    const balanceKey = `balance_${card.currency.toLowerCase()}`;
    if (wallet) wallet[balanceKey] = (wallet[balanceKey] || 0) + card.balance;
  }

  const refund = card.balance;
  card.status = 'cancelled';
  card.balance = 0;
  card.cancelled_at = new Date().toISOString();
  triggerWebhook('card.cancelled', { card_id: card.id, refund, currency: card.currency });

  return success(res, {
    card_id: card.id,
    label: card.label,
    status: 'cancelled',
    refunded_to_wallet: refund,
    currency: card.currency,
    message: refund > 0 ? `Saldo de ${refund} ${card.currency} devuelto a tu wallet.` : 'Tarjeta cancelada.'
  });
});

module.exports = router;
