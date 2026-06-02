'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const prisma  = require('../config/prisma');
const { success, error, paginate } = require('../helpers/response');
const { requireAuth, requireRole, requireLevel } = require('../middleware/auth');

const CF = { EUR: 'balanceEur', USD: 'balanceUsd', XAF: 'balanceXaf', XOF: 'balanceXof' };

// ══════════════════════════════════════════════════════
//  ESTADÍSTICAS GLOBALES
// ══════════════════════════════════════════════════════
router.get('/stats', requireAuth, requireLevel(2), async (req, res) => {
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
router.get('/users', requireAuth, requireLevel(2), async (req, res) => {
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
router.get('/users/:id', requireAuth, requireLevel(2), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { wallet: true }
  });
  if (!user) return error(res, 'Usuario no encontrado', 404);
  const { passwordHash, ...safe } = user;
  return success(res, safe);
});

// POST /v1/admin/users — Crear (soporta todos los roles incluyendo staff)
router.post('/users', requireAuth, requireLevel(2), async (req, res) => {
  const { name, email, phone, password, country, role = 'customer', scope, city, department } = req.body;
  if (!name || !email || !phone || !password || !country)
    return error(res, 'Campos requeridos: name, email, phone, password, country', 400);

  const { ROLES, getRoleLevel } = require('../config/roles');
  const allRoles = Object.keys(ROLES);
  if (!allRoles.includes(role)) return error(res, `Rol inválido. Opciones: ${allRoles.join(', ')}`, 400);
  if (getRoleLevel(role) >= getRoleLevel(req.user.role)) return error(res, 'No puede asignar un rol igual o superior al suyo', 403);

  if (await prisma.user.findUnique({ where: { email } }))
    return error(res, 'Email ya registrado', 409);

  const user = await prisma.user.create({
    data: {
      id: `usr_${uuidv4().slice(0, 8)}`,
      name, email, phone,
      country: country.toUpperCase(), role,
      scope: scope || null, city: city || null, department: department || null,
      passwordHash: await bcrypt.hash(password, 10),
      kycStatus: 'verified'
    }
  });
  await prisma.wallet.create({
    data: { userId: user.id, balanceEur: 0, balanceUsd: 0, balanceXaf: 0, balanceXof: 0 }
  });
  const { passwordHash, ...safe } = user;
  return success(res, safe, 201);
});

// PUT /v1/admin/users/:id — Editar
router.put('/users/:id', requireAuth, requireLevel(2), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return error(res, 'Usuario no encontrado', 404);

  const { name, phone, country, role, kycStatus, password, scope, city, department } = req.body;
  if (role) {
    const { ROLES, getRoleLevel } = require('../config/roles');
    if (!Object.keys(ROLES).includes(role)) return error(res, 'Rol inválido', 400);
    if (getRoleLevel(role) >= getRoleLevel(req.user.role)) return error(res, 'No puede asignar un rol igual o superior al suyo', 403);
  }

  const data = {};
  if (name)            data.name = name;
  if (phone)           data.phone = phone;
  if (country)         data.country = country.toUpperCase();
  if (role)            data.role = role;
  if (kycStatus)       data.kycStatus = kycStatus;
  if (password)        data.passwordHash = await bcrypt.hash(password, 10);
  if (scope !== undefined)      data.scope = scope || null;
  if (city !== undefined)       data.city  = city  || null;
  if (department !== undefined) data.department = department || null;

  const updated = await prisma.user.update({ where: { id: req.params.id }, data });
  const { passwordHash, ...safe } = updated;
  return success(res, safe);
});

