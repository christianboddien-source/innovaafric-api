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

module.exports = router;
