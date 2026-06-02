'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','finance_officer','compliance_officer','country_manager','regional_director'];

let TRANSFERS = [
  {id:'sw-001',ref:'SWIFT-2026-0142',type:'SWIFT',origin:'ES',dest:'SN',amount:45000,currency:'EUR',bic:'BNPAFRPP',date:'2026-06-02T09:15:00Z',status:'liquidado'},
  {id:'sw-002',ref:'SEPA-2026-0891',type:'SEPA',origin:'ES',dest:'FR',amount:12500,currency:'EUR',bic:'BNPAFRPP',date:'2026-06-02T11:30:00Z',status:'procesando'},
  {id:'sw-003',ref:'SWIFT-2026-0141',type:'SWIFT',origin:'FR',dest:'GH',amount:28000,currency:'EUR',bic:'SGSGFRPP',date:'2026-06-01T14:20:00Z',status:'liquidado'},
  {id:'sw-004',ref:'SEPA-2026-0890',type:'SEPA',origin:'DE',dest:'ES',amount:8750,currency:'EUR',bic:'DEUTDEDB',date:'2026-06-01T16:45:00Z',status:'liquidado'},
  {id:'sw-005',ref:'SEPA-2026-0889',type:'SEPA',origin:'ES',dest:'IT',amount:3200,currency:'EUR',bic:'BBVAESMM',date:'2026-06-02T08:00:00Z',status:'rechazado'}
];

// GET /v1/swift/transfers
router.get('/transfers', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { type, status } = req.query;
  let list = TRANSFERS;
  if (type) list = list.filter(t => t.type === type.toUpperCase());
  if (status) list = list.filter(t => t.status === status);
  return success(res, list);
});

// POST /v1/swift/transfers
router.post('/transfers', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { type, origin, dest, amount, currency, bic } = req.body;
  if (!type || !origin || !dest || !amount) return error(res, 'Faltan campos obligatorios', 400);
  const prefix = (type||'SWIFT').toUpperCase() === 'SEPA' ? 'SEPA' : 'SWIFT';
  const seq = String(TRANSFERS.length + 143).padStart(4,'0');
  const t = {
    id: 'sw-'+uuidv4().slice(0,8),
    ref: `${prefix}-2026-${seq}`,
    type: prefix, origin, dest,
    amount, currency: currency||'EUR',
    bic: bic||'—',
    date: new Date().toISOString(),
    status: 'procesando'
  };
  TRANSFERS.push(t);
  return success(res, t, 201);
});

// GET /v1/swift/stats
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const totalVol = TRANSFERS.filter(t=>t.status==='liquidado').reduce((s,t)=>s+t.amount,0);
  return success(res, {
    total: TRANSFERS.length,
    liquidado: TRANSFERS.filter(t=>t.status==='liquidado').length,
    procesando: TRANSFERS.filter(t=>t.status==='procesando').length,
    rechazado: TRANSFERS.filter(t=>t.status==='rechazado').length,
    totalVolume: totalVol,
    swiftCount: TRANSFERS.filter(t=>t.type==='SWIFT').length,
    sepaCount: TRANSFERS.filter(t=>t.type==='SEPA').length
  });
});

module.exports = router;