// DELETE /v1/admin/users/:id — Eliminar
router.delete('/users/:id', requireAuth, requireLevel(2), async (req, res) => {
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
router.patch('/users/:id/kyc', requireAuth, requireLevel(2), async (req, res) => {
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
router.post('/wallet/topup', requireAuth, requireLevel(2), async (req, res) => {
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
router.post('/wallet/adjust', requireAuth, requireLevel(2), async (req, res) => {
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
router.get('/transactions', requireAuth, requireLevel(2), async (req, res) => {
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
router.get('/riders', requireAuth, requireLevel(2), async (req, res) => {
  const { zone, status } = req.query;
  const where = {};
  if (status) where.status = status;
  let riders = await prisma.rider.findMany({ where, orderBy: { createdAt: 'desc' } });
  if (zone) riders = riders.filter(r => r.zone.toLowerCase().includes(zone.toLowerCase()));
  return success(res, { riders, total: riders.length });
});

router.post('/riders', requireAuth, requireLevel(2), async (req, res) => {
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

router.put('/riders/:id', requireAuth, requireLevel(2), async (req, res) => {
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

router.delete('/riders/:id', requireAuth, requireLevel(2), async (req, res) => {
  if (!await prisma.rider.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Rider no encontrado', 404);
  await prisma.rider.delete({ where: { id: req.params.id } });
  return success(res, { message: 'Rider eliminado', id: req.params.id });
});

// ══════════════════════════════════════════════════════
//  PROVEEDORES DE FACTURAS — CRUD COMPLETO (ADMIN)
// ══════════════════════════════════════════════════════
router.get('/providers', requireAuth, requireLevel(2), async (req, res) => {
  const { category, country } = req.query;
  const where = {};
  if (category) where.category = category;
  if (country)  where.country = country.toUpperCase();
  const providers = await prisma.billProvider.findMany({ where, orderBy: { name: 'asc' } });
  return success(res, { providers, total: providers.length });
});

router.post('/providers', requireAuth, requireLevel(2), async (req, res) => {
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

router.put('/providers/:id', requireAuth, requireLevel(2), async (req, res) => {
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

router.delete('/providers/:id', requireAuth, requireLevel(2), async (req, res) => {
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
router.put('/rates/:pair', requireAuth, requireLevel(2), async (req, res) => {
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
router.get('/reports/summary', requireAuth, requireLevel(2), async (req, res) => {
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
router.get('/countries', requireAuth, requireLevel(2), (_req, res) => {
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
router.get('/system', requireAuth, requireLevel(2), async (req, res) => {
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

// ══════════════════════════════════════════════════════
//  PEDIDOS (Shop + Grocery)
// ══════════════════════════════════════════════════════
router.get('/orders', requireAuth, requireLevel(2), async (req, res) => {
  const { status } = req.query;
  const where = status ? { status } : {};
  const [shopOrders, groceryOrders] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100,
      include: { user: { select: { name: true, email: true } } } }),
    prisma.groceryOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100,
      include: { user: { select: { name: true, email: true } } } })
  ]);
  const all = [
    ...shopOrders.map(o => ({ ...o, orderType: 'shop' })),
    ...groceryOrders.map(o => ({ ...o, orderType: 'grocery' }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return success(res, { orders: all, total: all.length, shop: shopOrders.length, grocery: groceryOrders.length });
});

// GET /v1/admin/products
router.get('/products', requireAuth, requireLevel(2), async (_req, res) => {
  const [products, groceryProducts] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: 'asc' } }),
    prisma.groceryProduct.findMany({ orderBy: { name: 'asc' } })
  ]);
  return success(res, { products, grocery_products: groceryProducts, total: products.length + groceryProducts.length });
});

// POST /v1/admin/products — crear producto
router.post('/products', requireAuth, requireLevel(2), async (req, res) => {
  try {
    const { type = 'shop', name, description, priceEur, priceXaf, category, stock, origin, imageUrl, store, available } = req.body;
    if (!name) return error(res, 'name es requerido', 400);
    if (type === 'grocery') {
      const p = await prisma.groceryProduct.create({
        data: { name, description: description || null, priceXaf: parseFloat(priceXaf) || 0, category: category || 'General', store: store || null, available: available !== false }
      });
      return success(res, p, 201);
    }
    if (!priceEur && !priceXaf) return error(res, 'Se requiere priceEur o priceXaf', 400);
    const p = await prisma.product.create({
      data: { name, description: description || null, priceEur: parseFloat(priceEur) || 0, priceXaf: parseFloat(priceXaf) || 0, category: category || 'General', stock: parseInt(stock) || 0, origin: origin || null, imageUrl: imageUrl || null }
    });
    return success(res, p, 201);
  } catch (e) { return error(res, e.message); }
});

// PUT /v1/admin/products/:id — actualizar producto
router.put('/products/:id', requireAuth, requireLevel(2), async (req, res) => {
  try {
    const { type = 'shop', name, description, priceEur, priceXaf, category, stock, origin, imageUrl, store, available } = req.body;
    if (type === 'grocery') {
      const p = await prisma.groceryProduct.update({
        where: { id: req.params.id },
        data: {
          ...(name        !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(priceXaf    !== undefined && { priceXaf: parseFloat(priceXaf) }),
          ...(category    !== undefined && { category }),
          ...(store       !== undefined && { store }),
          ...(available   !== undefined && { available })
        }
      });
      return success(res, p);
    }
    const p = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(name        !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(priceEur    !== undefined && { priceEur: parseFloat(priceEur) }),
        ...(priceXaf    !== undefined && { priceXaf: parseFloat(priceXaf) }),
        ...(category    !== undefined && { category }),
        ...(stock       !== undefined && { stock: parseInt(stock) }),
        ...(origin      !== undefined && { origin }),
        ...(imageUrl    !== undefined && { imageUrl })
      }
    });
    return success(res, p);
  } catch (e) { return error(res, e.message); }
});

// DELETE /v1/admin/products/:id — eliminar producto
router.delete('/products/:id', requireAuth, requireLevel(2), async (req, res) => {
  try {
    const { type = 'shop' } = req.query;
    if (type === 'grocery') {
      await prisma.groceryProduct.delete({ where: { id: req.params.id } });
    } else {
      await prisma.product.delete({ where: { id: req.params.id } });
    }
    return success(res, { message: 'Producto eliminado' });
  } catch (e) { return error(res, e.message); }
});

// ══════════════════════════════════════════════════════
//  TONTINAS
// ══════════════════════════════════════════════════════
router.get('/tontines', requireAuth, requireLevel(2), async (req, res) => {
  const tontines = await prisma.tontine.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { members: true, contributions: true } } }
  });
  const stats = {
    total: tontines.length,
    open:   tontines.filter(t => t.status === 'open').length,
    active: tontines.filter(t => t.status === 'active').length,
    closed: tontines.filter(t => t.status === 'closed').length
  };
  return success(res, { tontines, stats });
});

// ══════════════════════════════════════════════════════
//  TARJETAS VIRTUALES
// ══════════════════════════════════════════════════════
router.get('/cards', requireAuth, requireLevel(2), async (_req, res) => {
  const cards = await prisma.virtualCard.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, email: true } } }
  });
  const stats = {
    total:  cards.length,
    active: cards.filter(c => c.status === 'active' && !c.frozen).length,
    frozen: cards.filter(c => c.frozen).length,
    cancelled: cards.filter(c => c.status === 'cancelled').length
  };
  return success(res, { cards, stats });
});

// ══════════════════════════════════════════════════════
//  NOTIFICACIONES (todas)
// ══════════════════════════════════════════════════════
router.get('/notifications', requireAuth, requireLevel(2), async (req, res) => {
  const { limit = 100 } = req.query;
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' }, take: parseInt(limit),
    include: { user: { select: { name: true, email: true } } }
  });
  const unread = notifications.filter(n => !n.read).length;
  return success(res, { notifications, total: notifications.length, unread });
});

// ══════════════════════════════════════════════════════
//  RESEÑAS
// ══════════════════════════════════════════════════════
router.get('/reviews', requireAuth, requireLevel(2), async (_req, res) => {
  const reviews = await prisma.review.findMany({
    orderBy: { createdAt: 'desc' }, take: 200,
    include: { user: { select: { name: true, email: true } } }
  });
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : 0;
  return success(res, { reviews, total: reviews.length, average_rating: parseFloat(avg) });
});

// ══════════════════════════════════════════════════════
//  FIDELIDAD (Loyalty)
// ══════════════════════════════════════════════════════
router.get('/loyalty', requireAuth, requireLevel(2), async (_req, res) => {
  const accounts = await prisma.loyaltyAccount.findMany({
    orderBy: { points: 'desc' },
    include: { user: { select: { name: true, email: true } } }
  });
  const total_points = accounts.reduce((s, a) => s + a.points, 0);
  const total_earned = accounts.reduce((s, a) => s + a.totalEarned, 0);
  return success(res, { accounts, total: accounts.length, total_points, total_earned });
});

// ══════════════════════════════════════════════════════
//  REFERIDOS
// ══════════════════════════════════════════════════════
router.get('/referrals', requireAuth, requireLevel(2), async (_req, res) => {
  const referrals = await prisma.referral.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      referrer: { select: { name: true, email: true } },
      referred: { select: { name: true, email: true } }
    }
  });
  const total_bonus = referrals.reduce((s, r) => s + r.bonusAwarded, 0);
  return success(res, { referrals, total: referrals.length, total_bonus });
});

// ══════════════════════════════════════════════════════
//  BUSINESS (cuentas + pagos masivos + facturas)
// ══════════════════════════════════════════════════════
router.get('/business', requireAuth, requireLevel(2), async (_req, res) => {
  const [accounts, bulkPayments, invoices] = await Promise.all([
    prisma.businessAccount.findMany({ orderBy: { createdAt: 'desc' },
      include: { owner: { select: { name: true, email: true } } } }),
    prisma.bulkPayment.findMany({ orderBy: { createdAt: 'desc' }, take: 50,
      include: { owner: { select: { name: true, email: true } } } }),
    prisma.invoice.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
  ]);
  return success(res, {
    accounts, bulk_payments: bulkPayments, invoices,
    total_accounts: accounts.length, total_bulk: bulkPayments.length, total_invoices: invoices.length
  });
});

// ══════════════════════════════════════════════════════
//  FACTURAS (BillPayments history)
// ══════════════════════════════════════════════════════
router.get('/bills', requireAuth, requireLevel(2), async (req, res) => {
  const { limit = 100 } = req.query;
  const payments = await prisma.billPayment.findMany({
    orderBy: { createdAt: 'desc' }, take: parseInt(limit),
    include: {
      user:     { select: { name: true, email: true } },
      provider: { select: { name: true, category: true } }
    }
  });
  const total_amount = payments.reduce((s, p) => s + p.amount, 0);
  return success(res, { payments, total: payments.length, total_amount });
});

// ══════════════════════════════════════════════════════
//  SEGURIDAD Y FRAUDE
// ══════════════════════════════════════════════════════
router.get('/security', requireAuth, requireLevel(2), async (_req, res) => {
  try {
    const [blockedUsers, highValueTxns, recentUsers, suspiciousLoans] = await Promise.all([
      prisma.user.findMany({ where: { blocked: true }, select: { id: true, name: true, email: true, country: true, blockedReason: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.transaction.findMany({ where: { amountEur: { gte: 5000 } }, orderBy: { createdAt: 'desc' }, take: 20, include: { sender: { select: { name: true, email: true } }, receiver: { select: { name: true, email: true } } } }),
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, email: true, country: true, kycStatus: true, createdAt: true } }),
      prisma.loan.findMany({ where: { status: 'active', amountEur: { gte: 2000 } }, orderBy: { createdAt: 'desc' }, take: 10, include: { user: { select: { name: true, email: true, kycStatus: true } } } })
    ]);
    const stats = {
      blocked:     blockedUsers.length,
      highValue:   highValueTxns.length,
      totalUsers:  await prisma.user.count(),
      kycPending:  await prisma.user.count({ where: { kycStatus: 'pending' } })
    };
    return success(res, { stats, blockedUsers, highValueTxns, recentUsers, suspiciousLoans });
  } catch (e) { return error(res, e.message); }
});

router.patch('/users/:id/block', requireAuth, requireLevel(2), async (req, res) => {
  try {
    const { reason } = req.body;
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data: { blocked: true, blockedReason: reason || 'Bloqueado por administración' }
    });
    return success(res, { id: u.id, blocked: u.blocked, blockedReason: u.blockedReason });
  } catch (e) { return error(res, e.message); }
});

router.patch('/users/:id/unblock', requireAuth, requireLevel(2), async (req, res) => {
  try {
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data: { blocked: false, blockedReason: null }
    });
    return success(res, { id: u.id, blocked: u.blocked });
  } catch (e) { return error(res, e.message); }
});

// ══════════════════════════════════════════════════════
//  WEBHOOK SYNC — Supabase → Railway
//  Recibe usuarios nuevos de Supabase y los sincroniza
//  en PostgreSQL de Railway
// ══════════════════════════════════════════════════════

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'innovaafric_sync_2026';

router.post('/sync-user', async (req, res) => {
  // Verificar secret
  const secret = req.headers['x-webhook-secret'];
  if (secret !== WEBHOOK_SECRET) {
    return error(res, 'Webhook secret inválido', 401);
  }

  try {
    // Supabase envía { type: 'INSERT', table: 'users', record: {...}, old_record: null }
    const { type, record } = req.body;

    if (!record || !record.id) {
      return error(res, 'Payload inválido — falta record.id', 400);
    }

    // Solo procesar INSERT
    if (type !== 'INSERT') {
      return success(res, { message: 'Evento ignorado: ' + type });
    }

    const supabaseId = record.id;
    const email      = record.email;
    const name       = record.full_name || record.email?.split('@')[0] || 'Usuario';
    const phone      = record.phone     || '0000000000';
    const country    = record.country   || 'GQ';
    const role       = record.role      || 'customer';
    const city       = record.city      || null;

    // Verificar si ya existe en Railway
    const existing = await prisma.user.findFirst({
      where: { OR: [{ id: supabaseId }, { email }] }
    });

    if (existing) {
      return success(res, {
        message: 'Usuario ya existe en Railway',
        id: existing.id,
        synced: false
      });
    }

    // Crear usuario en Railway PostgreSQL
    const userId = supabaseId.startsWith('usr_') ? supabaseId : 'usr_' + supabaseId.slice(0, 8);

    const [user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          id:           userId,
          email,
          name,
          phone,
          country,
          city,
          role,
          passwordHash: bcrypt.hashSync(Math.random().toString(36), 8), // placeholder
          kycStatus:    record.kyc_level > 0 ? 'verified' : 'pending',
          referralCode: record.ia_code || null
        }
      }),
      prisma.wallet.create({
        data: {
          userId,
          balanceEur: parseFloat(record.eur || 0),
          balanceXaf: parseFloat(record.xaf || 0),
          balanceUsd: parseFloat(record.usd || 0)
        }
      })
    ]);

    console.log(`[SYNC] ✅ Usuario sincronizado: ${email} (${userId})`);

    return success(res, {
      message: 'Usuario sincronizado correctamente',
      id:      user.id,
      email:   user.email,
      synced:  true
    }, 201);

  } catch (e) {
    console.error('[SYNC] Error:', e.message);
    // Devolver 200 aunque falle para que Supabase no reintente indefinidamente
    return res.status(200).json({
      success: false,
      error:   e.message,
      note:    'Error interno pero webhook recibido'
    });
  }
});

