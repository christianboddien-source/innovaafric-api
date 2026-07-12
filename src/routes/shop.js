'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, paginate, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireKYC } = require('../middleware/auth');
const { earnPoints } = require('../helpers/loyalty');
const { syncWalletToSupabase } = require('../helpers/supabaseSync'); // FIX v1: sincronización con Supabase

// GET /v1/shop/products
router.get('/products', async (req, res) => {
  const { category, min_price, max_price, page = 1, limit = 20, q } = req.query;
  const where = {};
  if (category) where.category = category;
  if (min_price || max_price) where.priceEur = {};
  if (min_price) where.priceEur.gte = parseFloat(min_price);
  if (max_price) where.priceEur.lte = parseFloat(max_price);
  if (q) where.name = { contains: q };

  const products = await prisma.product.findMany({ where });
  return success(res, paginate(products, page, limit));
});

// GET /v1/shop/products/:id
router.get('/products/:id', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) return error(res, 'Producto no encontrado', 404);
  return success(res, product);
});

// POST /v1/shop/cart — Añadir al carrito
router.post('/cart', requireAuth, async (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  if (!product_id) return error(res, 'product_id requerido', 400);

  const product = await prisma.product.findUnique({ where: { id: product_id } });
  if (!product) return error(res, 'Producto no encontrado', 404);
  if (product.stock < quantity) return error(res, 'Stock insuficiente', 422);

  const item = await prisma.cartItem.upsert({
    where: { userId_productId: { userId: req.user.sub, productId: product_id } },
    update: { quantity: { increment: quantity } },
    create: { userId: req.user.sub, productId: product_id, quantity, priceEur: product.priceEur, priceXaf: product.priceXaf }
  });

  const cart = await prisma.cartItem.findMany({ where: { userId: req.user.sub } });
  const total_eur = Math.round(cart.reduce((s, i) => s + i.priceEur * i.quantity, 0) * 100) / 100;
  const total_xaf = cart.reduce((s, i) => s + i.priceXaf * i.quantity, 0);
  return success(res, { items: cart, total_eur, total_xaf, item_count: cart.length });
});

// GET /v1/shop/cart
router.get('/cart', requireAuth, async (req, res) => {
  const cart = await prisma.cartItem.findMany({ where: { userId: req.user.sub } });
  const total_eur = Math.round(cart.reduce((s, i) => s + i.priceEur * i.quantity, 0) * 100) / 100;
  const total_xaf = cart.reduce((s, i) => s + i.priceXaf * i.quantity, 0);
  return success(res, { items: cart, total_eur, total_xaf, item_count: cart.length });
});

// POST /v1/shop/orders — Crear pedido
router.post('/orders', requireAuth, requireKYC, async (req, res) => {
  const { payment_currency = 'EUR', delivery_address, notes } = req.body;
  const cart = await prisma.cartItem.findMany({ where: { userId: req.user.sub } });
  if (!cart.length) return error(res, 'El carrito está vacío', 400);
  if (!delivery_address) return error(res, 'delivery_address requerido', 400);

  const total_eur = Math.round(cart.reduce((s, i) => s + i.priceEur * i.quantity, 0) * 100) / 100;
  const total_xaf = cart.reduce((s, i) => s + i.priceXaf * i.quantity, 0);
  const payAmount = payment_currency === 'EUR' ? total_eur : total_xaf;
  const CURRENCY_FIELD = { EUR: 'balanceEur', USD: 'balanceUsd', XAF: 'balanceXaf', XOF: 'balanceXof' };
  const payField = CURRENCY_FIELD[payment_currency] || 'balanceEur';

  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  if (!wallet || wallet[payField] < payAmount) return error(res, 'Saldo insuficiente para el pago', 422);

  const orderId = `ord_${uuidv4().slice(0, 8)}`;
  const [order, walletAfter] = await prisma.$transaction([
    prisma.order.create({
      data: {
        id: orderId,
        userId: req.user.sub,
        totalEur: total_eur, totalXaf: total_xaf,
        paymentCurrency: payment_currency, paymentAmount: payAmount,
        deliveryAddress: delivery_address,
        notes: notes || null,
        status: 'confirmed',
        estimatedDelivery: '4-5 días hábiles',
        trackingId: `TRK_${uuidv4().slice(0, 10).toUpperCase()}`,
        items: { create: cart.map(i => ({ productId: i.productId, quantity: i.quantity, priceEur: i.priceEur, priceXaf: i.priceXaf })) }
      },
      include: { items: true }
    }),
    prisma.wallet.update({ where: { userId: req.user.sub }, data: { [payField]: { decrement: payAmount } } }),
    prisma.cartItem.deleteMany({ where: { userId: req.user.sub } })
  ]);

  // FIX v1: sin esto, el pago del pedido no se veía reflejado en XenderMoney
  syncWalletToSupabase(req.user.sub, walletAfter).catch(function(){});

  await triggerWebhook('order.created', { id: order.id, total_eur, items_count: order.items.length });
  const points_earned = await earnPoints(req.user.sub, total_eur, 0, 'shop_order', order.id);

  return success(res, { ...order, loyalty_points_earned: points_earned }, 201);
});

// GET /v1/shop/orders
router.get('/orders', requireAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user.sub },
    include: { items: true },
    orderBy: { createdAt: 'desc' }
  });
  return success(res, paginate(orders, req.query.page, req.query.limit));
});

// GET /v1/shop/orders/:id
router.get('/orders/:id', requireAuth, async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.user.sub },
    include: { items: true }
  });
  if (!order) return error(res, 'Pedido no encontrado', 404);
  return success(res, order);
});

module.exports = router;
