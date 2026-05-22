'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, triggerWebhook } = require('../helpers/response');
const { requireAuth } = require('../middleware/auth');

// GET /v1/bigshop/products
router.get('/products', (req, res) => {
  const { category, store, q } = req.query;
  let products = DB.grocery_products.filter(p => p.available);
  if (category) products = products.filter(p => p.category === category);
  if (store)    products = products.filter(p => p.store.includes(store));
  if (q)        products = products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  return success(res, { items: products, total: products.length, delivery_time: 'Menos de 30 minutos' });
});

// POST /v1/bigshop/orders — Pedido grocery express
router.post('/orders', requireAuth, (req, res) => {
  const { items, delivery_address, notes } = req.body;
  if (!items || items.length === 0) return error(res, 'items requerido (array de {product_id, quantity})', 400);
  if (!delivery_address) return error(res, 'delivery_address requerido', 400);

  const orderItems = [];
  let total_xaf = 0;

  for (const item of items) {
    const product = DB.grocery_products.find(p => p.id === item.product_id && p.available);
    if (!product) return error(res, `Producto ${item.product_id} no disponible`, 404);
    const qty = item.quantity || 1;
    orderItems.push({ ...product, quantity: qty, subtotal: product.price_xaf * qty });
    total_xaf += product.price_xaf * qty;
  }

  const wallet = DB.wallets[req.user.sub];
  if (!wallet || wallet.balance_xaf < total_xaf) return error(res, 'Saldo XAF insuficiente', 422);
  wallet.balance_xaf -= total_xaf;

  const assigned_rider = DB.riders.find(r => r.status === 'available');
  if (assigned_rider) assigned_rider.status = 'busy';

  const gorder = {
    id: `groc_${uuidv4().slice(0, 8)}`,
    user_id: req.user.sub,
    items: orderItems, total_xaf, notes,
    delivery_address,
    rider: assigned_rider
      ? { id: assigned_rider.id, name: assigned_rider.name, phone: assigned_rider.phone }
      : null,
    status: 'preparing',
    estimated_delivery: '25-30 minutos',
    created_at: new Date().toISOString()
  };
  DB.grocery_orders.push(gorder);
  triggerWebhook('order.created', { id: gorder.id, type: 'grocery', total_xaf });

  return success(res, gorder, 201);
});

module.exports = router;