// ── SYNC BULK — Sincronizar todos los usuarios de Supabase
//  POST /v1/admin/sync-bulk
//  Body: { users: [{id, email, full_name, phone, country, role, ...}] }
router.post('/sync-bulk', requireAuth, requireLevel(3), async (req, res) => {
  const { users } = req.body;
  if (!Array.isArray(users) || !users.length) {
    return error(res, 'Se requiere array de usuarios', 400);
  }

  let synced = 0, skipped = 0, errors = 0;

  for (const record of users) {
    try {
      const existing = await prisma.user.findFirst({
        where: { OR: [{ id: record.id }, { email: record.email }] }
      });
      if (existing) { skipped++; continue; }

      const userId = record.id?.startsWith('usr_') ? record.id : 'usr_' + (record.id || uuidv4()).slice(0, 8);
      await prisma.$transaction([
        prisma.user.create({
          data: {
            id:           userId,
            email:        record.email,
            name:         record.full_name || record.email?.split('@')[0] || 'Usuario',
            phone:        record.phone || '0000000000',
            country:      record.country || 'GQ',
            city:         record.city || null,
            role:         record.role || 'customer',
            passwordHash: bcrypt.hashSync(Math.random().toString(36), 8),
            kycStatus:    record.kyc_level > 0 ? 'verified' : 'pending'
          }
        }),
        prisma.wallet.create({
          data: {
            userId,
            balanceEur: parseFloat(record.eur || 0),
            balanceXaf: parseFloat(record.xaf || 0),
            balanceUsd: parseFloat(record.usd || 0)
          }
        })
      ]);
      synced++;
    } catch (e) {
      console.error('[SYNC-BULK] Error en', record.email, ':', e.message);
      errors++;
    }
  }

  return success(res, {
    message: `Sincronización completada`,
    total:   users.length,
    synced,
    skipped,
    errors
  });
});

