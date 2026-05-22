'use strict';

const DB = require('../config/db');

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

function triggerWebhook(event, data) {
  const payload = { event, data, timestamp: new Date().toISOString(), id: require('uuid').v4() };
  DB.webhooks.push(payload);
  console.log(`[WEBHOOK] ${event}:`, JSON.stringify(data).slice(0, 80));
}

module.exports = { success, error, paginate, getRate, calcFee, triggerWebhook };
