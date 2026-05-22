'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, paginate, getRate, calcFee, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireRole, requireKYC } = require('../middleware/auth');

// GET /v1/money/balance
router.get('/balance', requireAuth, requireKYC, (req, res) => {
  const wallet = DB.wallets[req.user.sub];
  if (!wallet) return error(res, 'Wallet no encontrado', 404);
  return success(res, {
    user_id: req.user.sub,
    balances: {
      EUR: { amount: wallet.balance_eur, symbol: '€' },
      USD: { amount: wallet.balance_usd, symbol: '$' },
      XAF: { amount: wallet.balance_xaf, symbol: 'XAF' },
      XOF: { amount: wallet.balance_xof, symbol: 'XOF' }
    },
    updated_at: new Date().toISOString()
  });
});

// GET /v1/money/history
router.get('/history', requireAuth, (req, res) => {
  const { page = 1, limit = 20, type, currency } = req.query;
  let txns = DB.transactions.filter(t => t.user_id === req.user.sub || t.recipient_id === req.user.sub);
  if (type) txns = txns.filter(t => t.type === type);
  if (currency) txns = txns.filter(t => t.currency_sent === currency || t.currency_received === currency);
  txns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return success(res, paginate(txns, page, limit));
});

// POST /v1/money/send — Envío internacional
router.post('/send', requireAuth, requireKYC, (req, res) => {
  const { amount, currency, recipient_id, dest_currency, reference } = req.body;
  if (!amount || !currency || !recipient_id || !dest_currency) {
    return error(res, 'Campos requeridos: amount, currency, recipient_id, dest_currency', 400);
  }
  if (amount <= 0) return error(res, 'El importe debe ser mayor que 0', 400);

  const validCurrencies = ['EUR', 'USD', 'XAF', 'XOF'];
  if (!validCurrencies.includes(currency) || !validCurrencies.includes(dest_currency)) {
    return error(res, `Divisa no soportada. Opciones: ${validCurrencies.join(', ')}`, 400);
  }

  const senderWallet = DB.wallets[req.user.sub];
  const balanceKey = `balance_${currency.toLowerCase()}`;
  if (!senderWallet || senderWallet[balanceKey] < amount) {
    return error(res, 'Saldo insuficiente', 422);
  }

  const recipient = DB.users.find(u => u.id === recipient_id || u.email === recipient_id || u.phone === recipient_id);
  if (!recipient) return error(res, 'Destinatario no encontrado', 404);

  const rate = getRate(currency, dest_currency);
  if (!rate) return error(res, `Par de divisas no soportado: ${currency}/${dest_currency}`, 400);

  const fee = calcFee(amount, 'send');
  const net_amount = amount - fee;
  const amount_received = Math.round(net_amount * rate * 100) / 100;

  senderWallet[balanceKey] -= amount;
  const recipientWallet = DB.wallets[recipient.id] || { balance_eur: 0, balance_usd: 0, balance_xaf: 0, balance_xof: 0 };
  const recvKey = `balance_${dest_currency.toLowerCase()}`;
  recipientWallet[recvKey] = (recipientWallet[recvKey] || 0) + amount_received;
  DB.wallets[recipient.id] = recipientWallet;

  const txn = {
    id: `txn_${uuidv4().slice(0, 8)}`,
    type: 'send',
    user_id: req.user.sub,
    recipient_id: recipient.id,
    amount_sent: amount, currency_sent: currency,
    amount_received, currency_received: dest_currency,
    fee, exchange_rate: rate,
    reference: reference || null,
    status: 'completed',
    created_at: new Date().toISOString()
  };
  DB.transactions.push(txn);
  triggerWebhook('payment.completed', { id: txn.id, type: 'send', amount, currency, recipient_id: recipient.id });

  return success(res, {
    id: txn.id, status: txn.status,
    amount_sent: amount, currency_sent: currency,
    amount_received, currency_received: dest_currency,
    fee, exchange_rate: rate,
    recipient: { id: recipient.id, name: recipient.name },
    estimated_arrival: 'Inmediato',
    created_at: txn.created_at
  });
});