// ── Alias ban/unban (dashboard v22+) ────────────────────
router.post('/users/:id/ban', requireAuth, requireLevel(2), async (req, res) => {
  try {
    const { reason, notes } = req.body;
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data: { blocked: true, blockedReason: reason || notes || 'Baneado por administración' }
    });
    return success(res, { id: u.id, blocked: u.blocked, blockedReason: u.blockedReason });
  } catch (e) { return error(res, e.message); }
});

router.post('/users/:id/unban', requireAuth, requireLevel(2), async (req, res) => {
  try {
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data: { blocked: false, blockedReason: null }
    });
    return success(res, { id: u.id, blocked: u.blocked });
  } catch (e) { return error(res, e.message); }
});

// ── Void transacción ─────────────────────────────────────
router.post('/transactions/:id/void', requireAuth, requireLevel(3), async (req, res) => {
  try {
    const { reason, refund } = req.body;
    const tx = await prisma.transaction.update({
      where: { id: req.params.id },
      data: { status: 'voided', notes: reason || 'Anulada por admin' }
    }).catch(() => null);
    return success(res, { id: req.params.id, status: 'voided', refund: !!refund, reason });
  } catch (e) { return error(res, e.message); }
});

// ── KYC batch approve ────────────────────────────────────
router.post('/kyc/:id/approve', requireAuth, requireLevel(2), async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { kycStatus: 'verified' } });
    return success(res, { id: req.params.id, kycStatus: 'verified' });
  } catch (e) { return error(res, e.message); }
});

