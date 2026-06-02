'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','business_developer','finance_officer','country_manager','regional_director'];

let PARTNERS = [
  {id:'par-001',name:'Wave Sénégal',type:'fintech',country:'SN',contact:'api@wave.com',phone:'+221 78 000 001',revenue:12400000,currency:'XOF',share:2.5,txCount:4280,status:'activo',joined:'2025-03-01'},
  {id:'par-002',name:'Jumia Camerún',type:'ecommerce',country:'CM',contact:'tech@jumia.cm',phone:'+237 699 000 002',revenue:8900000,currency:'XAF',share:3.0,txCount:1890,status:'activo',joined:'2025-07-15'},
  {id:'par-003',name:'Orange Fintech',type:'telecom',country:'SN',contact:'fintech@orange.sn',phone:'+221 77 000 003',revenue:21000000,currency:'XOF',share:1.8,txCount:9200,status:'activo',joined:'2024-11-01'},
  {id:'par-004',name:'Shopify ES',type:'ecommerce',country:'ES',contact:'partners@shopify.es',phone:'+34 91 000 004',revenue:5600000,currency:'EUR',share:4.0,txCount:890,status:'suspendido',joined:'2025-12-01'}
];

let INVOICES = [
  {id:'inv-001',partner:'Wave Sénégal',amount:310000,currency:'XOF',period:'Mayo 2026',due:'2026-06-15',status:'pendiente',date:'2026-06-01'},
  {id:'inv-002',partner:'Jumia Camerún',amount:267000,currency:'XAF',period:'Mayo 2026',due:'2026-06-15',status:'pagada',date:'2026-06-01'},
  {id:'inv-003',partner:'Orange Fintech',amount:378000,currency:'XOF',period:'Abril 2026',due:'2026-05-15',status:'pagada',date:'2026-05-01'},
  {id:'inv-004',partner:'Shopify ES',amount:224000,currency:'EUR',period:'Abril 2026',due:'2026-05-15',status:'vencida',date:'2026-05-01'}
];

// GET /v1/partners
router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { status } = req.query;
  const list = status ? PARTNERS.filter(p => p.status === status) : PARTNERS;
  return success(res, list);
});

// POST /v1/partners
router.post('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { name, type, country, contact, phone, share } = req.body;
  if (!name || !country || !contact) return error(res, 'Faltan campos obligatorios', 400);
  const p = {
    id: 'par-'+uuidv4().slice(0,8),
    name, type: type||'fintech', country, contact, phone: phone||'—',
    revenue: 0, currency: country==='ES'||country==='FR'?'EUR':'XAF',
    share: share||2.5, txCount: 0, status: 'activo',
    joined: new Date().toISOString().split('T')[0]
  };
  PARTNERS.push(p);
  return success(res, p, 201);
});

// GET /v1/partners/billing/invoices
router.get('/billing/invoices', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, INVOICES);
});

// POST /v1/partners/billing/invoices
router.post('/billing/invoices', requireAuth, requireRole(...ADMIN), async (req, res) => {
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

// PUT /v1/partners/billing/invoices/:id/pay
router.put('/billing/invoices/:id/pay', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const inv = INVOICES.find(i => i.id === req.params.id);
  if (!inv) return error(res, 'Factura no encontrada', 404);
  inv.status = 'pagada';
  return success(res, inv);
});

// GET /v1/partners/white-label/instances
router.get('/white-label/instances', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, [
    {id:'wl-001',name:'WaveApp Pro',partner:'Wave Sénégal',domain:'wave-pro.innovaafric.com',color:'#1a56db',users:1280,txToday:342,status:'activo'},
    {id:'wl-002',name:'JumiaPay',partner:'Jumia Camerún',domain:'jumiapay.innovaafric.com',color:'#f97316',users:890,txToday:121,status:'activo'},
    {id:'wl-003',name:'OrangeWallet',partner:'Orange Fintech',domain:'owallet.innovaafric.com',color:'#f59e0b',users:3400,txToday:891,status:'activo'}
  ]);
});

// POST /v1/partners/white-label/instances
router.post('/white-label/instances', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { name, partner, domain, color } = req.body;
  if (!name || !partner || !domain) return error(res, 'Faltan campos obligatorios', 400);
  return success(res, {
    id: 'wl-'+uuidv4().slice(0,8), name, partner, domain, color: color||'#06b6d4',
    users: 0, txToday: 0, status: 'activo'
  }, 201);
});

module.exports = router;
