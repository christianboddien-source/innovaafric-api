'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','finance_officer','risk_officer','country_manager','regional_director'];

// Demo store (en producción usar modelo Prisma Insurance*)
let PLANS = [
  {id:'plan-001',name:'Seguro de Vida Básico',type:'vida',coverage:500000,premium:2990,currency:'XAF',duration:12,provider:'AXA Africa',status:'activo',subscribers:342,claims:12},
  {id:'plan-002',name:'Seguro Médico Básico',type:'salud',coverage:1000000,premium:4990,currency:'XAF',duration:12,provider:'Allianz',status:'activo',subscribers:215,claims:28},
  {id:'plan-003',name:'Seguro de Cosecha',type:'agricola',coverage:300000,premium:1990,currency:'XAF',duration:6,provider:'AgrInsure',status:'activo',subscribers:89,claims:5},
  {id:'plan-004',name:'Seguro Moto Rider',type:'vehiculo',coverage:200000,premium:3500,currency:'XAF',duration:12,provider:'NSIA',status:'activo',subscribers:178,claims:41}
];
let CLAIMS = [
  {id:'clm-001',planId:'plan-001',planName:'Seguro de Vida Básico',user:'amara@test.com',amount:50000,currency:'XAF',status:'aprobada',date:'2026-05-20',description:'Hospitalización'},
  {id:'clm-002',planId:'plan-002',planName:'Seguro Médico Básico',user:'carlos@test.com',amount:120000,currency:'XAF',status:'pendiente',date:'2026-06-01',description:'Cirugía'},
  {id:'clm-003',planId:'plan-003',planName:'Seguro de Cosecha',user:'farmer@test.com',amount:80000,currency:'XAF',status:'revisión',date:'2026-05-28',description:'Pérdida de cosecha por sequía'}
];

// GET /v1/insurance/plans
router.get('/plans', requireAuth, async (req, res) => {
  return success(res, PLANS);
});

// POST /v1/insurance/plans
router.post('/plans', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { name, type, coverage, premium, currency, duration, provider } = req.body;
  if (!name || !type || !coverage || !premium) return error(res, 'Faltan campos obligatorios', 400);
  const plan = { id:'plan-'+uuidv4().slice(0,8), name, type, coverage, premium, currency:currency||'XAF', duration:duration||12, provider:provider||'—', status:'activo', subscribers:0, claims:0 };
  PLANS.push(plan);
  return success(res, plan, 201);
});

// GET /v1/insurance/claims
router.get('/claims', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, CLAIMS);
});

// PATCH /v1/insurance/claims/:id — actualizar estado genérico
router.patch('/claims/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const claim = CLAIMS.find(c => c.id === req.params.id);
  if (!claim) return error(res, 'Siniestro no encontrado', 404);
  Object.assign(claim, req.body);
  return success(res, claim);
});

// POST /v1/insurance/claims/:id/approve
router.post('/claims/:id/approve', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const claim = CLAIMS.find(c => c.id === req.params.id);
  if (!claim) return error(res, 'Siniestro no encontrado', 404);
  claim.status = 'aprobada';
  return success(res, claim);
});

// POST /v1/insurance/claims/:id/reject
router.post('/claims/:id/reject', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const claim = CLAIMS.find(c => c.id === req.params.id);
  if (!claim) return error(res, 'Siniestro no encontrado', 404);
  claim.status = 'rechazada';
  return success(res, claim);
});

module.exports = router;