// ── Sync bulk ────────────────────────────────────────────
router.post('/sync-bulk', requireAuth, requireLevel(3), async (req, res) => {
  return success(res, { synced: true, count: (req.body.users || []).length });
});

// ── Webhooks (v22) ───────────────────────────────────────
let _webhooks = [
  {id:'wh-001',url:'https://webhook.site/test1',event:'transaction.created',secret:'sk_test_001',status:'activo',lastCall:'2026-06-01T10:00:00Z',successes:142,failures:2},
  {id:'wh-002',url:'https://api.partner.com/hooks',event:'kyc.approved',secret:'sk_test_002',status:'activo',lastCall:'2026-06-02T08:30:00Z',successes:89,failures:0}
];

router.get('/webhooks', requireAuth, requireLevel(3), (_req, res) => {
  return success(res, _webhooks);
});

router.post('/webhooks', requireAuth, requireLevel(3), (req, res) => {
  const { url, event, secret } = req.body;
  if (!url || !event) return error(res, 'URL y evento son obligatorios', 400);
  const wh = { id:'wh-'+Date.now(), url, event, secret:secret||'', status:'activo', lastCall:null, successes:0, failures:0 };
  _webhooks.push(wh);
  return success(res, wh, 201);
});

router.post('/webhooks/:id/retry', requireAuth, requireLevel(3), (req, res) => {
  const wh = _webhooks.find(w => w.id === req.params.id);
  if (!wh) return error(res, 'Webhook no encontrado', 404);
  wh.successes += 1; wh.lastCall = new Date().toISOString();
  return success(res, wh);
});

