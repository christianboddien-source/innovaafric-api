'use strict';

const express = require('express');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth } = require('../middleware/auth');

// GET /v1/wishlist
router.get('/', requireAuth, async (req, res) => {
  const items = await prisma.wishlistItem.findMany({
    where: { userId: req.user.sub },
    include: { product: true }
  });
  return success(res, { items: items.map(i => i.product), total: items.length });
});

// POST /v1/wishlist
router.post('/', requireAuth, async (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return error(res, 'product_id requerido', 400);

  const product = await prisma.product.findUnique({ where: { id: product_id } });
  if (!product) return error(res, 'Producto no encontrado', 404);

  const existing = await prisma.wishlistItem.findUnique({
    where: { userId_productId: { userId: req.user.sub, productId: product_id } }
  });
  if (existing) return error(res, 'El producto ya está en tu lista de deseos', 409);

  await prisma.wishlistItem.create({ data: { userId: req.user.sub, productId: product_id } });
  const count = await prisma.wishlistItem.count({ where: { userId: req.user.sub } });

  return success(res, {
    product: { id: product.id, name: product.name, price_eur: product.priceEur, price_xaf: product.priceXaf },
    wishlist_count: count,
    message: 'Añadido a tu lista de deseos.'
  }, 201);
});

// DELETE /v1/wishlist/:product_id
router.delete('/:product_id', requireAuth, async (req, res) => {
  const item = await prisma.wishlistItem.findUnique({
    where: { userId_productId: { userId: req.user.sub, productId: req.params.product_id } }
  });
  if (!item) return error(res, 'Producto no está en tu lista de deseos', 404);

  await prisma.wishlistItem.delete({ where: { userId_productId: { userId: req.user.sub, productId: req.params.product_id } } });
  const count = await prisma.wishlistItem.count({ where: { userId: req.user.sub } });

  return success(res, { product_id: req.params.product_id, wishlist_count: count, message: 'Eliminado de tu lista de deseos.' });
});

// DELETE /v1/wishlist — Vaciar lista
router.delete('/', requireAuth, async (req, res) => {
  await prisma.wishlistItem.deleteMany({ where: { userId: req.user.sub } });
  return success(res, { message: 'Lista de deseos vaciada.' });
});

module.exports = router;
