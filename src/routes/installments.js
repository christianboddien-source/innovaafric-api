'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','loan_officer','finance_officer','risk_officer','country_manager','regional_director'];

let INSTALLMENTS = [
  {id:'inst-001',user:'Amara Diallo',email:'amara@test.com',product:'Samsung Galaxy A55',total:250000,currency:'XAF',paid:125000,remaining:125000,months:6,monthlyFee:41667,nextDue:'2026-07-01',status:'activo',progress:50},
  {id:'inst-002',user:'Carlos Martínez',email:'carlos@test.com',product:'Laptop Dell Inspiron',total:480000,currency:'XAF',paid:160000,remaining:320000,months:12,monthlyFee:40000,nextDue:'2026-06-15',status:'activo',progress:33},
  {id:'inst-003',user:'Fatou Seck',email:'fatou@test.com',product:'Moto Honda 125',total:650000,currency:'XAF',paid:650000,remaining:0,months:12,monthlyFee:54167,nextDue:null,status:'completado',progress:100}
];

// GET /v1/installments
router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, INSTALLMENTS);
});

// POST /v1/installments
router.post('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { user, email, product, total, currency, months } = req.body;
  if (!product || !total || !months) return error(res, 'Faltan campos obligatorios', 400);
  const monthlyFee = Math.ceil(total / months);
  const inst = {
    id: 'inst-'+uuidv4().slice(0,8),
    user: user||'—', email: email||'—', product,
    total, currency: currency||'XAF',
    paid: 0, remaining: total,
    months, monthlyFee,
    nextDue: new Date(Date.now()+30*86400000).toISOString().split('T')[0],
    status: 'activo', progress: 0
  };
  INSTALLMENTS.push(inst);
  return success(res, inst, 201);
});

// POST /v1/installments/:id/pay
router.post('/:id/pay', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const inst = INSTALLMENTS.find(i => i.id === req.params.id);
  if (!inst) return error(res, 'Cuota no encontrada', 404);
  inst.paid += inst.monthlyFee;
  inst.remaining = Math.max(0, inst.total - inst.paid);
  inst.progress = Math.round((inst.paid / inst.total) * 100);
  if (inst.remaining === 0) inst.status = 'completado';
  return success(res, inst);
});

module.exports = router;
