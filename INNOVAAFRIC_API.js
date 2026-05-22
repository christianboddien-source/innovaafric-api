/**
 * INNOVAAFRIC — REST API v1.0
 * Node.js + Express
 * Base URL: https://api.innovaafric.com/v1
 *
 * Servicios cubiertos:
 *   - Auth (OAuth 2.0 + API Keys)
 *   - XenderMoney (envío, reintegro, P2P, QR, saldo, historial)
 *   - XenderShop (productos, carrito, pedidos)
 *   - XenderBigShop (catálogo grocery, pedidos express)
 *   - XenderDelivery (tracking, riders, flotas)
 *   - Utilidades (tasas de cambio, webhooks, KYC)
 *
 * Instalación:
 *   npm install express jsonwebtoken bcryptjs uuid cors helmet express-rate-limit dotenv
 *   node INNOVAAFRIC_API.js
 */

'use strict';

const express    = require('express');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'innovaafric_secret_2026';

// ═══════════════════════════════════════════════════════
// MIDDLEWARE GLOBAL
// ═══════════════════════════════════════════════════════

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting: 100 req/min por IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Rate Limited', message: 'Máximo 100 req/min. Intente más tarde.', code: 429 }
});
app.use('/v1', limiter);

// Logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ═══════════════════════════════════════════════════════
// BASE DE DATOS EN MEMORIA (demo — reemplazar por PostgreSQL)
// ═══════════════════════════════════════════════════════

const DB = {
  users: [
    {
      id: 'usr_001', email: 'amara@example.com', name: 'Amara Diallo',
      phone: '+2401234567', country: 'GQ', role: 'customer',
      password_hash: bcrypt.hashSync('pass1234', 10),
      kyc_status: 'verified', created_at: '2026-01-15T10:00:00Z'
    },
    {
      id: 'usr_002', email: 'carlos@circular.com', name: 'Carlos Mbá',
      phone: '+2370987654', country: 'CM', role: 'circular_autorizada',
      password_hash: bcrypt.hashSync('pass5678', 10),
      kyc_status: 'verified', created_at: '2026-02-01T09:00:00Z'
    }
  ],
  wallets: {
    'usr_001': { balance_eur: 250.00, balance_usd: 180.00, balance_xaf: 65000, balance_xof: 0 },
    'usr_002': { balance_eur: 1800.00, balance_usd: 500.00, balance_xaf: 350000, balance_xof: 0 }
  },
  transactions: [],
  products: [
    { id: 'prod_001', name: 'Smartphone Xiaomi A3', price_eur: 189.99, price_xaf: 124699, category: 'electronics', stock: 45, origin: 'China', ce_certified: true, delivery_days: 4 },
    { id: 'prod_002', name: 'Ventilador Solar 20W', price_eur: 49.99, price_xaf: 32791, category: 'energy', stock: 120, origin: 'Vietnam', ce_certified: true, delivery_days: 5 },
    { id: 'prod_003', name: 'Mochila impermeable 30L', price_eur: 34.50, price_xaf: 22635, category: 'accessories', stock: 78, origin: 'China', ce_certified: true, delivery_days: 4 },
    { id: 'prod_004', name: 'Auriculares Bluetooth', price_eur: 25.99, price_xaf: 17054, category: 'electronics', stock: 200, origin: 'China', ce_certified: true, delivery_days: 4 },
    { id: 'prod_005', name: 'Kit herramientas solar', price_eur: 89.00, price_xaf: 58380, category: 'energy', stock: 30, origin: 'India', ce_certified: true, delivery_days: 5 }
  ],
  grocery_products: [
    { id: 'groc_001', name: 'Arroz basmati 5kg', price_xaf: 4500, category: 'cereales', store: 'Supermercado Central', available: true },
    { id: 'groc_002', name: 'Aceite de palma 1L', price_xaf: 1800, category: 'aceites', store: 'Supermercado Central', available: true },
    { id: 'groc_003', name: 'Tomates frescos 1kg', price_xaf: 800, category: 'frutas_verduras', store: 'Mercado Local', available: true },
    { id: 'groc_004', name: 'Leche en polvo 400g', price_xaf: 3200, category: 'lacteos', store: 'Supermercado Central', available: true }
  ],
  orders: [],
  grocery_orders: [],
  deliveries: [],
  riders: [
    { id: 'rider_001', name: 'Jean Pierre Ondo', phone: '+2406543210', zone: 'Malabo Norte', vehicle: 'moto', status: 'available', rating: 4.8, deliveries_total: 342 },
    { id: 'rider_002', name: 'Marie Nguema', phone: '+2406789012', zone: 'Malabo Sur', vehicle: 'bicicleta', status: 'busy', rating: 4.9, deliveries_total: 189 },
    { id: 'rider_003', name: 'Paul Essono', phone: '+2406112233', zone: 'Bata Centro', vehicle: 'moto', status: 'available', rating: 4.7, deliveries_total: 521 }
  ],
  carts: {},
  api_clients: [
    { client_id: 'client_demo', client_secret: bcrypt.hashSync('secret_demo', 10), name: 'Demo App', scopes: ['payments','transfers','qr','shop','delivery'] }
  ],
  merchants: [
    { id: 'merch_001', name: 'Tienda El Progreso', circular_id: 'usr_002', qr_code: 'QR_MERCH_001', active: true }
  ],
  webhooks: [],
  exchange_rates: {
    'EUR-XAF': 655.957, 'EUR-XOF': 655.957, 'EUR-USD': 1.08,
    'USD-XAF': 607.36,  'USD-XOF': 607.36,  'USD-EUR': 0.926,
    'XAF-EUR': 0.00152, 'XOF-EUR': 0.00152
  }
};

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function success(res, data, code = 200) {
  return res.status(code).json({ success: true, data, timestamp: new Date().toISOString() });
}