// POST /v1/money/withdraw — Reintegro / Cash-out
router.post('/withdraw', requireAuth, requireKYC, (req, res) => {
  const { amount, currency = 'XAF', method, destination } = req.body;
  if (!amount || !method || !destination) {
    return error(res, 'Campos requeridos: amount, method, destination', 400);
  }

  const validMethods = ['authorized_point', 'mtn_money', 'orange_money', 'bank_transfer'];
  if (!validMethods.includes(method)) {
    return error(res, `Método no válido. Opciones: ${validMethods.join(', ')}`, 400);
  }

  const wallet = DB.wallets[req.user.sub];
  const balanceKey = `balance_${currency.toLowerCase()}`;
  if (!wallet || wallet[balanceKey] < amount) return error(res, 'Saldo insuficiente', 422);

  const fee = calcFee(amount, 'withdraw');
  wallet[balanceKey] -= amount;

  const txn = {
    id: `wth_${uuidv4().slice(0, 8)}`,
    type: 'withdraw',
    user_id: req.user.sub,
    amount, currency, method, destination, fee,
    amount_net: Math.round((amount - fee) * 100) / 100,
    status: 'processing',
    estimated_completion: method === 'authorized_point' ? '15 minutos' : '2-4 horas',
    created_at: new Date().toISOString()
  };
  DB.transactions.push(txn);
  triggerWebhook('withdrawal.completed', { id: txn.id, amount, currency, method });

  return success(res, {
    id: txn.id, status: txn.status,
    amount, currency, fee, amount_net: txn.amount_net,
    method, destination,
    estimated_completion: txn.estimated_completion,
    created_at: txn.created_at
  });
});

// POST /v1/money/transfer — P2P gratuita
router.post('/transfer', requireAuth, requireKYC, (req, res) => {
  const { amount, currency = 'XAF', to_user, note } = req.body;
  if (!amount || !to_user) return error(res, 'Campos requeridos: amount, to_user', 400);

  const recipient = DB.users.find(u => u.id === to_user || u.email === to_user || u.phone === to_user);
  if (!recipient) return error(res, 'Usuario destinatario no encontrado', 404);
  if (recipient.id === req.user.sub) return error(res, 'No puedes transferirte a ti mismo', 400);

  const senderWallet = DB.wallets[req.user.sub];
  const key = `balance_${currency.toLowerCase()}`;
  if (!senderWallet || senderWallet[key] < amount) return error(res, 'Saldo insuficiente', 422);

  senderWallet[key] -= amount;
  const recvWallet = DB.wallets[recipient.id];
  recvWallet[key] = (recvWallet[key] || 0) + amount;

  const txn = {
    id: `p2p_${uuidv4().slice(0, 8)}`,
    type: 'p2p',
    user_id: req.user.sub,
    recipient_id: recipient.id,
    amount, currency, fee: 0,
    note: note || null,
    status: 'completed',
    created_at: new Date().toISOString()
  };
  DB.transactions.push(txn);
  triggerWebhook('transfer.completed', { id: txn.id, amount, currency });

  return success(res, {
    id: txn.id, status: txn.status,
    amount, currency, fee: 0,
    recipient: { id: recipient.id, name: recipient.name },
    note: txn.note, created_at: txn.created_at
  });
});

