'use strict';

const express = require('express');
const router  = express.Router();

const DB = require('../config/db');
const { success } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /v1/admin/stats
router.get('/stats', requireAuth, requireRole('admin'), (req, res) => {
  return success(res, {
    users: {
      total: DB.users.length,
      by_role: DB.users.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {})
    },
    transactions: {
      total: DB.transactions.length,
      total_volume_eur: DB.transactions
        .filter(t => t.currency_sent === 'EUR')
        .reduce((s, t) => s + t.amount_sent, 0)
    },
    orders: {
      shop: DB.orders.length,
      grocery: DB.grocery_orders.length
    },
    riders: {
      total: DB.riders.length,
      available: DB.riders.filter(r => r.status === 'available').length
    }
  });
});

module.exports = router;