function error(res, message, code = 400, details = null) {
  return res.status(code).json({ success: false, error: { code, message, details }, timestamp: new Date().toISOString() });
}

function paginate(array, page = 1, limit = 20) {
  const p = Math.max(1, parseInt(page));
  const l = Math.min(100, Math.max(1, parseInt(limit)));
  const start = (p - 1) * l;
  return {
    items: array.slice(start, start + l),
    pagination: { page: p, limit: l, total: array.length, pages: Math.ceil(array.length / l) }
  };
}

function getRate(from, to) {
  if (from === to) return 1;
  return DB.exchange_rates[`${from}-${to}`] || null;
}

function calcFee(amount, type = 'send') {
  const feeRates = { send: 0.02, withdraw: 0.015, p2p: 0 };
  return Math.round((amount * (feeRates[type] || 0.02)) * 100) / 100;
}

// Simular envío de webhook
function triggerWebhook(event, data) {
  const payload = { event, data, timestamp: new Date().toISOString(), id: uuidv4() };
  DB.webhooks.push(payload);
  console.log(`[WEBHOOK] ${event}:`, JSON.stringify(data).slice(0, 80));
}

// ═══════════════════════════════════════════════════════
// MIDDLEWARES DE AUTENTICACIÓN
// ═══════════════════════════════════════════════════════

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return error(res, 'Token requerido', 401);

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return error(res, 'Token inválido o expirado', 401);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return error(res, 'Permisos insuficientes', 403);
    }
    next();
  };
}

function requireKYC(req, res, next) {
  const user = DB.users.find(u => u.id === req.user.sub);
  if (!user || user.kyc_status !== 'verified') {
    return error(res, 'KYC no verificado. Complete la verificación de identidad.', 403);
  }
  next();
}

// ═══════════════════════════════════════════════════════
// ROUTER PRINCIPAL
// ═══════════════════════════════════════════════════════

const v1 = express.Router();

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

