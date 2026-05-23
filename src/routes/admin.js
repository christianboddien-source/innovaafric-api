'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const prisma  = require('../config/prisma');
const { success, error, paginate } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const CF = { EUR: 'balanceEur', USD: 'balanceUsd', XAF: 'balanceXaf', XOF: 'balanceXof' };

// ══════════════════════════════════════════════════════
//  ESTADÍSTICAS GLOBALES
// ══════════════════════════════════════════════════════
router.get('/stats', requireAuth, requireRole('admin'), async (req, res) => {
  const now     = new Date();
  const last24h = new Date(now - 86400000);
  const last30d = new Date(now - 30 * 86400000);

  const [
    users, totalTxns, txns24h, txns30d,
    shopOrders, groceryOrders,
    riders, bizAccounts, invoices, bulkPayments,
    loyaltyAccounts, tontines, notifications
  ] = await Promise.all([
    prisma.user.findMany({ select: { role: true, kycStatus: true } }),
    prisma.transaction.findMany({ select: { type: true, currencySent: true, amountSent: true } }),
    prisma.transaction.count({ where: { createdAt: { gte: last24h } } }),
    prisma.transaction.count({ where: { createdAt: { gte: last30d } } }),
    prisma.order.findMany({ select: { status: true } }),
    prisma.groceryOrder.count(),
    prisma.rider.findMany({ select: { status: true } }),
    prisma.businessAccount.count(),
    prisma.invoice.findMany({ select: { status: true } }),
    prisma.bulkPayment.count(),
    prisma.loyaltyAccount.aggregate({ _sum: { totalEarned: true }, _count: { id: true } }),
    prisma.tontine.findMany({ select: { status: true } }),
    prisma.notification.aggregate({ _count: { id: true }, where: { read: false } })
  ]);
  const totalNotifs = await prisma.notification.count();

  return success(res, {
    timestamp: now.toISOString(),
    users: {
      total: users.length,
      by_role: users.reduce((a, u) => { a[u.role] = (a[u.role] || 0) + 1; return a; }, {}),
      kyc_verified: users.filter(u => u.kycStatus === 'verified').length,
      kyc_pending:  users.filter(u => u.kycStatus === 'pending').length
    },
    transactions: {
      total: totalTxns.length, last_24h: txns24h, last_30d: txns30d,
      volume_eur_total: totalTxns.filter(t => t.currencySent === 'EUR').reduce((s, t) => s + (t.amountSent || 0), 0),
      volume_xaf_total: totalTxns.filter(t => t.currencySent === 'XAF').reduce((s, t) => s + (t.amountSent || 0), 0),
      by_type: totalTxns.reduce((a, t) => { a[t.type] = (a[t.type] || 0) + 1; return a; }, {})
    },
    orders: {
      shop_total: shopOrders.length, grocery_total: groceryOrders,
      by_status: shopOrders.reduce((a, o) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {})
    },
    riders: {
      total: riders.length,
      available: riders.filter(r => r.status === 'available').length,
      busy:      riders.filter(r => r.status === 'busy').length
    },
    business: {
      accounts: bizAccounts,
      invoices_total: invoices.length,
      invoices_paid:  invoices.filter(i => i.status === 'paid').length,
      bulk_payments:  bulkPayments
    },
    loyalty: {
      users_with_points:  loyaltyAccounts._count.id,
      total_points_issued: loyaltyAccounts._sum.totalEarned || 0
    },
    tontines:      { total: tontines.length, active: tontines.filter(t => t.status === 'active').length },
    notifications: { total: totalNotifs, unread: notifications._count.id }
  });
});

// ══════════════════════════════════════════════════════
//  USUARIOS — CRUD COMPLETO
// ══════════════════════════════════════════════════════

// GET /v1/admin/users — Listar
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { page = 1, limit = 50, role, kyc_status, country } = req.query;
  const where = {};
  if (role)       where.role = role;
  if (kyc_status) where.kycStatus = kyc_status;
  if (country)    where.country = country.toUpperCase();

  const users = await prisma.user.findMany({
    where, orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, email: true, phone: true, country: true, role: true, kycStatus: true, createdAt: true }
  });
  return success(res, paginate(users, page, limit));
});

// GET /v1/admin/users/:id — Detalle con wallet
router.get('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { wallet: true }
  });
  if (!user) return error(res, 'Usuario no encontrado', 404);
  const { passwordHash, ...safe } = user;
  return success(res, safe);
});

