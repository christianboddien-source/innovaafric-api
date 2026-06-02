'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','finance_officer','risk_officer','country_manager','regional_director'];

let FUNDS = [
  {id:'fund-001',name:'Fondo Agricola África Oeste',category:'agricultura',target:50000000,raised:32400000,currency:'XAF',investors:128,minInvest:25000,return:8.5,duration:24,status:'activo',progress:64},
  {id:'fund-002',name:'Fondo Energías Renovables',category:'energia',target:80000000,raised:80000000,currency:'XAF',investors:215,minInvest:50000,return:11.2,duration:36,status:'completo',progress:100},
  {id:'fund-003',name:'Fondo Inmobiliario Malabo',category:'inmobiliario',target:120000000,raised:45000000,currency:'XAF',investors:67,minInvest:100000,return:9.8,duration:48,status:'activo',progress:37}
];

// GET /v1/invest/funds
router.get('/funds', requireAuth, async (req, res) => {
  return success(res, FUNDS);
});

// POST /v1/invest/funds
router.post('/funds', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { name, category, target, currency, minInvest, return: ret, duration } = req.body;
  if (!name || !target) return error(res, 'Nombre y objetivo son obligatorios', 400);
  const fund = {
    id: 'fund-'+uuidv4().slice(0,8),
    name, category: category||'general',
    target, raised: 0, currency: currency||'XAF',
    investors: 0, minInvest: minInvest||10000,
    return: ret||5.0, duration: duration||12,
    status: 'activo', progress: 0
  };
  FUNDS.push(fund);
  return success(res, fund, 201);
});

// POST /v1/invest/funds/:id/invest
router.post('/funds/:id/invest', requireAuth, async (req, res) => {
  const fund = FUNDS.find(f => f.id === req.params.id);
  if (!fund) return error(res, 'Fondo no encontrado', 404);
  const { amount } = req.body;
  if (!amount || amount < fund.minInvest) return error(res, `Inversión mínima: ${fund.minInvest} ${fund.currency}`, 400);
  fund.raised = Math.min(fund.target, fund.raised + amount);
  fund.investors += 1;
  fund.progress = Math.round((fund.raised / fund.target) * 100);
  if (fund.raised >= fund.target) fund.status = 'completo';
  return success(res, fund);
});

module.exports = router;
