'use strict';
const express = require('express');
const router  = express.Router();
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','finance_officer','risk_officer','country_manager','regional_director'];

let OPERATORS = [
  {id:'mtn-cm',operator:'MTN MoMo',country:'CM',api:'v2.2',txToday:12420,volToday:28400000,successRate:98.2,latency:1120,status:'operativo'},
  {id:'mtn-gq',operator:'MTN MoMo',country:'GQ',api:'v2.2',txToday:3210,volToday:7100000,successRate:97.8,latency:1340,status:'operativo'},
  {id:'orange-sn',operator:'Orange Money',country:'SN',api:'v3.1',txToday:8920,volToday:21000000,successRate:99.1,latency:980,status:'operativo'},
  {id:'orange-ml',operator:'Orange Money',country:'ML',api:'v3.1',txToday:2140,volToday:4800000,successRate:96.4,latency:1450,status:'operativo'},
  {id:'orange-gn',operator:'Orange Money',country:'GN',api:'v2.5',txToday:1890,volToday:3200000,successRate:94.8,latency:1820,status:'degradado'},
  {id:'wave-sn',operator:'Wave',country:'SN',api:'v1.0',txToday:3420,volToday:7600000,successRate:99.5,latency:820,status:'operativo'},
  {id:'mtn-ng',operator:'MTN MoMo',country:'NG',api:'v2.0',txToday:9800,volToday:18400000,successRate:97.1,latency:1340,status:'operativo'}
];

// GET /v1/mobile-money/operators
router.get('/operators', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, OPERATORS);
});

// GET /v1/mobile-money/operators/:id
router.get('/operators/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const op = OPERATORS.find(o => o.id === req.params.id);
  if (!op) return error(res, 'Operador no encontrado', 404);
  return success(res, op);
});

// POST /v1/mobile-money/operators/:id/test
router.post('/operators/:id/test', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const op = OPERATORS.find(o => o.id === req.params.id);
  if (!op) return error(res, 'Operador no encontrado', 404);
  const latency = Math.round(op.latency * (0.9 + Math.random() * 0.2));
  const ok = Math.random() < op.successRate / 100;
  return success(res, { operator: op.operator, country: op.country, latency, status: ok ? 'ok' : 'error', testedAt: new Date().toISOString() });
});

// PUT /v1/mobile-money/operators/:id/reset
router.put('/operators/:id/reset', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const op = OPERATORS.find(o => o.id === req.params.id);
  if (!op) return error(res, 'Operador no encontrado', 404);
  op.txToday = 0; op.volToday = 0; op.status = 'operativo';
  return success(res, op);
});

module.exports = router;
