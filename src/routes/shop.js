'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, paginate, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireKYC } = require('../middleware/auth');

// GET /v1/shop/products
router.get('/products', (req, res) => {
  const { category, min_price, max_price, page = 1, limit = 20, q } = req.query;
  let products = [...DB.products];

  if (category)   products = products.filter(p => p.category === category);
  if (min_price)  products = products.filter(p => p.price_eur >= parseFloat(min_price));
  if (max_price)  products = products.filter(p => p.price_eur <= parseFloat(max_price));
  if (q)          products = products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));

  return success(res, paginate(products, page, limit));
});

// GET /v1/shop/products/:id
router.get('/products/:id', (req, res) => {
  const product = DB.products.find(p => p.id === req.params.id);
  if (!product) return error(res, 'Producto no encontrado', 404);
  return success(res, product);
});

// POST /v1/shop/cart — Añadir al carrito
router.post('/cart', requireAuth, (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  if (!product_id) return error(res, 'product_id requerido', 400);

  const product = DB.products.find(p => p.id === product_id);
  if (!product) return error(res, 'Producto no encontrado', 404);
  if (product.stock < quantity) return error(res, 'Stock insuficiente', 422);

  if (!DB.carts[req.user.sub]) DB.carts[req.user.sub] = [];
  const cart = DB.carts[req.user.sub];
  const existing = cart.find(i => i.product_id === product_id);

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ product_id, quantity, price_eur: product.price_eur, price_xaf: product.price_xaf, name: product.name });
  }

  const total_eur = cart.reduce((s, i) => s + i.price_eur * i.quantity, 0);
  const total_xaf = cart.reduce((s, i) => s + i.price_xaf * i.quantity, 0);
  return success(res, { items: cart, total_eur: Math.round(total_eur * 100) / 100, total_xaf, item_count: cart.length });
});

// GET /v1/shop/cart
router.get('/cart', requireAuth, (req, res) => {
  const cart = DB.carts[req.user.sub] || [];
  const total_eur = cart.reduce((s, i) => s + i.price_eur * i.quantity, 0);
  const total_xaf = cart.reduce((s, i) => s + i.price_xaf * i.quantity, 0);
  return success(res, { items: cart, total_eur: Math.round(total_eur * 100) / 100, total_xaf, item_count: cart.length });
});

// POST /v1/shop/orders — Crear pedido
router.post('/orders', requireAuth, requireKYC, (req, res) => {
  const { payment_currency = 'EUR', delivery_address, notes } = req.body;
  const cart = DB.carts[req.user.sub];
  if (!cart || cart.length === 0) return error(res, 'El carrito está vacío', 400);
  if (!delivery_address) return error(res, 'delivery_address requerido', 400);

  const total_eur = Math.round(cart.reduce((s, i) => s + i.price_eur * i.quantity, 0) * 100) / 100;
  const total_xaf = cart.reduce((s, i) => s + i.price_xaf * i.quantity, 0);
  const wallet    = DB.wallets[req.user.sub];
  const payKey    = `balance_${payment_currency.toLowerCase()}`;
  const payAmount = payment_currency === 'EUR' ? total_eur : total_xaf;

  if (!wallet || wallet[payKey] < payAmount) return error(res, 'Saldo insuficiente para el pago', 422);

  wallet[payKey] -= payAmount;

  const order = {
    id: `ord_${uuidv4().slice(0, 8)}`,
    user_id: req.user.sub,
    items: [...cart],
    total_eur, total_xaf,
    payment_currency, payment_amount: payAmount,
    delivery_address,
    notes: notes || null,
    status: 'confirmed',
    estimated_delivery: '4-5 días hábiles',
    tracking_id: `TRK_${uuidv4().slice(0, 10).toUpperCase()}`,
    hub_location: 'Valencia, España',
    ce_certified: true,
    created_at: new Date().toISOString()
  };
  DB.orders.push(order);
  DB.carts[req.user.sub] = [];
  triggerWebhook('order.created', { id: order.id, total_eur, items_count: order.items.length });

  return success(res, order, 201);
});

// GET /v1/shop/orders
router.get('/orders', requireAuth, (req, res) => {
  const orders = DB.orders
    .filter(o => o.user_id === req.user.sub)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return success(res, paginate(orders, req.query.page, req.query.limit));
});

// GET /v1/shop/orders/:id
router.get('/orders/:id', requireAuth, (req, res) => {
  const order = DB.orders.find(o => o.id === req.params.id && o.user_id === req.user.sub);
  if (!order) return error(res, 'Pedido no encontrado', 404);
  return success(res, order);
});

module.exports = router;
