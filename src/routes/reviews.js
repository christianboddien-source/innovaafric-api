'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, paginate } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');
const ADMIN_REVIEW = ['admin','super_admin','country_manager','regional_director'];

// GET /v1/reviews — todas las reseñas para moderación (admin)
router.get('/', requireAuth, requireRole(...ADMIN_REVIEW), async (req, res) => {
  try {
    const { type, limit = 200 } = req.query;
    const where = type ? { type } : {};
    const reviews = await prisma.review.findMany({
      where, orderBy: { createdAt: 'desc' }, take: Math.min(Number(limit) || 200, 500),
      include: { user: { select: { name: true, email: true } } }
    });
    return success(res, reviews.map(r => ({
      id: r.id, type: r.type, target: r.targetName, targetId: r.targetId,
      user: (r.user && r.user.name) || r.userId, userEmail: (r.user && r.user.email) || '',
      rating: r.rating, comment: r.comment || '', createdAt: r.createdAt
    })));
  } catch (e) { return error(res, e.message, 500); }
});

// DELETE /v1/reviews/:id — moderar (eliminar) una reseña (admin)
router.delete('/:id', requireAuth, requireRole(...ADMIN_REVIEW), async (req, res) => {
  try {
    await prisma.review.delete({ where: { id: req.params.id } });
    return success(res, { message: 'Reseña eliminada' });
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// POST /v1/reviews/products/:id
router.post('/products/:id', requireAuth, async (req, res) => {
  const { rating, comment, order_id } = req.body;
  if (!rating) return error(res, 'rating requerido (1-5)', 400);
  if (rating < 1 || rating > 5) return error(res, 'rating debe estar entre 1 y 5', 400);

  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) return error(res, 'Producto no encontrado', 404);

  const alreadyReviewed = await prisma.review.findFirst({
    where: { type: 'product', targetId: req.params.id, userId: req.user.sub }
  });
  if (alreadyReviewed) return error(res, 'Ya valoraste este producto', 409);

  const review = await prisma.review.create({
    data: {
      id: `rev_${uuidv4().slice(0, 8)}`,
      type: 'product', targetId: req.params.id, targetName: product.name,
      userId: req.user.sub, rating,
      comment: comment || null, orderId: order_id || null
    }
  });

  const allReviews = await prisma.review.findMany({ where: { type: 'product', targetId: req.params.id } });
  const ratingAvg = Math.round((allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length) * 10) / 10;
  await prisma.product.update({ where: { id: req.params.id }, data: { ratingAvg, ratingCount: allReviews.length } });

  return success(res, {
    id: review.id, rating, comment: review.comment,
    product: { id: product.id, name: product.name, rating_avg: ratingAvg, rating_count: allReviews.length },
    created_at: review.createdAt
  }, 201);
});

// GET /v1/reviews/products/:id
router.get('/products/:id', async (req, res) => {
  const { page = 1, limit = 20, min_rating } = req.query;
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) return error(res, 'Producto no encontrado', 404);

  const where = { type: 'product', targetId: req.params.id };
  if (min_rating) where.rating = { gte: parseInt(min_rating) };

  const reviews = await prisma.review.findMany({ where, orderBy: { createdAt: 'desc' } });
  const avg = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : null;

  return success(res, {
    product_id: req.params.id, product_name: product.name,
    rating_avg: avg, rating_count: reviews.length,
    distribution: [5, 4, 3, 2, 1].reduce((acc, n) => { acc[n] = reviews.filter(r => r.rating === n).length; return acc; }, {}),
    ...paginate(reviews, page, limit)
  });
});

// POST /v1/reviews/riders/:id
router.post('/riders/:id', requireAuth, async (req, res) => {
  const { rating, comment, order_id } = req.body;
  if (!rating) return error(res, 'rating requerido (1-5)', 400);
  if (rating < 1 || rating > 5) return error(res, 'rating debe estar entre 1 y 5', 400);

  const rider = await prisma.rider.findUnique({ where: { id: req.params.id } });
  if (!rider) return error(res, 'Rider no encontrado', 404);

  const review = await prisma.review.create({
    data: {
      id: `rev_${uuidv4().slice(0, 8)}`,
      type: 'rider', targetId: req.params.id, targetName: rider.name,
      userId: req.user.sub, rating,
      comment: comment || null, orderId: order_id || null
    }
  });

  const allReviews = await prisma.review.findMany({ where: { type: 'rider', targetId: req.params.id } });
  const ratingAvg = Math.round((allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length) * 10) / 10;
  await prisma.rider.update({ where: { id: req.params.id }, data: { rating: ratingAvg } });

  return success(res, {
    id: review.id, rating, comment: review.comment,
    rider: { id: rider.id, name: rider.name, rating: ratingAvg },
    created_at: review.createdAt
  }, 201);
});

// GET /v1/reviews/riders/:id
router.get('/riders/:id', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const rider = await prisma.rider.findUnique({ where: { id: req.params.id } });
  if (!rider) return error(res, 'Rider no encontrado', 404);

  const reviews = await prisma.review.findMany({
    where: { type: 'rider', targetId: req.params.id }, orderBy: { createdAt: 'desc' }
  });

  return success(res, {
    rider_id: req.params.id, rider_name: rider.name,
    rating_avg: rider.rating, rating_count: reviews.length,
    ...paginate(reviews, page, limit)
  });
});

// GET /v1/reviews/my — Mis valoraciones
router.get('/my', requireAuth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const reviews = await prisma.review.findMany({
    where: { userId: req.user.sub }, orderBy: { createdAt: 'desc' }
  });
  return success(res, paginate(reviews, page, limit));
});

module.exports = router;
