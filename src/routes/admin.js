'use strict';

const express = require('express');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, paginate } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /v1/admin/stats — Estadísticas globales
router.get('/stats', requireAuth, requireRole('admin'), (req, res) => {
  const now       = new Date();
  const last24h   = new Date(now - 86400000);
  const last30d   = new Date(now - 30 * 86400000);

  const txns24h   = DB.transactions.filter(t => new Date(t.created_at) > last24h);
  const txns30d   = DB.transactions.filter(t => new Date(t.created_at) > last30d);

  return success(res, {
    timestamp: now.toISOString(),
    users: {
      total: DB.users.length,
      by_role: DB.users.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {}),
      kyc_verified: DB.users.filter(u => u.kyc_status === 'verified').length,
      kyc_pending: DB.users.filter(u => u.kyc_status === 'pending').length
    },
    transactions: {
      total: DB.transactions.length,
      last_24h: txns24h.length,
      last_30d: txns30d.length,
      volume_eur_total: DB.transactions.filter(t => t.currency_sent === 'EUR').reduce((s, t) => s + (t.amount_sent || 0), 0),
      volume_xaf_total: DB.transactions.filter(t => t.currency_sent === 'XAF').reduce((s, t) => s + (t.amount_sent || t.amount || 0), 0),
      by_type: DB.transactions.reduce((acc, t) => { acc[t.type] = (acc[t.type] || 0) + 1; return acc; }, {})
    },
    orders: {
      shop_total: DB.orders.length,
      grocery_total: DB.grocery_orders.length,
      by_status: DB.orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {})
    },
    riders: {
      total: DB.riders.length,
      available: DB.riders.filter(r => r.status === 'available').length,
      busy: DB.riders.filter(r => r.status === 'busy').length
    },
    business: {
      accounts: DB.business_accounts.length,
      invoices_total: DB.invoices.length,
      invoices_paid: DB.invoices.filter(i => i.status === 'paid').length,
      bulk_payments: DB.bulk_payments.length
    },
    loyalty: {
      users_with_points: Object.keys(DB.loyalty).length,
      total_points_issued: Object.values(DB.loyalty).reduce((s, l) => s + l.total_earned, 0)
    },
    tontines: {
      total: DB.tontines.length,
      active: DB.tontines.filter(t => t.status === 'active').length
    },
    notifications: {
      total: DB.notifications.length,
      unread: DB.notifications.filter(n => !n.read).length
    }
  });
});

// GET /v1/admin/users — Listar usuarios
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  const { page = 1, limit = 20, role, kyc_status, country } = req.query;
  let users = DB.users.map(u => ({
    id: u.id, name: u.name, email: u.email, phone: u.phone,
    country: u.country, role: u.role, kyc_status: u.kyc_status,
    created_at: u.created_at
  }));

  if (role)       users = users.filter(u => u.role === role);
  if (kyc_status) users = users.filter(u => u.kyc_status === kyc_status);
  if (country)    users = users.filter(u => u.country === country.toUpperCase());

  return success(res, paginate(users, page, limit));
});

// PATCH /v1/admin/users/:id/kyc — Aprobar/rechazar KYC
router.patch('/users/:id/kyc', requireAuth, requireRole('admin'), (req, res) => {
  const user = DB.users.find(u => u.id === req.params.id);
  if (!user) return error(res, 'Usuario no encontrado', 404);

  const { status } = req.body;
  const validStatuses = ['verified', 'rejected', 'pending', 'under_review'];
  if (!validStatuses.includes(status)) return error(res, `Status inválido: ${validStatuses.join(', ')}`, 400);

  user.kyc_status = status;
  user.kyc_reviewed_at = new Date().toISOString();
  return success(res, { id: user.id, name: user.name, kyc_status: user.kyc_status });
});

// GET /v1/admin/transactions — Últimas transacciones del sistema
router.get('/transactions', requireAuth, requireRole('admin'), (req, res) => {
  const { page = 1, limit = 20, type, currency } = req.query;
  let txns = [...DB.transactions];
  if (type)     txns = txns.filter(t => t.type === type);
  if (currency) txns = txns.filter(t => t.currency_sent === currency || t.currency === currency);
  txns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return success(res, paginate(txns, page, limit));
});

// GET /v1/admin/system — Estado del sistema en tiempo real
router.get('/system', requireAuth, requireRole('admin'), (req, res) => {
  const uptime = process.uptime();
  const mem    = process.memoryUsage();
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
      users: DB.users.length,
      transactions: DB.transactions.length,
      orders: DB.orders.length + DB.grocery_orders.length,
      notifications: DB.notifications.length,
      webhooks: DB.webhooks.length
    },
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
