'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, paginate, getRate, calcFee, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireRole, requireKYC } = require('../middleware/auth');
const { notify } = require('../helpers/notify');
const { iaCode, iaIdClauses } = require('../helpers/iacode');

const { WALLET_LIMITS, CURRENCY_FIELD } = require('../config/walletLimits');
const { syncWalletToSupabase } = require('../helpers/supabaseSync'); // FIX v1: sincronización con Supabase

// GET /v1/money/balance — requiere KYC aprobado
router.get('/balance', requireAuth, requireKYC, async (req, res) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  if (!wallet) return error(res, 'Wallet no encontrado', 404);
  return success(res, {
    user_id: req.user.sub,
    balances: {
      EUR: { amount: wallet.balanceEur, symbol: '€' },
      USD: { amount: wallet.balanceUsd, symbol: '$' },
      XAF: { amount: wallet.balanceXaf, symbol: 'XAF' },
      XOF: { amount: wallet.balanceXof, symbol: 'XOF' }
    },
    updated_at: new Date().toISOString()
  });
});

// GET /v1/money/wallet — saldo en tiempo real sin bloqueo KYC
router.get('/wallet', requireAuth, async (req, res) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  if (!wallet) return error(res, 'Wallet no encontrado', 404);
  return success(res, {
    balanceXaf: wallet.balanceXaf || 0,
    balanceEur: wallet.balanceEur || 0,
    balanceUsd: wallet.balanceUsd || 0,
    balanceXof: wallet.balanceXof || 0,
    updated_at: new Date().toISOString()
  });
});

// GET /v1/money/history
router.get('/history', requireAuth, async (req, res) => {
  const { page = 1, limit = 20, type, currency } = req.query;
  const where = {
    OR: [{ userId: req.user.sub }, { recipientId: req.user.sub }]
  };
  if (type) where.type = type;
  if (currency) where.OR = where.OR.map(c => ({ ...c, currencySent: currency }));

  const txns = await prisma.transaction.findMany({
    where, orderBy: { createdAt: 'desc' }
  });
  return success(res, paginate(txns, page, limit));
});

