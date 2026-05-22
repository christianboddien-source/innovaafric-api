'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, getRate, calcFee } = require('../helpers/response');
const { requireAuth } = require('../middleware/auth');

// GET /v1/utils/rates
router.get('/rates', (req, res) => {
  const { from, to } = req.query;
  if (from && to) {
    const rate = getRate(from.toUpperCase(), to.toUpperCase());
    if (!rate) return error(res, `Par ${from}/${to} no disponible`, 404);
    return success(res, { from: from.toUpperCase(), to: to.toUpperCase(), rate, fee_pct: 2, updated_at: new Date().toISOString() });
  }
  return success(res, { rates: DB.exchange_rates, updated_at: new Date().toISOString(), source: 'BCEAO + mercado' });
});

// GET /v1/utils/convert
router.get('/convert', (req, res) => {
  const { amount = 100, from = 'EUR', to = 'XAF' } = req.query;
  const rate = getRate(from.toUpperCase(), to.toUpperCase());
  if (!rate) return error(res, `Par ${from}/${to} no disponible`, 404);
  const fee = calcFee(parseFloat(amount), 'send');
  const net = parseFloat(amount) - fee;
  return success(res, {
    amount_sent: parseFloat(amount),
    currency_sent: from.toUpperCase(),
    fee, net_amount: net, rate,
    amount_received: Math.round(net * rate * 100) / 100,
    currency_received: to.toUpperCase(),
    fee_pct: '2%',
    estimated_time: 'Inmediato'
  });
});

// POST /v1/utils/webhooks/register
router.post('/webhooks/register', requireAuth, (req, res) => {
  const { url, events } = req.body;
  if (!url || !events || events.length === 0) return error(res, 'url y events requeridos', 400);
  const wh = {
    id: `wh_${uuidv4().slice(0, 8)}`,
    user_id: req.user.sub, url, events,
    secret: `whs_${uuidv4().replace(/-/g, '')}`,
    active: true,
    created_at: new Date().toISOString()
  };
  return success(res, { ...wh, message: 'Guarda el secret — solo visible una vez' }, 201);
});

// GET /v1/utils/webhooks/events
router.get('/webhooks/events', requireAuth, (req, res) => {
  const events = DB.webhooks.slice(-20).reverse();
  return success(res, { events, total: DB.webhooks.length });
});

// GET /v1/utils/health
router.get('/health', (_req, res) => {
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

module.exports = router;