// POST /v1/auth/token — OAuth 2.0 client_credentials
v1.post('/auth/token', (req, res) => {
  const { grant_type, client_id, client_secret, scope } = req.body;

  if (grant_type === 'client_credentials') {
    const client = DB.api_clients.find(c => c.client_id === client_id);
    if (!client || !bcrypt.compareSync(client_secret, client.client_secret)) {
      return error(res, 'Credenciales de cliente inválidas', 401);
    }
    const requestedScopes = scope ? scope.split(' ') : client.scopes;
    const token = jwt.sign(
      { sub: client_id, type: 'client', scopes: requestedScopes },
      JWT_SECRET, { expiresIn: '1h' }
    );
    return success(res, { access_token: token, token_type: 'Bearer', expires_in: 3600, scope: requestedScopes.join(' ') });
  }

  if (grant_type === 'password') {
    const { email, password } = req.body;
    const user = DB.users.find(u => u.email === email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return error(res, 'Email o contraseña incorrectos', 401);
    }
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, country: user.country },
      JWT_SECRET, { expiresIn: '8h' }
    );
    const refresh = jwt.sign({ sub: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
    return success(res, {
      access_token: token, refresh_token: refresh,
      token_type: 'Bearer', expires_in: 28800,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, kyc_status: user.kyc_status }
    });
  }

  return error(res, 'grant_type no soportado. Use client_credentials o password', 400);
});

// POST /v1/auth/refresh
v1.post('/auth/refresh', (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return error(res, 'refresh_token requerido', 400);
  try {
    const payload = jwt.verify(refresh_token, JWT_SECRET);
    const user = DB.users.find(u => u.id === payload.sub);
    if (!user) return error(res, 'Usuario no encontrado', 404);
    const newToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, country: user.country },
      JWT_SECRET, { expiresIn: '8h' }
    );
    return success(res, { access_token: newToken, token_type: 'Bearer', expires_in: 28800 });
  } catch {
    return error(res, 'refresh_token inválido o expirado', 401);
  }
});

// POST /v1/auth/register
v1.post('/auth/register', (req, res) => {
  const { name, email, phone, password, country, role = 'customer' } = req.body;
  if (!name || !email || !phone || !password || !country) {
    return error(res, 'Campos requeridos: name, email, phone, password, country', 400);
  }
  if (DB.users.find(u => u.email === email)) {
    return error(res, 'El email ya está registrado', 409);
  }
  const validRoles = ['customer', 'circular_autorizada', 'rider', 'supplier'];
  if (!validRoles.includes(role)) return error(res, `Rol inválido. Opciones: ${validRoles.join(', ')}`, 400);

  const user = {
    id: `usr_${uuidv4().slice(0,8)}`,
    name, email, phone, country,
    role,
    password_hash: bcrypt.hashSync(password, 10),
    kyc_status: 'pending',
    created_at: new Date().toISOString()
  };
  DB.users.push(user);
  DB.wallets[user.id] = { balance_eur: 0, balance_usd: 0, balance_xaf: 0, balance_xof: 0 };
  triggerWebhook('user.registered', { id: user.id, email, role, country });
  return success(res, {
    id: user.id, name, email, role,
    kyc_status: 'pending',
    message: 'Cuenta creada. Complete la verificación KYC para activar pagos.'
  }, 201);
});

// POST /v1/auth/kyc
v1.post('/auth/kyc', requireAuth, (req, res) => {
  const { document_type, document_number, selfie_url } = req.body;
  if (!document_type || !document_number) {
    return error(res, 'document_type y document_number requeridos', 400);
  }
  const user = DB.users.find(u => u.id === req.user.sub);
  if (!user) return error(res, 'Usuario no encontrado', 404);
  user.kyc_status = 'under_review';
  user.kyc_document = { type: document_type, number: document_number, submitted_at: new Date().toISOString() };
  // En producción: integrar con proveedor KYC (Onfido, Jumio, etc.)
  triggerWebhook('kyc.submitted', { user_id: user.id, document_type });
  return success(res, { status: 'under_review', message: 'Documentación recibida. Revisión en 24-48h.' });
});

// ─────────────────────────────────────────────
// XENDERMONEY — WALLET & SALDO
// ─────────────────────────────────────────────

