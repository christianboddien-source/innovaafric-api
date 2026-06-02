'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','support_agent','support_supervisor','country_manager','regional_director'];

let REFUNDS = [
  {id:'ref-001',orderId:'ORD-2026-0412',user:'amara@test.com',merchant:'TechShop Malabo',amount:45000,currency:'XAF',reason:'producto_defectuoso',status:'pendiente',date:'2026-06-01',notes:''},
  {id:'ref-002',orderId:'ORD-2026-0389',user:'carlos@test.com',merchant:'AgroMarket Yaundé',amount:12000,currency:'XAF',reason:'no_recibido',status:'aprobada',date:'2026-05-28',notes:'Confirmado por rider'},
  {id:'ref-003',orderId:'ORD-2026-0301',user:'fatou@test.com',merchant:'FashionHub Dakar',amount:25000,currency:'XOF',reason:'talla_incorrecta',status:'completada',date:'2026-05-20',notes:'Reembolsado'},
  {id:'ref-004',orderId:'ORD-2026-0280',user:'test@test.com',merchant:'HomeDecor Madrid',amount:89000,currency:'EUR',reason:'arrepentimiento',status:'rechazada',date:'2026-05-15',notes:'Fuera del plazo de 14 días'}
];

// GET /v1/refunds
router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { status } = req.query;
  const list = status ? REFUNDS.filter(r => r.status === status) : REFUNDS;
  return success(res, list);
});

// PATCH /v1/refunds/:id — actualizar estado genérico
router.patch('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const r = REFUNDS.find(x => x.id === req.params.id);
  if (!r) return error(res, 'Devolución no encontrada', 404);
  Object.assign(r, req.body);
  return success(res, r);
});

// POST /v1/refunds/:id/approve
router.post('/:id/approve', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const r = REFUNDS.find(x => x.id === req.params.id);
  if (!r) return error(res, 'Devolución no encontrada', 404);
  r.status = 'aprobada';
  r.notes = req.body.notes || r.notes;
  return success(res, r);
});

// POST /v1/refunds/:id/reject
router.post('/:id/reject', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const r = REFUNDS.find(x => x.id === req.params.id);
  if (!r) return error(res, 'Devolución no encontrada', 404);
  r.status = 'rechazada';
  r.notes = req.body.notes || r.notes;
  return success(res, r);
});

// POST /v1/refunds/:id/process
router.post('/:id/process', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const r = REFUNDS.find(x => x.id === req.params.id);
  if (!r) return error(res, 'Devolución no encontrada', 404);
  if (r.status !== 'aprobada') return error(res, 'Solo se pueden procesar devoluciones aprobadas', 400);
  r.status = 'completada';
  r.notes = 'Reembolsado el ' + new Date().toLocaleDateString('es');
  return success(res, r);
});

module.exports = router;
