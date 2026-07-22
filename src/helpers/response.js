'use strict';

const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');

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

async function getRate(from, to) {
  if (from === to) return 1;
  const record = await prisma.exchangeRate.findUnique({ where: { pair: `${from}-${to}` } });
  return record?.rate || null;
}

function calcFee(amount, type = 'send') {
  const feeRates = { send: 0.02, withdraw: 0.015, exchange: 0.005, p2p: 0 };
  return Math.round((amount * (feeRates[type] || 0.02)) * 100) / 100;
}

async function triggerWebhook(event, data) {
  const payload = JSON.stringify(data);
  console.log(`[WEBHOOK] ${event}:`, payload.slice(0, 80));
  try {
    await prisma.webhook.create({ data: { id: uuidv4(), event, data: payload } });
  } catch { /* no bloquear si falla el webhook */ }
}

module.exports = { success, error, paginate, getRate, calcFee, triggerWebhook };