// POST /v1/admin/users — Crear
router.post('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, email, phone, password, country, role = 'customer' } = req.body;
  if (!name || !email || !phone || !password || !country)
    return error(res, 'Campos requeridos: name, email, phone, password, country', 400);

  const validRoles = ['customer', 'admin', 'circular_autorizada', 'rider'];
  if (!validRoles.includes(role)) return error(res, `Rol inválido: ${validRoles.join(', ')}`, 400);

  if (await prisma.user.findUnique({ where: { email } }))
    return error(res, 'Email ya registrado', 409);

  const user = await prisma.user.create({
    data: {
      id: `usr_${uuidv4().slice(0, 8)}`,
      name, email, phone,
      country: country.toUpperCase(), role,
      passwordHash: await bcrypt.hash(password, 10),
      kycStatus: 'pending'
    }
  });
  await prisma.wallet.create({
    data: { userId: user.id, balanceEur: 0, balanceUsd: 0, balanceXaf: 0, balanceXof: 0 }
  });
  const { passwordHash, ...safe } = user;
  return success(res, safe, 201);
});

// PUT /v1/admin/users/:id — Editar
router.put('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return error(res, 'Usuario no encontrado', 404);

  const { name, phone, country, role, kycStatus, password } = req.body;
  const validRoles = ['customer', 'admin', 'circular_autorizada', 'rider'];
  if (role && !validRoles.includes(role)) return error(res, 'Rol inválido', 400);

  const data = {};
  if (name)      data.name = name;
  if (phone)     data.phone = phone;
  if (country)   data.country = country.toUpperCase();
  if (role)      data.role = role;
  if (kycStatus) data.kycStatus = kycStatus;
  if (password)  data.passwordHash = await bcrypt.hash(password, 10);

  const updated = await prisma.user.update({ where: { id: req.params.id }, data });
  const { passwordHash, ...safe } = updated;
  return success(res, safe);
});

// DELETE /v1/admin/users/:id — Eliminar
router.delete('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return error(res, 'Usuario no encontrado', 404);
  if (user.role === 'admin') return error(res, 'No puedes eliminar un administrador', 403);

  try {
    await prisma.wallet.deleteMany({ where: { userId: req.params.id } });
    await prisma.loyaltyAccount.deleteMany({ where: { userId: req.params.id } });
    await prisma.wishlistItem.deleteMany({ where: { userId: req.params.id } });
    await prisma.cartItem.deleteMany({ where: { userId: req.params.id } });
    await prisma.notification.deleteMany({ where: { userId: req.params.id } });
    await prisma.user.delete({ where: { id: req.params.id } });
    return success(res, { message: 'Usuario eliminado', id: req.params.id });
  } catch (e) {
    return error(res, 'No se puede eliminar: el usuario tiene transacciones u órdenes activas', 409);
  }
});

// PATCH /v1/admin/users/:id/kyc — Cambiar KYC
router.patch('/users/:id/kyc', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return error(res, 'Usuario no encontrado', 404);

  const { status } = req.body;
  const validStatuses = ['verified', 'rejected', 'pending', 'under_review'];
  if (!validStatuses.includes(status)) return error(res, `Status inválido: ${validStatuses.join(', ')}`, 400);

  const updated = await prisma.user.update({ where: { id: req.params.id }, data: { kycStatus: status } });
  return success(res, { id: updated.id, name: updated.name, kyc_status: updated.kycStatus });
});

// ══════════════════════════════════════════════════════
//  WALLETS — RECARGA / AJUSTE ADMIN
// ══════════════════════════════════════════════════════

// POST /v1/admin/wallet/topup — Recargar wallet de cualquier usuario
router.post('/wallet/topup', requireAuth, requireRole('admin'), async (req, res) => {
  const { user_id, amount, currency = 'XAF', note } = req.body;
  if (!user_id || !amount) return error(res, 'Campos requeridos: user_id, amount', 400);
  if (Number(amount) <= 0) return error(res, 'El importe debe ser mayor que 0', 400);
  if (!CF[currency])       return error(res, `Divisa inválida: ${Object.keys(CF).join(', ')}`, 400);

  const user = await prisma.user.findUnique({ where: { id: user_id } });
  if (!user) return error(res, 'Usuario no encontrado', 404);

  const wallet = await prisma.wallet.upsert({
    where: { userId: user_id },
    update: { [CF[currency]]: { increment: Number(amount) } },
    create: { userId: user_id, [CF[currency]]: Number(amount) }
  });

  const txn = await prisma.transaction.create({
    data: {
      id: `adm_${uuidv4().slice(0, 8)}`,
      type: 'topup', userId: user_id,
      amountSent: Number(amount), currencySent: currency,
      fee: 0, status: 'completed',
      reference: `Admin topup${note ? ': ' + note : ''}`
    }
  });

  return success(res, {
    user: { id: user.id, name: user.name },
    amount: Number(amount), currency,
    new_balance: wallet[CF[currency]],
    transaction_id: txn.id
  });
});