// GET /v1/money/balance
v1.get('/money/balance', requireAuth, requireKYC, (req, res) => {
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
v1.get('/money/history', requireAuth, (req, res) => {
  const { page = 1, limit = 20, type, currency } = req.query;
  let txns = DB.transactions.filter(t => t.user_id === req.user.sub || t.recipient_id === req.user.sub);
  if (type) txns = txns.filter(t => t.type === type);
  if (currency) txns = txns.filter(t => t.currency_sent === currency || t.currency_received === currency);
  txns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const result = paginate(txns, page, limit);
  return success(res, result);
});

// POST /v1/money/send — Envío internacional
v1.post('/money/send', requireAuth, requireKYC, (req, res) => {
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

  // Actualizar balances
  senderWallet[balanceKey] -= amount;
  const recipientWallet = DB.wallets[recipient.id] || { balance_eur: 0, balance_usd: 0, balance_xaf: 0, balance_xof: 0 };
  const recvKey = `balance_${dest_currency.toLowerCase()}`;
  recipientWallet[recvKey] = (recipientWallet[recvKey] || 0) + amount_received;
  DB.wallets[recipient.id] = recipientWallet;

  const txn = {
    id: `txn_${uuidv4().slice(0,8)}`,
    type: 'send',
    user_id: req.user.sub,
    recipient_id: recipient.id,
    amount_sent: amount,
    currency_sent: currency,
    amount_received,
    currency_received: dest_currency,
    fee,
    exchange_rate: rate,
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
v1.post('/money/withdraw', requireAuth, requireKYC, (req, res) => {
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
    id: `wth_${uuidv4().slice(0,8)}`,
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

// POST /v1/money/transfer — Transferencia P2P gratuita
v1.post('/money/transfer', requireAuth, requireKYC, (req, res) => {
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
    id: `p2p_${uuidv4().slice(0,8)}`,
    type: 'p2p',
    user_id: req.user.sub,
    recipient_id: recipient.id,
    amount, currency,
    fee: 0, note: note || null,
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
v1.post('/money/qr/pay', requireAuth, requireKYC, (req, res) => {
  const { merchant_qr, amount, pin } = req.body;
  if (!merchant_qr || !amount || !pin) {
    return error(res, 'Campos requeridos: merchant_qr, amount, pin', 400);
  }

  const merchant = DB.merchants.find(m => m.qr_code === merchant_qr);
  if (!merchant || !merchant.active) return error(res, 'Código QR inválido o comercio inactivo', 404);

  // En producción: verificar PIN contra hash almacenado
  if (pin.length < 4) return error(res, 'PIN inválido', 401);

  const wallet = DB.wallets[req.user.sub];
  if (!wallet || wallet.balance_xaf < amount) return error(res, 'Saldo insuficiente', 422);

  wallet.balance_xaf -= amount;
  const merchantWallet = DB.wallets[merchant.circular_id];
  if (merchantWallet) merchantWallet.balance_xaf += Math.round(amount * 0.985); // Comisión 1.5%

  const txn = {
    id: `qr_${uuidv4().slice(0,8)}`,
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
v1.post('/money/qr/generate', requireAuth, requireRole('circular_autorizada', 'admin'), (req, res) => {
  const { merchant_id, type = 'static', amount } = req.body;
  if (!merchant_id) return error(res, 'merchant_id requerido', 400);

  const merchant = DB.merchants.find(m => m.id === merchant_id && m.circular_id === req.user.sub);
  if (!merchant) return error(res, 'Comercio no encontrado o sin permisos', 404);

  const qrPayload = {
    qr_id: `QR_${uuidv4().slice(0,12).toUpperCase()}`,
    merchant_id, merchant_name: merchant.name,
    type,
    amount: type === 'dynamic' ? amount || null : null,
    currency: 'XAF',
    expires_at: type === 'dynamic' ? new Date(Date.now() + 3600000).toISOString() : null,
    created_at: new Date().toISOString()
  };

  return success(res, qrPayload, 201);
});

// ─────────────────────────────────────────────
// XENDERSHOP — PRODUCTOS Y PEDIDOS
// ─────────────────────────────────────────────

// GET /v1/shop/products
v1.get('/shop/products', (req, res) => {
  const { category, min_price, max_price, page = 1, limit = 20, q } = req.query;
  let products = [...DB.products];

  if (category) products = products.filter(p => p.category === category);
  if (min_price) products = products.filter(p => p.price_eur >= parseFloat(min_price));
  if (max_price) products = products.filter(p => p.price_eur <= parseFloat(max_price));
  if (q) products = products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));

  const result = paginate(products, page, limit);
  return success(res, result);
});

// GET /v1/shop/products/:id
v1.get('/shop/products/:id', (req, res) => {
  const product = DB.products.find(p => p.id === req.params.id);
  if (!product) return error(res, 'Producto no encontrado', 404);
  return success(res, product);
});

// POST /v1/shop/cart — Añadir al carrito
v1.post('/shop/cart', requireAuth, (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  if (!product_id) return error(res, 'product_id requerido', 400);

  const product = DB.products.find(p => p.id === product_id);
  if (!product) return error(res, 'Producto no encontrado', 404);
  if (product.stock < quantity) return error(res, 'Stock insuficiente', 422);

  if (!DB.carts[req.user.sub]) DB.carts[req.user.sub] = [];
  const cart = DB.carts[req.user.sub];
  const existing = cart.find(i => i.product_id === product_id);

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ product_id, quantity, price_eur: product.price_eur, price_xaf: product.price_xaf, name: product.name });
  }

  const total_eur = cart.reduce((s, i) => s + i.price_eur * i.quantity, 0);
  const total_xaf = cart.reduce((s, i) => s + i.price_xaf * i.quantity, 0);

  return success(res, { items: cart, total_eur: Math.round(total_eur * 100) / 100, total_xaf, item_count: cart.length });
});

// GET /v1/shop/cart
v1.get('/shop/cart', requireAuth, (req, res) => {
  const cart = DB.carts[req.user.sub] || [];
  const total_eur = cart.reduce((s, i) => s + i.price_eur * i.quantity, 0);
  const total_xaf = cart.reduce((s, i) => s + i.price_xaf * i.quantity, 0);
  return success(res, { items: cart, total_eur: Math.round(total_eur * 100) / 100, total_xaf, item_count: cart.length });
});

// POST /v1/shop/orders — Crear pedido
v1.post('/shop/orders', requireAuth, requireKYC, (req, res) => {
  const { payment_currency = 'EUR', delivery_address, notes } = req.body;
  const cart = DB.carts[req.user.sub];
  if (!cart || cart.length === 0) return error(res, 'El carrito está vacío', 400);
  if (!delivery_address) return error(res, 'delivery_address requerido', 400);

  const total_eur = Math.round(cart.reduce((s, i) => s + i.price_eur * i.quantity, 0) * 100) / 100;
  const total_xaf = cart.reduce((s, i) => s + i.price_xaf * i.quantity, 0);
  const wallet = DB.wallets[req.user.sub];
  const payKey = `balance_${payment_currency.toLowerCase()}`;
  const payAmount = payment_currency === 'EUR' ? total_eur : total_xaf;

  if (!wallet || wallet[payKey] < payAmount) return error(res, 'Saldo insuficiente para el pago', 422);

  wallet[payKey] -= payAmount;

  const order = {
    id: `ord_${uuidv4().slice(0,8)}`,
    user_id: req.user.sub,
    items: [...cart],
    total_eur, total_xaf,
    payment_currency, payment_amount: payAmount,
    delivery_address,
    notes: notes || null,
    status: 'confirmed',
    estimated_delivery: `${4}-${5} días hábiles`,
    tracking_id: `TRK_${uuidv4().slice(0,10).toUpperCase()}`,
    hub_location: 'Valencia, España',
    ce_certified: true,
    created_at: new Date().toISOString()
  };
  DB.orders.push(order);
  DB.carts[req.user.sub] = []; // Vaciar carrito
  triggerWebhook('order.created', { id: order.id, total_eur, items_count: order.items.length });

  return success(res, order, 201);
});

// GET /v1/shop/orders
v1.get('/shop/orders', requireAuth, (req, res) => {
  const orders = DB.orders.filter(o => o.user_id === req.user.sub);
  orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return success(res, paginate(orders, req.query.page, req.query.limit));
});

// GET /v1/shop/orders/:id
v1.get('/shop/orders/:id', requireAuth, (req, res) => {
  const order = DB.orders.find(o => o.id === req.params.id && o.user_id === req.user.sub);
  if (!order) return error(res, 'Pedido no encontrado', 404);
  return success(res, order);
});

// ─────────────────────────────────────────────
// XENDERBIGSHOP — GROCERY
// ─────────────────────────────────────────────

// GET /v1/bigshop/products
v1.get('/bigshop/products', (req, res) => {
  const { category, store, q } = req.query;
  let products = DB.grocery_products.filter(p => p.available);
  if (category) products = products.filter(p => p.category === category);
  if (store) products = products.filter(p => p.store.includes(store));
  if (q) products = products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  return success(res, { items: products, total: products.length, delivery_time: 'Menos de 30 minutos' });
});

// POST /v1/bigshop/orders — Pedido grocery express
v1.post('/bigshop/orders', requireAuth, (req, res) => {
  const { items, delivery_address, notes } = req.body;
  if (!items || items.length === 0) return error(res, 'items requerido (array de {product_id, quantity})', 400);
  if (!delivery_address) return error(res, 'delivery_address requerido', 400);

  const orderItems = [];
  let total_xaf = 0;

  for (const item of items) {
    const product = DB.grocery_products.find(p => p.id === item.product_id && p.available);
    if (!product) return error(res, `Producto ${item.product_id} no disponible`, 404);
    const qty = item.quantity || 1;
    orderItems.push({ ...product, quantity: qty, subtotal: product.price_xaf * qty });
    total_xaf += product.price_xaf * qty;
  }

  const wallet = DB.wallets[req.user.sub];
  if (!wallet || wallet.balance_xaf < total_xaf) return error(res, 'Saldo XAF insuficiente', 422);
  wallet.balance_xaf -= total_xaf;

  const assigned_rider = DB.riders.find(r => r.status === 'available');
  if (assigned_rider) assigned_rider.status = 'busy';

  const gorder = {
    id: `groc_${uuidv4().slice(0,8)}`,
    user_id: req.user.sub,
    items: orderItems, total_xaf, notes,
    delivery_address,
    rider: assigned_rider ? { id: assigned_rider.id, name: assigned_rider.name, phone: assigned_rider.phone } : null,
    status: 'preparing',
    estimated_delivery: '25-30 minutos',
    created_at: new Date().toISOString()
  };
  DB.grocery_orders.push(gorder);
  triggerWebhook('order.created', { id: gorder.id, type: 'grocery', total_xaf });

  return success(res, gorder, 201);
});

// ─────────────────────────────────────────────
// XENDERDELIVERY — TRACKING Y RIDERS
// ─────────────────────────────────────────────

// GET /v1/delivery/track/:tracking_id
v1.get('/delivery/track/:tracking_id', (req, res) => {
  const order = DB.orders.find(o => o.tracking_id === req.params.tracking_id);
  if (!order) return error(res, 'Tracking ID no encontrado', 404);

  const statusFlow = ['confirmed', 'processing_hub', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered'];
  const currentIdx = Math.min(2, statusFlow.length - 1); // demo

  return success(res, {
    tracking_id: order.tracking_id,
    order_id: order.id,
    status: statusFlow[currentIdx],
    status_history: statusFlow.slice(0, currentIdx + 1).map((s, i) => ({
      status: s, timestamp: new Date(Date.now() - (currentIdx - i) * 86400000).toISOString()
    })),
    current_location: { hub: 'Valencia, España', lat: 39.4699, lng: -0.3763 },
    estimated_delivery: order.estimated_delivery,
    ce_certified: true,
    updated_at: new Date().toISOString()
  });
});

// GET /v1/delivery/riders — Listar riders disponibles
v1.get('/delivery/riders', requireAuth, requireRole('circular_autorizada', 'admin'), (req, res) => {
  const { zone, status } = req.query;
  let riders = [...DB.riders];
  if (zone) riders = riders.filter(r => r.zone.toLowerCase().includes(zone.toLowerCase()));
  if (status) riders = riders.filter(r => r.status === status);
  return success(res, { riders, total: riders.length });
});

// POST /v1/delivery/riders — Registrar nuevo rider
v1.post('/delivery/riders', requireAuth, (req, res) => {
  const { name, phone, zone, vehicle } = req.body;
  if (!name || !phone || !zone || !vehicle) {
    return error(res, 'Campos requeridos: name, phone, zone, vehicle', 400);
  }
  const validVehicles = ['moto', 'bicicleta', 'coche', 'furgoneta'];
  if (!validVehicles.includes(vehicle)) return error(res, `Vehículo no válido: ${validVehicles.join(', ')}`, 400);

  const rider = {
    id: `rider_${uuidv4().slice(0,8)}`,
    name, phone, zone, vehicle,
    status: 'pending_approval',
    rating: null, deliveries_total: 0,
    registered_by: req.user.sub,
    created_at: new Date().toISOString()
  };
  DB.riders.push(rider);
  triggerWebhook('rider.registered', { id: rider.id, zone, vehicle });
  return success(res, rider, 201);
});

// PUT /v1/delivery/riders/:id/status — Cambiar estado de rider
v1.put('/delivery/riders/:id/status', requireAuth, (req, res) => {
  const rider = DB.riders.find(r => r.id === req.params.id);
  if (!rider) return error(res, 'Rider no encontrado', 404);
  const { status } = req.body;
  const validStatuses = ['available', 'busy', 'offline'];
  if (!validStatuses.includes(status)) return error(res, `Status inválido: ${validStatuses.join(', ')}`, 400);
  rider.status = status;
  rider.updated_at = new Date().toISOString();
  return success(res, rider);
});

// GET /v1/delivery/orders/:id — Detalle entrega
v1.get('/delivery/orders/:id', requireAuth, (req, res) => {
  const order = DB.orders.find(o => o.id === req.params.id) ||
                DB.grocery_orders.find(o => o.id === req.params.id);
  if (!order) return error(res, 'Pedido no encontrado', 404);
  return success(res, order);
});

// POST /v1/delivery/orders/:id/confirm — Confirmar entrega con foto
v1.post('/delivery/orders/:id/confirm', requireAuth, (req, res) => {
  const { photo_url, signature_url, notes } = req.body;
  const order = DB.orders.find(o => o.id === req.params.id) ||
                DB.grocery_orders.find(o => o.id === req.params.id);
  if (!order) return error(res, 'Pedido no encontrado', 404);

  order.status = 'delivered';
  order.delivery_proof = {
    photo_url: photo_url || null,
    signature_url: signature_url || null,
    notes: notes || null,
    delivered_at: new Date().toISOString(),
    rider_id: req.user.sub
  };
  triggerWebhook('order.delivered', { id: order.id, delivered_at: order.delivery_proof.delivered_at });
  return success(res, { id: order.id, status: 'delivered', delivery_proof: order.delivery_proof });
});

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────

// GET /v1/utils/rates — Tasas de cambio
v1.get('/utils/rates', (req, res) => {
  const { from, to } = req.query;
  if (from && to) {
    const rate = getRate(from.toUpperCase(), to.toUpperCase());
    if (!rate) return error(res, `Par ${from}/${to} no disponible`, 404);
    return success(res, { from: from.toUpperCase(), to: to.toUpperCase(), rate, fee_pct: 2, updated_at: new Date().toISOString() });
  }
  return success(res, { rates: DB.exchange_rates, updated_at: new Date().toISOString(), source: 'BCEAO + mercado' });
});

// GET /v1/utils/convert — Calculadora de conversión
v1.get('/utils/convert', (req, res) => {
  const { amount = 100, from = 'EUR', to = 'XAF' } = req.query;
  const rate = getRate(from.toUpperCase(), to.toUpperCase());
  if (!rate) return error(res, `Par ${from}/${to} no disponible`, 404);
  const fee = calcFee(parseFloat(amount), 'send');
  const net = parseFloat(amount) - fee;
  return success(res, {
    amount_sent: parseFloat(amount),
    currency_sent: from.toUpperCase(),
    fee, net_amount: net,
    rate,
    amount_received: Math.round(net * rate * 100) / 100,
    currency_received: to.toUpperCase(),
    fee_pct: '2%',
    estimated_time: 'Inmediato'
  });
});

// POST /v1/utils/webhooks/register — Registrar endpoint webhook
v1.post('/utils/webhooks/register', requireAuth, (req, res) => {
  const { url, events } = req.body;
  if (!url || !events || events.length === 0) return error(res, 'url y events requeridos', 400);
  const wh = {
    id: `wh_${uuidv4().slice(0,8)}`,
    user_id: req.user.sub, url, events,
    secret: `whs_${uuidv4().replace(/-/g,'')}`,
    active: true,
    created_at: new Date().toISOString()
  };
  return success(res, { ...wh, message: 'Guarda el secret — solo visible una vez' }, 201);
});

// GET /v1/utils/webhooks/events — Últimos eventos webhook (demo)
v1.get('/utils/webhooks/events', requireAuth, (req, res) => {
  const events = DB.webhooks.slice(-20).reverse();
  return success(res, { events, total: DB.webhooks.length });
});

// GET /v1/utils/health — Health check
v1.get('/utils/health', (_req, res) => {
  return res.status(200).json({
    status: 'healthy',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    services: {
      xenderMoney: 'operational',
      xenderShop: 'operational',
      xenderBigShop: 'operational',
      xenderDelivery: 'operational'
    }
  });
});

// ─────────────────────────────────────────────
// ADMIN (solo role admin)
// ─────────────────────────────────────────────

// GET /v1/admin/stats
v1.get('/admin/stats', requireAuth, requireRole('admin'), (req, res) => {
  return success(res, {
    users: { total: DB.users.length, by_role: DB.users.reduce((acc, u) => { acc[u.role] = (acc[u.role]||0)+1; return acc; }, {}) },
    transactions: { total: DB.transactions.length, total_volume_eur: DB.transactions.filter(t=>t.currency_sent==='EUR').reduce((s,t)=>s+t.amount_sent,0) },
    orders: { shop: DB.orders.length, grocery: DB.grocery_orders.length },
    riders: { total: DB.riders.length, available: DB.riders.filter(r=>r.status==='available').length }
  });
});

// ─────────────────────────────────────────────
// MONTAJE Y ERROR HANDLERS
// ─────────────────────────────────────────────

app.use('/v1', v1);

// 404 global
app.use((_req, res) => {
  error(res, 'Endpoint no encontrado. Consulta la documentación en https://api.innovaafric.com/docs', 404);
});

// Error handler global
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  error(res, 'Error interno del servidor', 500);
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   INNOVAAFRIC API v1.0 — Running           ║
║   http://localhost:${PORT}/v1               ║
║                                            ║
║   Endpoints principales:                   ║
║   POST /v1/auth/token                      ║
║   POST /v1/auth/register                   ║
║   GET  /v1/money/balance                   ║
║   POST /v1/money/send                      ║
║   POST /v1/money/withdraw                  ║
║   POST /v1/money/transfer                  ║
║   POST /v1/money/qr/pay                    ║
║   GET  /v1/shop/products                   ║
║   POST /v1/shop/orders                     ║
║   GET  /v1/bigshop/products               ║
║   POST /v1/bigshop/orders                  ║
║   GET  /v1/delivery/track/:id             ║
║   GET  /v1/utils/rates                     ║
║   GET  /v1/utils/health                    ║
╚════════════════════════════════════════════╝
  `);
});

module.exports = app;
