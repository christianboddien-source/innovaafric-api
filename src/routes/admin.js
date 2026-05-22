'use strict';

const express = require('express');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, paginate } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /v1/admin/stats — Estadísticas globales
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
      by_role: users.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {}),
      kyc_verified: users.filter(u => u.kycStatus === 'verified').length,
      kyc_pending: users.filter(u => u.kycStatus === 'pending').length
    },
    transactions: {
      total: totalTxns.length, last_24h: txns24h, last_30d: txns30d,
      volume_eur_total: totalTxns.filter(t => t.currencySent === 'EUR').reduce((s, t) => s + (t.amountSent || 0), 0),
      volume_xaf_total: totalTxns.filter(t => t.currencySent === 'XAF').reduce((s, t) => s + (t.amountSent || 0), 0),
      by_type: totalTxns.reduce((acc, t) => { acc[t.type] = (acc[t.type] || 0) + 1; return acc; }, {})
    },
    orders: {
      shop_total: shopOrders.length,
      grocery_total: groceryOrders,
      by_status: shopOrders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {})
    },
    riders: {
      total: riders.length,
      available: riders.filter(r => r.status === 'available').length,
      busy: riders.filter(r => r.status === 'busy').length
    },
    business: {
      accounts: bizAccounts,
      invoices_total: invoices.length,
      invoices_paid: invoices.filter(i => i.status === 'paid').length,
      bulk_payments: bulkPayments
    },
    loyalty: {
      users_with_points: loyaltyAccounts._count.id,
      total_points_issued: loyaltyAccounts._sum.totalEarned || 0
    },
    tontines: {
      total: tontines.length,
      active: tontines.filter(t => t.status === 'active').length
    },
    notifications: {
      total: totalNotifs,
      unread: notifications._count.id
    }
  });
});

// GET /v1/admin/users — Listar usuarios
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { page = 1, limit = 20, role, kyc_status, country } = req.query;
  const where = {};
  if (role) where.role = role;
  if (kyc_status) where.kycStatus = kyc_status;
  if (country) where.country = country.toUpperCase();

  const users = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, phone: true, country: true, role: true, kycStatus: true, createdAt: true }
  });
  return success(res, paginate(users, page, limit));
});

// PATCH /v1/admin/users/:id/kyc — Aprobar/rechazar KYC
router.patch('/users/:id/kyc', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return error(res, 'Usuario no encontrado', 404);

  const { status } = req.body;
  const validStatuses = ['verified', 'rejected', 'pending', 'under_review'];
  if (!validStatuses.includes(status)) return error(res, `Status inválido: ${validStatuses.join(', ')}`, 400);

  const updated = await prisma.user.update({ where: { id: req.params.id }, data: { kycStatus: status } });
  return success(res, { id: updated.id, name: updated.name, kyc_status: updated.kycStatus });
});

// GET /v1/admin/transactions — Últimas transacciones del sistema
router.get('/transactions', requireAuth, requireRole('admin'), async (req, res) => {
  const { page = 1, limit = 20, type, currency } = req.query;
  const where = {};
  if (type) where.type = type;
  if (currency) where.currencySent = currency;

  const txns = await prisma.transaction.findMany({ where, orderBy: { createdAt: 'desc' } });
  return success(res, paginate(txns, page, limit));
});

// GET /v1/admin/system — Estado del sistema en tiempo real
router.get('/system', requireAuth, requireRole('admin'), async (req, res) => {
  const uptime = process.uptime();
  const mem = process.memoryUsage();

  const [users, txns, orders, gorders, notifs, webhooks] = await Promise.all([
    prisma.user.count(), prisma.transaction.count(),
    prisma.order.count(), prisma.groceryOrder.count(),
    prisma.notification.count(), prisma.webhook.count()
  ]);

  return success(res, {
    uptime_seconds: Math.floor(uptime),
    uptime_human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    node_version: process.version,
    memory: {
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10,
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024 * 10) / 10,
      rss_mb: Math.round(mem.rss / 1024 / 1024 * 10) / 10
    },
    db_records: {
      users, transactions: txns,
      orders: orders + gorders,
      notifications: notifs, webhooks
    },
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
