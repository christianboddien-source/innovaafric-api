'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, triggerWebhook } = require('../helpers/response');
const { requireAuth } = require('../middleware/auth');
const push = require('../services/push');
const { syncWalletToSupabase } = require('../helpers/supabaseSync'); // FIX v1: sincronización con Supabase

// GET /v1/bigshop/products
router.get('/products', async (req, res) => {
  const { category, store, q } = req.query;
  const where = { available: true };
  if (category) where.category = category;
  if (q) where.name = { contains: q };

  let products = await prisma.groceryProduct.findMany({ where });
  if (store) products = products.filter(p => p.store && p.store.includes(store));
  return success(res, { items: products, total: products.length, delivery_time: 'Menos de 30 minutos' });
});

// GET /v1/bigshop/my-orders — pedidos del cliente (para el tracking)
router.get('/my-orders', requireAuth, async (req, res) => {
  const orders = await prisma.groceryOrder.findMany({
    where: { userId: req.user.sub },
    include: {
      items: true,
      rider: { select: { name: true, vehicle: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  // Nombre del comercio de cada pedido
  const merchantIds = [...new Set(orders.map(o => o.merchantId).filter(Boolean))];
  const merchants = merchantIds.length ? await prisma.merchant.findMany({
    where: { id: { in: merchantIds } },
    select: { id: true, name: true }
  }) : [];
  const mMap = Object.fromEntries(merchants.map(m => [m.id, m.name]));
  return success(res, {
    count: orders.length,
    orders: orders.map(o => ({ ...o, merchantName: o.merchantId ? mMap[o.merchantId] || null : null }))
  });
});

// POST /v1/bigshop/orders — Pedido grocery express
router.post('/orders', requireAuth, async (req, res) => {
  const { items, delivery_address, notes } = req.body;
  if (!items || items.length === 0) return error(res, 'items requerido (array de {product_id, quantity})', 400);
  if (!delivery_address) return error(res, 'delivery_address requerido', 400);

  const orderItems = [];
  let total_xaf = 0;

  for (const item of items) {
    const product = await prisma.groceryProduct.findFirst({ where: { id: item.product_id, available: true } });
    if (!product) return error(res, `Producto ${item.product_id} no disponible`, 404);
    const qty = item.quantity || 1;
    orderItems.push({ productId: product.id, quantity: qty, priceXaf: product.priceXaf });
    total_xaf += product.priceXaf * qty;
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  if (!wallet || wallet.balanceXaf < total_xaf) return error(res, 'Saldo XAF insuficiente', 422);

  // Comercio del pedido: el de la tienda del primer producto.
  // El rider ya NO se asigna automáticamente — el comercio prepara la comanda,
  // la marca "lista" en su app y un rider disponible la acepta.
  let merchantId = null, merchantUserId = null;
  const firstProduct = await prisma.groceryProduct.findFirst({ where: { id: items[0].product_id } });
  if (firstProduct?.store) {
    const merchant = await prisma.merchant.findFirst({
      where: { name: { equals: firstProduct.store, mode: 'insensitive' }, active: true }
    });
    if (merchant && merchant.isOpen === false) {
      return error(res, `"${merchant.name}" está cerrado ahora mismo. Inténtalo más tarde.`, 409);
    }
    merchantId = merchant?.id || null;
    merchantUserId = merchant?.userId || null;
  }

  const [gorder, walletAfter] = await prisma.$transaction([
    prisma.groceryOrder.create({
      data: {
        id: `groc_${uuidv4().slice(0, 8)}`,
        userId: req.user.sub,
        totalXaf: total_xaf,
        notes: notes || null,
        deliveryAddress: delivery_address,
        merchantId,
        status: 'preparing',
        estimatedDelivery: '25-30 minutos',
        riderFeeXaf: Math.max(500, Math.round(total_xaf * 0.10)), // pago del rider: 10% (mín. 500 XAF)
        items: { create: orderItems }
      },
      include: { items: true }
    }),
    prisma.wallet.update({ where: { userId: req.user.sub }, data: { balanceXaf: { decrement: total_xaf } } })
  ]);

  // FIX v1: sin esto, el pago del pedido no se veía reflejado en XenderMoney
  syncWalletToSupabase(req.user.sub, walletAfter).catch(function(){});

  await triggerWebhook('order.created', { id: gorder.id, type: 'grocery', total_xaf });

  // Aviso push al comercio: nueva comanda entrante
  if (merchantUserId) {
    push.sendToUser(merchantUserId, {
      title: '🛒 Nueva comanda',
      body: `Pedido de ${total_xaf.toLocaleString()} XAF — prepáralo y márcalo "listo".`,
      url: '/comercio',
      tag: 'comanda-' + gorder.id
    }).catch(() => {});
  }

  return success(res, gorder, 201);
});

module.exports = router;
