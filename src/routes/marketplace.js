'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','business_developer','country_manager','regional_director'];

// GET /v1/marketplace/products
router.get('/products', requireAuth, async (req, res) => {
  try {
    const { category, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (category) where.category = category;
    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy: { ratingAvg: 'desc' }, take: parseInt(limit), skip: parseInt(offset) }),
      prisma.product.count({ where })
    ]);
    return success(res, { products: products.map(p => ({
      id: p.id, name: p.name, description: p.description,
      priceEur: p.priceEur, priceXaf: p.priceXaf,
      category: p.category, stock: p.stock,
      status: p.stock > 0 ? 'activo' : 'agotado',
      rating: p.ratingAvg, sales: p.ratingCount,
      imageUrl: p.imageUrl, origin: p.origin
    })), total });
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/marketplace/products — admin crea producto
router.post('/products', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, description, priceEur, priceXaf, category, stock, origin, imageUrl } = req.body;
    if (!name || !priceEur || !priceXaf || !category) return error(res, 'name, priceEur, priceXaf, category son obligatorios', 400);
    const product = await prisma.product.create({ data: {
      id: 'prod_' + uuidv4().slice(0, 8),
      name, description: description || null,
      priceEur: parseFloat(priceEur), priceXaf: parseFloat(priceXaf),
      category, stock: stock ? parseInt(stock) : 0,
      origin: origin || null, imageUrl: imageUrl || null
    }});
    return success(res, product, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// PATCH /v1/marketplace/products/:id
router.patch('/products/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, priceEur, priceXaf, stock, description, imageUrl } = req.body;
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { name, priceEur: priceEur ? parseFloat(priceEur) : undefined,
              priceXaf: priceXaf ? parseFloat(priceXaf) : undefined,
              stock: stock !== undefined ? parseInt(stock) : undefined,
              description, imageUrl }
    });
    return success(res, product);
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// DELETE /v1/marketplace/products/:id
router.delete('/products/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    return success(res, { message: 'Producto eliminado.' });
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// GET /v1/marketplace/stats
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [total, outOfStock, byCategory] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { stock: 0 } }),
      prisma.product.groupBy({ by: ['category'], _count: { id: true } })
    ]);
    return success(res, { total, outOfStock, inStock: total - outOfStock, byCategory });
  } catch (e) { return error(res, e.message, 500); }
});

module.exports = router;
