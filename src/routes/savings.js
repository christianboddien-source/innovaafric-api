'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','finance_officer','country_manager','regional_director'];

let GOALS = [
  {id:'sav-001',user:'amara@test.com',name:'Fondo de emergencia',target:500000,current:210000,currency:'XAF',deadline:'2026-12-31',autoSave:5000,status:'activo',progress:42},
  {id:'sav-002',user:'carlos@test.com',name:'Vacaciones Europa',target:800000,current:680000,currency:'XAF',deadline:'2026-08-01',autoSave:20000,status:'activo',progress:85},
  {id:'sav-003',user:'test@test.com',name:'Negocio propio',target:2000000,current:450000,currency:'XAF',deadline:'2027-06-01',autoSave:30000,status:'activo',progress:22}
];

// GET /v1/savings/goals
router.get('/goals', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, GOALS);
});

// POST /v1/savings/goals
router.post('/goals', requireAuth, async (req, res) => {
  const { name, target, currency, deadline, autoSave } = req.body;
  if (!name || !target) return error(res, 'Nombre y objetivo son obligatorios', 400);
  const goal = {
    id: 'sav-'+uuidv4().slice(0,8),
    user: req.user?.email || 'user',
    name, target, current: 0, currency: currency||'XAF',
    deadline: deadline||null, autoSave: autoSave||0,
    status: 'activo', progress: 0
  };
  GOALS.push(goal);
  return success(res, goal, 201);
});

// GET /v1/savings/goals/:id
router.get('/goals/:id', requireAuth, async (req, res) => {
  const goal = GOALS.find(g => g.id === req.params.id);
  if (!goal) return error(res, 'Meta no encontrada', 404);
  return success(res, goal);
});

module.exports = router;