// GET /v1/money/recipients?q=... — buscar destinatario por código IA, email, teléfono o nombre
// Alimenta el autocompletado de "Enviar dinero" en las apps.
router.get('/recipients', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return success(res, { count: 0, recipients: [] });

    const or = [
      { email: { contains: q, mode: 'insensitive' } },
      { name:  { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } }
    ];
    const idClauses = iaIdClauses(q);
    if (idClauses) or.unshift(...idClauses);

    const rows = await prisma.user.findMany({
      where: { AND: [{ OR: or }, { id: { not: req.user.sub } }] },
      select: { id: true, name: true, email: true, city: true, country: true },
      take: 8
    });
    const recipients = rows.map(u => ({
      id: u.id,
      ia: iaCode(u.id),
      name: u.name,
      email: u.email,
      city: u.city || null,
      country: u.country || null
    }));
    return success(res, { count: recipients.length, recipients });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/money/send — Envío internacional
router.post('/send', requireAuth, requireKYC, async (req, res) => {
  const { amount, currency, dest_currency, reference } = req.body;
  // Acepta el destinatario como recipient_id, recipient_email o recipient (código IA, email, teléfono o id)
  const recipient_ref = req.body.recipient_id || req.body.recipient_email || req.body.recipient;
  if (!amount || !currency || !recipient_ref || !dest_currency) {
    return error(res, 'Campos requeridos: amount, currency, recipient_id, dest_currency', 400);
  }
  if (amount <= 0) return error(res, 'El importe debe ser mayor que 0', 400);

  const validCurrencies = ['EUR', 'USD', 'XAF', 'XOF'];
  if (!validCurrencies.includes(currency) || !validCurrencies.includes(dest_currency)) {
    return error(res, `Divisa no soportada. Opciones: ${validCurrencies.join(', ')}`, 400);
  }

  const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  const balanceField = CURRENCY_FIELD[currency];
  if (!senderWallet || senderWallet[balanceField] < amount) {
    return error(res, 'Saldo insuficiente', 422);
  }

  const recipientOr = [
    { id: recipient_ref },
    { email: { equals: recipient_ref, mode: 'insensitive' } },
    { phone: recipient_ref }
  ];
  const recipIaClauses = iaIdClauses(recipient_ref);
  if (recipIaClauses) recipientOr.unshift(...recipIaClauses);
  const recipient = await prisma.user.findFirst({ where: { OR: recipientOr } });
  if (!recipient) return error(res, 'Destinatario no encontrado', 404);
  if (recipient.id === req.user.sub) return error(res, 'No puedes enviarte dinero a ti mismo', 400);

  const rate = await getRate(currency, dest_currency);
  if (!rate) return error(res, `Par de divisas no soportado: ${currency}/${dest_currency}`, 400);

  const fee = calcFee(amount, 'send');
  const net_amount = amount - fee;
  const amount_received = Math.round(net_amount * rate * 100) / 100;
  const recvField = CURRENCY_FIELD[dest_currency];

  const sendTx = await prisma.$transaction([
    prisma.wallet.update({
      where: { userId: req.user.sub },
      data: { [balanceField]: { decrement: amount } }
    }),
    prisma.wallet.upsert({
      where: { userId: recipient.id },
      update: { [recvField]: { increment: amount_received } },
      create: { userId: recipient.id, [recvField]: amount_received }
    })
  ]);

  // FIX v1: sincronizar ambos wallets (remitente y destinatario) con Supabase
  syncWalletToSupabase(req.user.sub, sendTx[0]).catch(function(){});
  syncWalletToSupabase(recipient.id, sendTx[1]).catch(function(){});

  const txn = await prisma.transaction.create({
    data: {
      id: `txn_${uuidv4().slice(0, 8)}`,
      type: 'send', userId: req.user.sub, recipientId: recipient.id,
      amountSent: amount, currencySent: currency,
      amountReceived: amount_received, currencyReceived: dest_currency,
      fee, exchangeRate: rate, reference: reference || null, status: 'completed'
    }
  });

  await triggerWebhook('payment.completed', { id: txn.id, type: 'send', amount, currency, recipient_id: recipient.id });
  notify(recipient.id, {
    title: 'Dinero recibido',
    body: `Has recibido ${amount_received} ${dest_currency} de un usuario INNOVAAFRIC.`,
    type: 'success', data: { txn_id: txn.id, amount: amount_received, currency: dest_currency }
  });

  return success(res, {
    id: txn.id, status: txn.status,
    amount_sent: amount, currency_sent: currency,
    amount_received, currency_received: dest_currency,
    fee, exchange_rate: rate,
    recipient: { id: recipient.id, name: recipient.name },
    estimated_arrival: 'Inmediato',
    created_at: txn.createdAt
  });
});

// POST /v1/money/withdraw — Reintegro / Cash-out
router.post('/withdraw', requireAuth, requireKYC, async (req, res) => {
  const { amount, currency = 'XAF', method, destination } = req.body;
  if (!amount || !method || !destination) {
    return error(res, 'Campos requeridos: amount, method, destination', 400);
  }

  const validMethods = ['authorized_point', 'mtn_money', 'orange_money', 'bank_transfer'];
  if (!validMethods.includes(method)) {
    return error(res, `Método no válido. Opciones: ${validMethods.join(', ')}`, 400);
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  const balanceField = CURRENCY_FIELD[currency] || 'balanceXaf';
  if (!wallet || wallet[balanceField] < amount) return error(res, 'Saldo insuficiente', 422);

  const fee = calcFee(amount, 'withdraw');
  const amount_net = Math.round((amount - fee) * 100) / 100;

  const [walletAfter, txn] = await prisma.$transaction([
    prisma.wallet.update({ where: { userId: req.user.sub }, data: { [balanceField]: { decrement: amount } } }),
    prisma.transaction.create({
      data: {
        id: `wth_${uuidv4().slice(0, 8)}`,
        type: 'withdraw', userId: req.user.sub,
        amountSent: amount, currencySent: currency, fee, status: 'processing',
        reference: JSON.stringify({ method, destination, amount_net })
      }
    })
  ]);

  // FIX v1: sin esto, el usuario no veía el retiro reflejado en XenderMoney
  syncWalletToSupabase(req.user.sub, walletAfter).catch(function(){});

  await triggerWebhook('withdrawal.completed', { id: txn.id, amount, currency, method });

  return success(res, {
    id: txn.id, status: txn.status,
    amount, currency, fee, amount_net,
    method, destination,
    estimated_completion: method === 'authorized_point' ? '15 minutos' : '2-4 horas',
    created_at: txn.createdAt
  });
});

// POST /v1/money/transfer — P2P gratuita
router.post('/transfer', requireAuth, requireKYC, async (req, res) => {
  const { amount, currency = 'XAF', to_user, note } = req.body;
  if (!amount || !to_user) return error(res, 'Campos requeridos: amount, to_user', 400);

  const recipient = await prisma.user.findFirst({
    where: { OR: [{ id: to_user }, { email: to_user }, { phone: to_user }] }
  });
  if (!recipient) return error(res, 'Usuario destinatario no encontrado', 404);
  if (recipient.id === req.user.sub) return error(res, 'No puedes transferirte a ti mismo', 400);

  const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  const key = CURRENCY_FIELD[currency] || 'balanceXaf';
  if (!senderWallet || senderWallet[key] < amount) return error(res, 'Saldo insuficiente', 422);

  const transferTx = await prisma.$transaction([
    prisma.wallet.update({ where: { userId: req.user.sub }, data: { [key]: { decrement: amount } } }),
    prisma.wallet.upsert({
      where: { userId: recipient.id },
      update: { [key]: { increment: amount } },
      create: { userId: recipient.id, [key]: amount }
    })
  ]);

  // FIX v1: sincronizar ambos wallets con Supabase
  syncWalletToSupabase(req.user.sub, transferTx[0]).catch(function(){});
  syncWalletToSupabase(recipient.id, transferTx[1]).catch(function(){});

  const txn = await prisma.transaction.create({
    data: {
      id: `p2p_${uuidv4().slice(0, 8)}`,
      type: 'p2p', userId: req.user.sub, recipientId: recipient.id,
      amountSent: amount, currencySent: currency, fee: 0, status: 'completed',
      reference: note || null
    }
  });

  await triggerWebhook('transfer.completed', { id: txn.id, amount, currency });
  notify(recipient.id, {
    title: 'Transferencia recibida',
    body: `Has recibido ${amount} ${currency}${note ? ` — "${note}"` : ''}.`,
    type: 'success', data: { txn_id: txn.id, amount, currency }
  });

  return success(res, {
    id: txn.id, status: txn.status, amount, currency, fee: 0,
    recipient: { id: recipient.id, name: recipient.name },
    note: note || null, created_at: txn.createdAt
  });
});

// POST /v1/money/qr/pay — Pago con QR
router.post('/qr/pay', requireAuth, requireKYC, async (req, res) => {
  const { merchant_qr, amount, pin } = req.body;
  if (!merchant_qr || !amount || !pin) {
    return error(res, 'Campos requeridos: merchant_qr, amount, pin', 400);
  }

  const merchant = await prisma.merchant.findFirst({ where: { qrCode: merchant_qr, active: true } });
  if (!merchant) return error(res, 'Código QR inválido o comercio inactivo', 404);
  if (pin.length < 4) return error(res, 'PIN inválido', 401);

  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  if (!wallet || wallet.balanceXaf < amount) return error(res, 'Saldo insuficiente', 422);

  const qrTx = await prisma.$transaction([
    prisma.wallet.update({ where: { userId: req.user.sub }, data: { balanceXaf: { decrement: amount } } }),
    prisma.wallet.upsert({
      where: { userId: merchant.circularId },
      update: { balanceXaf: { increment: Math.round(amount * 0.985) } },
      create: { userId: merchant.circularId, balanceXaf: Math.round(amount * 0.985) }
    })
  ]);

  // FIX v1: sincronizar el wallet del cliente y del comercio
  syncWalletToSupabase(req.user.sub, qrTx[0]).catch(function(){});
  syncWalletToSupabase(merchant.circularId, qrTx[1]).catch(function(){});

  const txn = await prisma.transaction.create({
    data: {
      id: `qr_${uuidv4().slice(0, 8)}`,
      type: 'qr_payment', userId: req.user.sub,
      amountSent: amount, currencySent: 'XAF',
      fee: Math.round(amount * 0.015), status: 'completed',
      reference: merchant.id
    }
  });

  await triggerWebhook('qr_payment.completed', { id: txn.id, amount, merchant_id: merchant.id });

  return success(res, {
    id: txn.id, status: txn.status, amount, currency: 'XAF',
    merchant: { id: merchant.id, name: merchant.name },
    created_at: txn.createdAt
  });
});

// POST /v1/money/qr/generate — Generar QR para comercio
router.post('/qr/generate', requireAuth, requireRole('circular_autorizada', 'admin'), async (req, res) => {
  const { merchant_id, type = 'static', amount } = req.body;
  if (!merchant_id) return error(res, 'merchant_id requerido', 400);

  const merchant = await prisma.merchant.findFirst({ where: { id: merchant_id, circularId: req.user.sub } });
  if (!merchant) return error(res, 'Comercio no encontrado o sin permisos', 404);

  return success(res, {
    qr_id: `QR_${uuidv4().slice(0, 12).toUpperCase()}`,
    merchant_id, merchant_name: merchant.name,
    type, amount: type === 'dynamic' ? (amount || null) : null,
    currency: 'XAF',
    expires_at: type === 'dynamic' ? new Date(Date.now() + 3600000).toISOString() : null,
    created_at: new Date().toISOString()
  }, 201);
});

// POST /v1/money/topup — Recarga de saldo
router.post('/topup', requireAuth, requireKYC, async (req, res) => {
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

  const balanceField = CURRENCY_FIELD[currency];
  const limits = WALLET_LIMITS[currency];

  // Verificar límites de wallet
  if (limits) {
    const currentWallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
    const currentBalance = currentWallet ? (currentWallet[balanceField] || 0) : 0;

    if (currentBalance > limits.reloadThreshold) {
      return error(res, `No puedes recargar todavía. Tu saldo ${currency} es ${currentBalance.toLocaleString()} ${currency}. Podrás recargar cuando baje a ${limits.reloadThreshold.toLocaleString()} ${currency} o menos.`, 422);
    }

    const maxAllowed = limits.cap - currentBalance;
    if (amount > maxAllowed) {
      return error(res, `Importe máximo permitido: ${maxAllowed.toLocaleString()} ${currency} (techo de ${limits.cap.toLocaleString()} ${currency}).`, 422);
    }
  }

  const txnId = `top_${uuidv4().slice(0, 8)}`;

  const [wallet, txn] = await prisma.$transaction([
    prisma.wallet.upsert({
      where: { userId: req.user.sub },
      update: { [balanceField]: { increment: amount } },
      create: { userId: req.user.sub, [balanceField]: amount }
    }),
    prisma.transaction.create({
      data: {
        id: txnId,
        type: 'topup', userId: req.user.sub,
        amountSent: amount, currencySent: currency,
        fee: 0, status: 'completed',
        reference: reference || null
      }
    })
  ]);

  await triggerWebhook('topup.completed', { id: txn.id, amount, currency, method });
  // FIX v1: sin esto, la recarga no se veía en XenderMoney
  syncWalletToSupabase(req.user.sub, wallet).catch(function(){});

  return success(res, {
    id: txn.id, status: txn.status, amount, currency, method,
    new_balance: wallet[balanceField],
    created_at: txn.createdAt
  });
});

module.exports = router;