// POST /v1/admin/wallet/adjust — Ajuste manual (positivo o negativo)
router.post('/wallet/adjust', requireAuth, requireRole('admin'), async (req, res) => {
  const { user_id, amount, currency = 'XAF', note } = req.body;
  if (!user_id || amount === undefined) return error(res, 'Campos requeridos: user_id, amount', 400);

  const user = await prisma.user.findUnique({ where: { id: user_id } });
  if (!user) return error(res, 'Usuario no encontrado', 404);

  const field  = CF[currency] || 'balanceXaf';
  const wallet = await prisma.wallet.findUnique({ where: { userId: user_id } });
  if (!wallet) return error(res, 'Wallet no encontrado', 404);

  const newBalance = Math.max(0, wallet[field] + Number(amount));
  const updated = await prisma.wallet.update({ where: { userId: user_id }, data: { [field]: newBalance } });

  return success(res, {
    user: { id: user.id, name: user.name },
    adjustment: Number(amount), currency,
    new_balance: updated[field],
    note: note || null
  });
});

// ══════════════════════════════════════════════════════
//  TRANSACCIONES — LISTAR (ADMIN)
// ══════════════════════════════════════════════════════
router.get('/transactions', requireAuth, requireRole('admin'), async (req, res) => {
  const { page = 1, limit = 50, type, currency, from, to } = req.query;
  const where = {};
  if (type)     where.type = type;
  if (currency) where.currencySent = currency;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to)   where.createdAt.lte = new Date(to);
  }
  const txns = await prisma.transaction.findMany({ where, orderBy: { createdAt: 'desc' } });
  return success(res, paginate(txns, page, limit));
});

// ══════════════════════════════════════════════════════
//  RIDERS — CRUD COMPLETO (ADMIN)
// ══════════════════════════════════════════════════════
router.get('/riders', requireAuth, requireRole('admin'), async (req, res) => {
  const { zone, status } = req.query;
  const where = {};
  if (status) where.status = status;
  let riders = await prisma.rider.findMany({ where, orderBy: { createdAt: 'desc' } });
  if (zone) riders = riders.filter(r => r.zone.toLowerCase().includes(zone.toLowerCase()));
  return success(res, { riders, total: riders.length });
});

router.post('/riders', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, phone, zone, vehicle } = req.body;
  if (!name || !phone || !zone || !vehicle)
    return error(res, 'Campos requeridos: name, phone, zone, vehicle', 400);

  const validVehicles = ['moto', 'bicicleta', 'coche', 'furgoneta'];
  if (!validVehicles.includes(vehicle)) return error(res, `Vehículo inválido: ${validVehicles.join(', ')}`, 400);

  const rider = await prisma.rider.create({
    data: { id: `rider_${uuidv4().slice(0, 8)}`, name, phone, zone, vehicle, status: 'available' }
  });
  return success(res, rider, 201);
});

router.put('/riders/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const rider = await prisma.rider.findUnique({ where: { id: req.params.id } });
  if (!rider) return error(res, 'Rider no encontrado', 404);

  const { name, phone, zone, vehicle, status, rating } = req.body;
  const data = {};
  if (name)              data.name = name;
  if (phone)             data.phone = phone;
  if (zone)              data.zone = zone;
  if (vehicle)           data.vehicle = vehicle;
  if (status)            data.status = status;
  if (rating !== undefined) data.rating = parseFloat(rating);

  return success(res, await prisma.rider.update({ where: { id: req.params.id }, data }));
});

router.delete('/riders/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.rider.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Rider no encontrado', 404);
  await prisma.rider.delete({ where: { id: req.params.id } });
  return success(res, { message: 'Rider eliminado', id: req.params.id });
});

// ══════════════════════════════════════════════════════
//  PROVEEDORES DE FACTURAS — CRUD COMPLETO (ADMIN)
// ══════════════════════════════════════════════════════
router.get('/providers', requireAuth, requireRole('admin'), async (req, res) => {
  const { category, country } = req.query;
  const where = {};
  if (category) where.category = category;
  if (country)  where.country = country.toUpperCase();
  const providers = await prisma.billProvider.findMany({ where, orderBy: { name: 'asc' } });
  return success(res, { providers, total: providers.length });
});

