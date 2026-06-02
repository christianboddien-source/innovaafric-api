'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','business_developer','country_manager','regional_director'];

let MERCHANTS = [
  {id:'mer-001',name:'TechShop Malabo',category:'electronica',country:'GQ',city:'Malabo',contact:'techshop@gq.com',phone:'+240 222 100 001',revenue:4200000,currency:'XAF',orders:142,rating:4.7,status:'activo',joined:'2025-09-01'},
  {id:'mer-002',name:'AgroMarket Yaundé',category:'alimentacion',country:'CM',city:'Yaundé',contact:'agro@cm.com',phone:'+237 222 200 002',revenue:2800000,currency:'XAF',orders:89,rating:4.3,status:'activo',joined:'2025-11-15'},
  {id:'mer-003',name:'FashionHub Dakar',category:'moda',country:'SN',city:'Dakar',contact:'fashion@sn.com',phone:'+221 77 300 003',revenue:1900000,currency:'XOF',orders:67,rating:4.5,status:'activo',joined:'2026-01-10'},
  {id:'mer-004',name:'HomeDecor Madrid',category:'hogar',country:'ES',city:'Madrid',contact:'home@es.com',phone:'+34 91 400 004',revenue:3100000,currency:'EUR',orders:112,rating:4.1,status:'suspendido',joined:'2025-06-20'}
];

// GET /v1/merchants
router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { status, country } = req.query;
  let list = MERCHANTS;
  if (status) list = list.filter(m => m.status === status);
  if (country) list = list.filter(m => m.country === country);
  return success(res, list);
});

// POST /v1/merchants
router.post('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { name, category, country, city, contact, phone } = req.body;
  if (!name || !country || !contact) return error(res, 'Faltan campos obligatorios', 400);
  const m = {
    id: 'mer-'+uuidv4().slice(0,8),
    name, category: category||'general', country, city: city||'—',
    contact, phone: phone||'—',
    revenue: 0, currency: country==='ES'||country==='FR'||country==='DE'?'EUR':country==='NG'?'USD':'XAF',
    orders: 0, rating: 5.0, status: 'activo',
    joined: new Date().toISOString().split('T')[0]
  };
  MERCHANTS.push(m);
  return success(res, m, 201);
});

// PATCH /v1/merchants/:id — actualizar datos
router.patch('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const m = MERCHANTS.find(x => x.id === req.params.id);
  if (!m) return error(res, 'Merchant no encontrado', 404);
  Object.assign(m, req.body);
  return success(res, m);
});

// PUT /v1/merchants/:id/status
router.put('/:id/status', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const m = MERCHANTS.find(x => x.id === req.params.id);
  if (!m) return error(res, 'Merchant no encontrado', 404);
  m.status = req.body.status || m.status;
  return success(res, m);
});

module.exports = router;
