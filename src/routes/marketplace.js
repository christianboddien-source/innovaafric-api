'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','business_developer','country_manager','regional_director'];

let PRODUCTS = [
  {id:'mp-001',name:'iPhone 15 Pro (usado)',merchant:'TechShop Malabo',category:'electronica',price:320000,currency:'XAF',stock:3,rating:4.8,sales:12,status:'activo'},
  {id:'mp-002',name:'Arroz Basmati 25kg',merchant:'AgroMarket Yaundé',category:'alimentacion',price:18500,currency:'XAF',stock:50,rating:4.6,sales:89,status:'activo'},
  {id:'mp-003',name:'Boubou tradicional',merchant:'FashionHub Dakar',category:'moda',price:35000,currency:'XOF',stock:8,rating:4.4,sales:34,status:'activo'},
  {id:'mp-004',name:'Panel solar 200W',merchant:'EcoShop GQ',category:'energia',price:85000,currency:'XAF',stock:0,rating:4.9,sales:7,status:'agotado'}
];

// GET /v1/marketplace/products
router.get('/products', requireAuth, async (req, res) => {
  const { category, status } = req.query;
  let list = PRODUCTS;
  if (category) list = list.filter(p => p.category === category);
  if (status) list = list.filter(p => p.status === status);
  return success(res, list);
});

// POST /v1/marketplace/products
router.post('/products', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { name, merchant, category, price, currency, stock } = req.body;
  if (!name || !price || !merchant) return error(res, 'Faltan campos obligatorios', 400);
  const p = {
    id: 'mp-'+uuidv4().slice(0,8),
    name, merchant, category: category||'general',
    price, currency: currency||'XAF',
    stock: stock||0, rating: 5.0, sales: 0,
    status: stock > 0 ? 'activo' : 'agotado'
  };
  PRODUCTS.push(p);
  return success(res, p, 201);
});

// PUT /v1/marketplace/products/:id
router.put('/products/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const p = PRODUCTS.find(x => x.id === req.params.id);
  if (!p) return error(res, 'Producto no encontrado', 404);
  Object.assign(p, req.body);
  return success(res, p);
});

module.exports = router;