router.post('/providers', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, category, country, field, minAmount = 100, maxAmount = 500000, currency = 'XAF' } = req.body;
  if (!name || !category || !country || !field)
    return error(res, 'Campos requeridos: name, category, country, field', 400);

  const provider = await prisma.billProvider.create({
    data: {
      id: `bp_${uuidv4().slice(0, 8)}`,
      name, category, country: country.toUpperCase(),
      field, currency,
      minAmount: Number(minAmount), maxAmount: Number(maxAmount)
    }
  });
  return success(res, provider, 201);
});

router.put('/providers/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.billProvider.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Proveedor no encontrado', 404);

  const { name, category, country, field, minAmount, maxAmount } = req.body;
  const data = {};
  if (name)                data.name = name;
  if (category)            data.category = category;
  if (country)             data.country = country.toUpperCase();
  if (field)               data.field = field;
  if (minAmount !== undefined) data.minAmount = Number(minAmount);
  if (maxAmount !== undefined) data.maxAmount = Number(maxAmount);

  return success(res, await prisma.billProvider.update({ where: { id: req.params.id }, data }));
});

router.delete('/providers/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.billProvider.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Proveedor no encontrado', 404);
  try {
    await prisma.billProvider.delete({ where: { id: req.params.id } });
    return success(res, { message: 'Proveedor eliminado', id: req.params.id });
  } catch {
    return error(res, 'No se puede eliminar: tiene pagos asociados', 409);
  }
});

// ══════════════════════════════════════════════════════
//  TASAS DE CAMBIO
// ══════════════════════════════════════════════════════
router.put('/rates/:pair', requireAuth, requireRole('admin'), async (req, res) => {
  const { rate } = req.body;
  if (!rate || parseFloat(rate) <= 0) return error(res, 'Tasa inválida', 400);

  const updated = await prisma.exchangeRate.upsert({
    where:  { pair: req.params.pair.toUpperCase() },
    update: { rate: parseFloat(rate) },
    create: { pair: req.params.pair.toUpperCase(), rate: parseFloat(rate) }
  });
  return success(res, updated);
});

// ══════════════════════════════════════════════════════
//  INFORMES / REPORTS
// ══════════════════════════════════════════════════════
router.get('/reports/summary', requireAuth, requireRole('admin'), async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = {};
  if (from) dateFilter.gte = new Date(from);
  if (to)   dateFilter.lte = new Date(to);
  const where = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

  const [users, txns, orders, gorders, riders, providers] = await Promise.all([
    prisma.user.findMany({ where, select: { id: true, name: true, email: true, role: true, kycStatus: true, country: true, createdAt: true } }),
    prisma.transaction.findMany({ where, select: { id: true, type: true, currencySent: true, amountSent: true, fee: true, status: true, createdAt: true } }),
    prisma.order.count({ where }),
    prisma.groceryOrder.count({ where }),
    prisma.rider.count(),
    prisma.billProvider.count()
  ]);

  return success(res, {
    period: { from: from || 'inicio', to: to || 'ahora' },
    generated_at: new Date().toISOString(),
    users: {
      total: users.length,
      list: users,
      by_role:    users.reduce((a, u) => { a[u.role] = (a[u.role]||0)+1; return a; }, {}),
      by_country: users.reduce((a, u) => { a[u.country] = (a[u.country]||0)+1; return a; }, {}),
      kyc_verified: users.filter(u => u.kycStatus === 'verified').length
    },
    transactions: {
      total: txns.length,
      list: txns,
      by_type:    txns.reduce((a, t) => { a[t.type] = (a[t.type]||0)+1; return a; }, {}),
      volume_eur: txns.filter(t => t.currencySent === 'EUR').reduce((s, t) => s + (t.amountSent||0), 0),
      volume_xaf: txns.filter(t => t.currencySent === 'XAF').reduce((s, t) => s + (t.amountSent||0), 0),
      total_fees: txns.reduce((s, t) => s + (t.fee||0), 0)
    },
    orders:  { total: orders + gorders, shop: orders, grocery: gorders },
    infrastructure: { riders, providers }
  });
});