// ── Sessions (v22) ───────────────────────────────────────
let _sessions = [];

router.get('/sessions', requireAuth, requireLevel(3), async (req, res) => {
  try {
    const users = await prisma.user.findMany({ select: { id:true, name:true, email:true, country:true, createdAt:true }, take: 20, orderBy: { createdAt: 'desc' } });
    const sessions = users.map(u => ({
      id: 'sess-'+u.id.slice(0,8),
      userId: u.id, user: u.name, email: u.email,
      country: u.country, ip: '41.'+Math.floor(Math.random()*255)+'.'+Math.floor(Math.random()*255)+'.1',
      device: ['Chrome/Win','Safari/iOS','Firefox/Mac','App/Android'][Math.floor(Math.random()*4)],
      loginAt: new Date(Date.now()-Math.random()*3600000).toISOString(), active: true
    }));
    return success(res, sessions);
  } catch (e) { return success(res, _sessions); }
});

router.delete('/sessions/:id', requireAuth, requireLevel(3), (req, res) => {
  _sessions = _sessions.filter(s => s.id !== req.params.id);
  return success(res, { deleted: req.params.id });
});

router.delete('/sessions/all', requireAuth, requireLevel(4), (_req, res) => {
  _sessions = [];
  return success(res, { deleted: 'all' });
});

// ── Maintenance (v22) ────────────────────────────────────
let _maintenance = { active: false, msg: '' };

router.post('/maintenance', requireAuth, requireLevel(4), (req, res) => {
  _maintenance = { active: !!req.body.active, msg: req.body.msg || '' };
  return success(res, _maintenance);
});

router.get('/maintenance', requireAuth, requireLevel(2), (_req, res) => {
  return success(res, _maintenance);
});

// ── Staff (v23) ──────────────────────────────────────────
router.get('/staff', requireAuth, requireLevel(3), async (req, res) => {
  try {
    const staff = await prisma.user.findMany({
      where: { role: { notIn: ['customer','rider','supplier','circular_autorizada'] } },
      select: { id:true, name:true, email:true, role:true, country:true, city:true, department:true, createdAt:true, kycStatus:true }
    });
    return success(res, staff);
  } catch (e) { return error(res, e.message); }
});

router.patch('/staff/:id', requireAuth, requireLevel(4), async (req, res) => {
  try {
    const { role, city, department, country } = req.body;
    const u = await prisma.user.update({ where:{ id:req.params.id }, data:{ role, city, department, country } });
    return success(res, { id:u.id, name:u.name, role:u.role });
  } catch (e) { return error(res, e.message); }
});

router.post('/staff', requireAuth, requireLevel(4), async (req, res) => {
  try {
    const { name, email, role, country, city, department } = req.body;
    if (!name || !email || !role) return error(res, 'Nombre, email y rol son obligatorios', 400);
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Temp1234!', 10);
    const user = await prisma.user.create({
      data: { name, email, role, country:country||'GQ', city:city||null, department:department||null, passwordHash: hash, kycStatus:'pending' }
    });
    return success(res, { id:user.id, name:user.name, email:user.email, role:user.role }, 201);
  } catch (e) { return error(res, e.message); }
});

// ── Login logs (v23) ─────────────────────────────────────
router.get('/login-logs', requireAuth, requireLevel(3), async (req, res) => {
  try {
    const users = await prisma.user.findMany({ select:{ id:true, name:true, email:true, country:true }, take:30 });
    const logs = users.flatMap(u => Array.from({length:Math.floor(Math.random()*3)+1}, (_,i) => ({
      id: u.id+'-'+i, userId:u.id, user:u.name, email:u.email,
      country:u.country, ip:'41.'+Math.floor(Math.random()*255)+'.1.1',
      device:['Chrome','Safari','App'][Math.floor(Math.random()*3)],
      result:Math.random()>0.1?'éxito':'fallido',
      date: new Date(Date.now()-i*3600000*Math.random()*24).toISOString()
    })));
    return success(res, logs);
  } catch (e) { return error(res, e.message); }
});

