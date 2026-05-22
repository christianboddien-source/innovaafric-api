'use strict';

const express = require('express');
const router  = express.Router();

const DB = require('../config/db');
const { success, error } = require('../helpers/response');
const { requireAuth } = require('../middleware/auth');

// GET /v1/wishlist
router.get('/', requireAuth, (req, res) => {
  const ids = DB.wishlists[req.user.sub] || [];
  const items = ids
    .map(id => DB.products.find(p => p.id === id))
    .filter(Boolean);
  return success(res, { items, total: items.length });
});

// POST /v1/wishlist
router.post('/', requireAuth, (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return error(res, 'product_id requerido', 400);

  const product = DB.products.find(p => p.id === product_id);
  if (!product) return error(res, 'Producto no encontrado', 404);

  if (!DB.wishlists[req.user.sub]) DB.wishlists[req.user.sub] = [];
  const list = DB.wishlists[req.user.sub];

  if (list.includes(product_id)) return error(res, 'El producto ya está en tu lista de deseos', 409);

  list.push(product_id);
  return success(res, {
    product: { id: product.id, name: product.name, price_eur: product.price_eur, price_xaf: product.price_xaf },
    wishlist_count: list.length,
    message: 'Añadido a tu lista de deseos.'
  }, 201);
});

// DELETE /v1/wishlist/:product_id
router.delete('/:product_id', requireAuth, (req, res) => {
  const list = DB.wishlists[req.user.sub] || [];
  const idx = list.indexOf(req.params.product_id);
  if (idx === -1) return error(res, 'Producto no está en tu lista de deseos', 404);

  list.splice(idx, 1);
  return success(res, { product_id: req.params.product_id, wishlist_count: list.length, message: 'Eliminado de tu lista de deseos.' });
});

// DELETE /v1/wishlist — Vaciar lista
router.delete('/', requireAuth, (req, res) => {
  DB.wishlists[req.user.sub] = [];
  return success(res, { message: 'Lista de deseos vaciada.' });
});

module.exports = router;
