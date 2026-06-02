'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','finance_officer','country_manager','regional_director'];

let ACCOUNTS = [
  {id:'acct_GQ001',merchant:'InnovaAFRIC GQ',country:'GQ',type:'standard',vol:1280000,commission:2.9,payouts:'mensual',status:'activo'},
  {id:'acct_SN002',merchant:'Wave Partner SN',country:'SN',type:'express',vol:4200000,commission:2.5,payouts:'semanal',status:'activo'},
  {id:'acct_ES003',merchant:'InnovaAFRIC SL',country:'ES',type:'standard',vol:890000,commission:1.4,payouts:'mensual',status:'activo'},
  {id:'acct_CM004',merchant:'Jumia CM Connect',country:'CM',type:'custom',vol:2100000,commission:3.2,payouts:'mensual',status:'suspendido'}
];

// GET /v1/stripe/accounts
router.get('/accounts', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, ACCOUNTS);
});

// POST /v1/stripe/accounts
router.post('/accounts', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { merchant, country, type, email } = req.body;
  if (!merchant || !country) return error(res, 'Merchant y país son obligatorios', 400);
  const rand = Array.from({length:6},()=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random()*36)]).join('');
  const acc = { id:'acct_'+rand, merchant, country, type:type||'standard', email:email||'—', vol:0, commission:2.9, payouts:'mensual', status:'activo' };
  ACCOUNTS.push(acc);
  return success(res, acc, 201);
});

// POST /v1/stripe/payouts
router.post('/payouts', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { account } = req.body;
  const acc = ACCOUNTS.find(a => a.id === account);
  if (!acc) return error(res, 'Cuenta Stripe no encontrada', 404);
  if (acc.status !== 'activo') return error(res, 'Cuenta suspendida', 400);
  return success(res, { accountId: account, payoutId: 'po_'+uuidv4().slice(0,16), amount: acc.vol * 0.971, currency: 'EUR', status: 'pending', eta: '2-3 días hábiles' });
});

module.exports = router;