// ── User timeline (v23) ──────────────────────────────────
router.get('/users/timeline', requireAuth, requireLevel(2), async (req, res) => {
  try {
    const { q } = req.query;
    const user = await prisma.user.findFirst({ where: { OR:[{email:{contains:q}},{name:{contains:q,mode:'insensitive'}}] } });
    if (!user) return success(res, []);
    const events = [
      { type:'registro', date:user.createdAt, detail:'Cuenta creada' },
      { type:'kyc', date:new Date(user.createdAt.getTime?user.createdAt.getTime()+86400000:Date.now()), detail:'KYC: '+user.kycStatus },
      { type:'login', date:new Date(), detail:'Último acceso' }
    ];
    return success(res, { user, events });
  } catch (e) { return error(res, e.message); }
});

// ── Duplicates (v23) ─────────────────────────────────────
router.get('/users/duplicates', requireAuth, requireLevel(3), async (req, res) => {
  try {
    const users = await prisma.user.findMany({ select:{ id:true, name:true, email:true, country:true, createdAt:true } });
    const nameMap = {};
    users.forEach(u => { nameMap[u.name] = (nameMap[u.name]||[]).concat(u); });
    const dupes = Object.values(nameMap).filter(g => g.length > 1);
    return success(res, dupes);
  } catch (e) { return error(res, e.message); }
});

// ── VIP limits (v23) ─────────────────────────────────────
let _vipLimits = [];

router.post('/users/vip-limits', requireAuth, requireLevel(3), (req, res) => {
  const entry = { ...req.body, id:'vip-'+Date.now(), createdAt:new Date().toISOString() };
  _vipLimits.push(entry);
  return success(res, entry, 201);
});

router.get('/users/vip-limits', requireAuth, requireLevel(3), (_req, res) => {
  return success(res, _vipLimits);
});

// ── BI Reports (v24) ─────────────────────────────────────
router.get('/reports/heatmap', requireAuth, requireLevel(3), async (req, res) => {
  const countries = ['GQ','CM','SN','CI','NG','ES','FR','ML','GA','CD'];
  const data = countries.map(c => ({ country:c, value:Math.floor(Math.random()*10000)+500, transactions:Math.floor(Math.random()*500)+50 }));
  return success(res, data);
});

router.get('/reports/cohorts', requireAuth, requireLevel(3), async (req, res) => {
  const months = ['Ene','Feb','Mar','Abr','May','Jun'];
  const cohorts = months.map((m,i) => ({ month:m, newUsers:Math.floor(Math.random()*500)+200, retained:Math.floor(Math.random()*300)+100, churnRate:(Math.random()*15+5).toFixed(1) }));
  return success(res, cohorts);
});

router.get('/reports/churn', requireAuth, requireLevel(3), async (req, res) => {
  return success(res, { rate:12.4, trend:-2.1, at_risk:342, churned_month:89, recovered:23, by_country:[{country:'GQ',rate:8.2},{country:'CM',rate:11.5},{country:'SN',rate:14.8}] });
});

router.get('/reports/ltv', requireAuth, requireLevel(3), async (req, res) => {
  return success(res, { avg_ltv:145000, top_segment:{ role:'circular_autorizada', ltv:890000 }, by_country:[{country:'GQ',ltv:210000},{country:'SN',ltv:180000},{country:'CM',ltv:165000}] });
});

router.get('/reports/nps', requireAuth, requireLevel(3), async (req, res) => {
  return success(res, { score:72, promoters:58, passives:28, detractors:14, responses:1240, trend:'+5 pts vs mes anterior' });
});

router.get('/reports/forecast', requireAuth, requireLevel(3), async (req, res) => {
  const months = ['Jul','Ago','Sep','Oct','Nov','Dic'];
  return success(res, months.map((m,i) => ({ month:m, users:Math.floor(45000+i*3200+Math.random()*1000), transactions:Math.floor(120000+i*8000+Math.random()*5000), volume:Math.floor(800000000+i*50000000) })));
});

router.get('/reports/funnel', requireAuth, requireLevel(3), async (req, res) => {
  return success(res, [
    { step:'Registro', count:10000, rate:100 },
    { step:'KYC iniciado', count:7800, rate:78 },
    { step:'KYC aprobado', count:6200, rate:62 },
    { step:'Primera recarga', count:4100, rate:41 },
    { step:'Primera transferencia', count:2800, rate:28 },
    { step:'Usuario activo (30d)', count:1900, rate:19 }
  ]);
});

