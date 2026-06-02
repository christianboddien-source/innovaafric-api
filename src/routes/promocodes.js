'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','marketing_manager','country_manager','regional_director'];

let PROMOS = [
  {id:'promo-001',code:'INNOVA2026',type:'porcentaje',value:15,currency:null,minOrder:20000,uses:142,maxUses:500,expires:'2026-12-31',status:'activo',category:'todos'},
  {id:'promo-002',code:'BIENVENIDA',type:'fijo',value:5000,currency:'XAF',minOrder:10000,uses:89,maxUses:1000,expires:'2026-12-31',status:'activo',category:'nuevos'},
  {id:'promo-003',code:'RIDER25',type:'porcentaje',value:25,currency:null,minOrder:0,uses:500,maxUses:500,expires:'2026-05-31',status:'agotado',category:'delivery'},
  {id:'promo-004',code:'VIP50',type:'porcentaje',value:50,currency:null,minOrder:50000,uses:12,maxUses:50,expires:'2026-06-30',status:'activo',category:'vip'}
];

// GET /v1/promo-codes
router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, PROMOS);
});

// POST /v1/promo-codes
router.post('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { code, type, value, minOrder, maxUses, expires, category } = req.body;
  if (!code || !type || !value) return error(res, 'Código, tipo y valor son obligatorios', 400);
  if (PROMOS.find(p => p.code === code.toUpperCase())) return error(res, 'Código ya existe', 409);
  const promo = {
    id: 'promo-'+uuidv4().slice(0,8),
    code: code.toUpperCase(), type, value,
    currency: type === 'fijo' ? (req.body.currency||'XAF') : null,
    minOrder: minOrder||0, uses: 0,
    maxUses: maxUses||100,
    expires: expires || new Date(Date.now()+90*86400000).toISOString().split('T')[0],
    status: 'activo',
    category: category||'todos'
  };
  PROMOS.push(promo);
  return success(res, promo, 201);
});

// PUT /v1/promo-codes/:id/deactivate
router.put('/:id/deactivate', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const p = PROMOS.find(x => x.id === req.params.id);
  if (!p) return error(res, 'Código no encontrado', 404);
  p.status = 'inactivo';
  return success(res, p);
});

// POST /v1/promo-codes/validate
router.post('/validate', requireAuth, async (req, res) => {
  const { code, amount } = req.body;
  const p = PROMOS.find(x => x.code === (code||'').toUpperCase() && x.status === 'activo');
  if (!p) return error(res, 'Código no válido o expirado', 400);
  if (p.maxUses && p.uses >= p.maxUses) return error(res, 'Código agotado', 400);
  if (amount && amount < p.minOrder) return error(res, `Pedido mínimo: ${p.minOrder}`, 400);
  const discount = p.type === 'porcentaje' ? Math.round((amount||0) * p.value / 100) : p.value;
  return success(res, { valid: true, promo: p, discount });
});

module.exports = router;