// POST /v1/money/qr/pay — Pago con QR
router.post('/qr/pay', requireAuth, requireKYC, (req, res) => {
  const { merchant_qr, amount, pin } = req.body;
  if (!merchant_qr || !amount || !pin) {
    return error(res, 'Campos requeridos: merchant_qr, amount, pin', 400);
  }

  const merchant = DB.merchants.find(m => m.qr_code === merchant_qr);
  if (!merchant || !merchant.active) return error(res, 'Código QR inválido o comercio inactivo', 404);
  if (pin.length < 4) return error(res, 'PIN inválido', 401);

  const wallet = DB.wallets[req.user.sub];
  if (!wallet || wallet.balance_xaf < amount) return error(res, 'Saldo insuficiente', 422);

  wallet.balance_xaf -= amount;
  const merchantWallet = DB.wallets[merchant.circular_id];
  if (merchantWallet) merchantWallet.balance_xaf += Math.round(amount * 0.985);

  const txn = {
    id: `qr_${uuidv4().slice(0, 8)}`,
    type: 'qr_payment',
    user_id: req.user.sub,
    merchant_id: merchant.id,
    amount, currency: 'XAF',
    fee: Math.round(amount * 0.015),
    status: 'completed',
    created_at: new Date().toISOString()
  };
  DB.transactions.push(txn);
  triggerWebhook('qr_payment.completed', { id: txn.id, amount, merchant_id: merchant.id });

  return success(res, {
    id: txn.id, status: txn.status,
    amount, currency: 'XAF',
    merchant: { id: merchant.id, name: merchant.name },
    created_at: txn.created_at
  });
});

// POST /v1/money/qr/generate — Generar QR para comercio
router.post('/qr/generate', requireAuth, requireRole('circular_autorizada', 'admin'), (req, res) => {
  const { merchant_id, type = 'static', amount } = req.body;
  if (!merchant_id) return error(res, 'merchant_id requerido', 400);

  const merchant = DB.merchants.find(m => m.id === merchant_id && m.circular_id === req.user.sub);
  if (!merchant) return error(res, 'Comercio no encontrado o sin permisos', 404);

  const qrPayload = {
    qr_id: `QR_${uuidv4().slice(0, 12).toUpperCase()}`,
    merchant_id, merchant_name: merchant.name,
    type,
    amount: type === 'dynamic' ? (amount || null) : null,
    currency: 'XAF',
    expires_at: type === 'dynamic' ? new Date(Date.now() + 3600000).toISOString() : null,
    created_at: new Date().toISOString()
  };

  return success(res, qrPayload, 201);
});

// POST /v1/money/topup — Recarga de saldo
router.post('/topup', requireAuth, requireKYC, (req, res) => {
  const { amount, currency = 'XAF', method, reference } = req.body;
  if (!amount || !method) return error(res, 'Campos requeridos: amount, method', 400);
  if (amount <= 0) return error(res, 'El importe debe ser mayor que 0', 400);

  const validMethods = ['mtn_money', 'orange_money', 'bank_card', 'bank_transfer'];
  if (!validMethods.includes(method)) {
    return error(res, `Método no válido. Opciones: ${validMethods.join(', ')}`, 400);
  }

  const validCurrencies = ['EUR', 'USD', 'XAF', 'XOF'];
  if (!validCurrencies.includes(currency)) {
    return error(res, `Divisa no soportada. Opciones: ${validCurrencies.join(', ')}`, 400);
  }

  const wallet = DB.wallets[req.user.sub];
  if (!wallet) return error(res, 'Wallet no encontrado', 404);

  const balanceKey = `balance_${currency.toLowerCase()}`;
  wallet[balanceKey] = (wallet[balanceKey] || 0) + amount;

  const txn = {
    id: `top_${uuidv4().slice(0, 8)}`,
    type: 'topup',
    user_id: req.user.sub,
    amount, currency, method,
    reference: reference || null,
    status: 'completed',
    created_at: new Date().toISOString()
  };
  DB.transactions.push(txn);
  triggerWebhook('topup.completed', { id: txn.id, amount, currency, method });

  return success(res, {
    id: txn.id, status: txn.status,
    amount, currency, method,
    new_balance: wallet[balanceKey],
    created_at: txn.created_at
  });
});

module.exports = router;