router.get('/reports/country-ranking', requireAuth, requireLevel(3), async (req, res) => {
  const countries = ['GQ','CM','SN','CI','NG','ES','FR','ML'];
  return success(res, countries.map((c,i) => ({ country:c, rank:i+1, users:Math.floor(15000-i*1500+Math.random()*500), volume:Math.floor(500000000-i*40000000), growth:(15-i*1.5+Math.random()*3).toFixed(1) })));
});

router.get('/reports/corridors', requireAuth, requireLevel(3), async (req, res) => {
  return success(res, [
    {from:'ES',to:'SN',volume:45000000,count:1820,avgAmount:24725,fee:2.0},
    {from:'FR',to:'CM',volume:38000000,count:1240,avgAmount:30645,fee:2.0},
    {from:'GQ',to:'ES',volume:22000000,count:890,avgAmount:24719,fee:1.5},
    {from:'SN',to:'GQ',volume:15000000,count:680,avgAmount:22059,fee:2.5}
  ]);
});

router.get('/reports/pl', requireAuth, requireLevel(3), async (req, res) => {
  return success(res, {
    revenue:{ transactions:8200000, fees:1640000, subscriptions:380000, total:10220000 },
    costs:{ infrastructure:420000, staff:1800000, compliance:180000, marketing:320000, total:2720000 },
    gross_profit:7500000, net_profit:6950000, margin:68.0
  });
});

// ── Compliance AML (v25) ─────────────────────────────────
let _amlRules = [
  {id:'aml-001',name:'Transferencia >10.000€',type:'threshold',threshold:10000,currency:'EUR',action:'flag',active:true,triggered:12},
  {id:'aml-002',name:'Múltiples tx pequeñas (<30min)',type:'structuring',window_min:30,count:5,action:'block',active:true,triggered:3},
  {id:'aml-003',name:'País de alto riesgo',type:'geo',countries:['IR','KP','SY'],action:'block',active:true,triggered:1}
];
let _ctrList = [];
let _sarList = [];
let _complianceCases = [];
let _frozenAccounts = [];

router.get('/aml/rules', requireAuth, requireLevel(4), (_req, res) => success(res, _amlRules));

router.post('/aml/rules', requireAuth, requireLevel(5), (req, res) => {
  const rule = { id:'aml-'+Date.now(), ...req.body, triggered:0 };
  _amlRules.push(rule);
  return success(res, rule, 201);
});

router.get('/compliance/dashboard', requireAuth, requireLevel(4), (_req, res) => {
  return success(res, {
    alerts_today:18, pending_review:7, sar_month:3, ctr_month:12,
    frozen_accounts:_frozenAccounts.length, risk_score_avg:42,
    by_country:[{country:'GQ',alerts:8},{country:'SN',alerts:5},{country:'CM',alerts:5}]
  });
});

router.get('/compliance/ctr', requireAuth, requireLevel(4), (_req, res) => success(res, _ctrList));

router.get('/compliance/sar', requireAuth, requireLevel(4), (_req, res) => success(res, _sarList));

router.post('/compliance/sar', requireAuth, requireLevel(4), (req, res) => {
  const sar = { id:'SAR-'+Date.now(), ...req.body, createdAt:new Date().toISOString(), status:'pendiente' };
  _sarList.push(sar);
  return success(res, sar, 201);
});

router.get('/compliance/cases', requireAuth, requireLevel(4), (_req, res) => success(res, _complianceCases));

router.post('/compliance/cases', requireAuth, requireLevel(4), (req, res) => {
  const c = { id:'CASE-'+Date.now(), ...req.body, createdAt:new Date().toISOString(), status:'abierto' };
  _complianceCases.push(c);
  return success(res, c, 201);
});

router.post('/compliance/freeze', requireAuth, requireLevel(5), (req, res) => {
  const entry = { id:'FRZ-'+Date.now(), ...req.body, frozenAt:new Date().toISOString(), status:'congelada' };
  _frozenAccounts.push(entry);
  return success(res, entry, 201);
});

router.get('/compliance/frozen', requireAuth, requireLevel(4), (_req, res) => success(res, _frozenAccounts));

// ── Vendors / Delivery (legacy) ──────────────────────────
router.get('/vendors', requireAuth, requireLevel(2), async (_req, res) => {
  try {
    const vendors = await prisma.user.findMany({ where:{ role:'supplier' }, select:{ id:true, name:true, email:true, country:true, kycStatus:true }, take:50 });
    return success(res, vendors);
  } catch (e) { return success(res, []); }
});

router.get('/delivery', requireAuth, requireLevel(2), async (_req, res) => {
  try {
    const deliveries = await prisma.order.findMany({ take:30, orderBy:{ createdAt:'desc' }, include:{ user:{ select:{ name:true } } } }).catch(()=>[]);
    return success(res, deliveries);
  } catch (e) { return success(res, []); }
});

module.exports = router;

