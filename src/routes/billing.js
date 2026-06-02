'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','business_developer','finance_officer','country_manager','regional_director'];

let INVOICES = [
  {id:'inv-001',partner:'Wave Sénégal',amount:310000,currency:'XOF',period:'Mayo 2026',due:'2026-06-15',status:'pendiente',date:'2026-06-01'},
  {id:'inv-002',partner:'Jumia Camerún',amount:267000,currency:'XAF',period:'Mayo 2026',due:'2026-06-15',status:'pagada',date:'2026-06-01'},
  {id:'inv-003',partner:'Orange Fintech',amount:378000,currency:'XOF',period:'Abril 2026',due:'2026-05-15',status:'pagada',date:'2026-05-01'},
  {id:'inv-004',partner:'Shopify ES',amount:224000,currency:'EUR',period:'Abril 2026',due:'2026-05-15',status:'vencida',date:'2026-05-01'}
];

// GET /v1/billing/invoices
router.get('/invoices', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, INVOICES);
});

// POST /v1/billing/invoices
router.post('/invoices', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { partner, amount, currency, period, due } = req.body;
  if (!partner || !amount) return error(res, 'Faltan campos obligatorios', 400);
  const inv = {
    id: 'inv-'+uuidv4().slice(0,8),
    partner, amount, currency: currency||'XAF',
    period: period||new Date().toLocaleDateString('es',{month:'long',year:'numeric'}),
    due: due||new Date(Date.now()+15*86400000).toISOString().split('T')[0],
    status: 'pendiente',
    date: new Date().toISOString().split('T')[0]
  };
  INVOICES.push(inv);
  return success(res, inv, 201);
});

// PUT /v1/billing/invoices/:id/pay
router.put('/invoices/:id/pay', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const inv = INVOICES.find(i => i.id === req.params.id);
  if (!inv) return error(res, 'Factura no encontrada', 404);
  inv.status = 'pagada';
  return success(res, inv);
});

module.exports = router;