// ══════════════════════════════════════════════════════
//  PAÍSES SOPORTADOS
// ══════════════════════════════════════════════════════
router.get('/countries', requireAuth, requireRole('admin'), (_req, res) => {
  return success(res, {
    countries: [
      { code:'GQ', name:'Guinea Ecuatorial',   region:'África Central',    currency:'XAF', phone:'+240' },
      { code:'CM', name:'Camerún',              region:'África Central',    currency:'XAF', phone:'+237' },
      { code:'GA', name:'Gabón',                region:'África Central',    currency:'XAF', phone:'+241' },
      { code:'CG', name:'Rep. del Congo',       region:'África Central',    currency:'XAF', phone:'+242' },
      { code:'CF', name:'Rep. Centroafricana',  region:'África Central',    currency:'XAF', phone:'+236' },
      { code:'TD', name:'Chad',                 region:'África Central',    currency:'XAF', phone:'+235' },
      { code:'SN', name:'Senegal',              region:'África Occidental', currency:'XOF', phone:'+221' },
      { code:'CI', name:'Costa de Marfil',      region:'África Occidental', currency:'XOF', phone:'+225' },
      { code:'BJ', name:'Benín',                region:'África Occidental', currency:'XOF', phone:'+229' },
      { code:'BF', name:'Burkina Faso',         region:'África Occidental', currency:'XOF', phone:'+226' },
      { code:'ML', name:'Mali',                 region:'África Occidental', currency:'XOF', phone:'+223' },
      { code:'NE', name:'Níger',                region:'África Occidental', currency:'XOF', phone:'+227' },
      { code:'TG', name:'Togo',                 region:'África Occidental', currency:'XOF', phone:'+228' },
      { code:'GW', name:'Guinea-Bisáu',         region:'África Occidental', currency:'XOF', phone:'+245' },
      { code:'NG', name:'Nigeria',              region:'África Occidental', currency:'NGN', phone:'+234' },
      { code:'GH', name:'Ghana',                region:'África Occidental', currency:'GHS', phone:'+233' },
      { code:'KE', name:'Kenia',                region:'África Oriental',   currency:'KES', phone:'+254' },
      { code:'TZ', name:'Tanzania',             region:'África Oriental',   currency:'TZS', phone:'+255' },
      { code:'UG', name:'Uganda',               region:'África Oriental',   currency:'UGX', phone:'+256' },
      { code:'RW', name:'Ruanda',               region:'África Oriental',   currency:'RWF', phone:'+250' },
      { code:'ET', name:'Etiopía',              region:'África Oriental',   currency:'ETB', phone:'+251' },
      { code:'MA', name:'Marruecos',            region:'África del Norte',  currency:'MAD', phone:'+212' },
      { code:'DZ', name:'Argelia',              region:'África del Norte',  currency:'DZD', phone:'+213' },
      { code:'TN', name:'Túnez',               region:'África del Norte',  currency:'TND', phone:'+216' },
      { code:'EG', name:'Egipto',               region:'África del Norte',  currency:'EGP', phone:'+20'  },
      { code:'ZA', name:'Sudáfrica',            region:'África del Sur',    currency:'ZAR', phone:'+27'  },
      { code:'ES', name:'España',               region:'Europa',            currency:'EUR', phone:'+34'  },
      { code:'FR', name:'Francia',              region:'Europa',            currency:'EUR', phone:'+33'  },
      { code:'PT', name:'Portugal',             region:'Europa',            currency:'EUR', phone:'+351' },
      { code:'IT', name:'Italia',               region:'Europa',            currency:'EUR', phone:'+39'  },
      { code:'DE', name:'Alemania',             region:'Europa',            currency:'EUR', phone:'+49'  },
      { code:'US', name:'Estados Unidos',       region:'América',           currency:'USD', phone:'+1'   },
      { code:'GB', name:'Reino Unido',          region:'Europa',            currency:'GBP', phone:'+44'  },
      { code:'CN', name:'China',                region:'Asia',              currency:'CNY', phone:'+86'  }
    ]
  });
});

// ══════════════════════════════════════════════════════
//  SISTEMA
// ══════════════════════════════════════════════════════
router.get('/system', requireAuth, requireRole('admin'), async (req, res) => {
  const uptime = process.uptime();
  const mem    = process.memoryUsage();

  const [users, txns, orders, gorders, notifs, webhooks] = await Promise.all([
    prisma.user.count(), prisma.transaction.count(),
    prisma.order.count(), prisma.groceryOrder.count(),
    prisma.notification.count(), prisma.webhook.count()
  ]);

  return success(res, {
    uptime_seconds: Math.floor(uptime),
    uptime_human:   `${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m ${Math.floor(uptime%60)}s`,
    node_version:   process.version,
    memory: {
      heap_used_mb:  Math.round(mem.heapUsed  / 1048576 * 10) / 10,
      heap_total_mb: Math.round(mem.heapTotal / 1048576 * 10) / 10,
      rss_mb:        Math.round(mem.rss       / 1048576 * 10) / 10
    },
    db_records: {
      users, transactions: txns,
      orders: orders + gorders,
      notifications: notifs, webhooks
    },
    environment: process.env.NODE_ENV || 'development',
    timestamp:   new Date().toISOString()
  });
});

module.exports = router;
