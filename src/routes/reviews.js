'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, paginate } = require('../helpers/response');
const { requireAuth } = require('../middleware/auth');

// ── Productos ─────────────────────────────────────────

// POST /v1/reviews/products/:id
router.post('/products/:id', requireAuth, (req, res) => {
  const { rating, comment, order_id } = req.body;
  if (!rating) return error(res, 'rating requerido (1-5)', 400);
  if (rating < 1 || rating > 5) return error(res, 'rating debe estar entre 1 y 5', 400);

  const product = DB.products.find(p => p.id === req.params.id);
  if (!product) return error(res, 'Producto no encontrado', 404);

  const alreadyReviewed = DB.reviews.some(
    r => r.type === 'product' && r.target_id === req.params.id && r.user_id === req.user.sub
  );
  if (alreadyReviewed) return error(res, 'Ya valoraste este producto', 409);

  const review = {
    id: `rev_${uuidv4().slice(0, 8)}`,
    type: 'product',
    target_id: req.params.id,
    target_name: product.name,
    user_id: req.user.sub,
    rating,
    comment: comment || null,
    order_id: order_id || null,
    created_at: new Date().toISOString()
  };
  DB.reviews.push(review);

  // Recalcular rating promedio del producto
  const productReviews = DB.reviews.filter(r => r.type === 'product' && r.target_id === req.params.id);
  product.rating_avg = Math.round((productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length) * 10) / 10;
  product.rating_count = productReviews.length;

  return success(res, {
    id: review.id, rating, comment: review.comment,
    product: { id: product.id, name: product.name, rating_avg: product.rating_avg, rating_count: product.rating_count },
    created_at: review.created_at
  }, 201);
});

// GET /v1/reviews/products/:id
router.get('/products/:id', (req, res) => {
  const { page = 1, limit = 20, min_rating } = req.query;
  const product = DB.products.find(p => p.id === req.params.id);
  if (!product) return error(res, 'Producto no encontrado', 404);

  let reviews = DB.reviews.filter(r => r.type === 'product' && r.target_id === req.params.id);
  if (min_rating) reviews = reviews.filter(r => r.rating >= parseInt(min_rating));
  reviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const avg = reviews.length
    ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
    : null;

  return success(res, {
    product_id: req.params.id,
    product_name: product.name,
    rating_avg: avg,
    rating_count: reviews.length,
    distribution: [5, 4, 3, 2, 1].reduce((acc, n) => {
      acc[n] = reviews.filter(r => r.rating === n).length; return acc;
    }, {}),
    ...paginate(reviews, page, limit)
  });
});

// ── Riders ────────────────────────────────────────────

// POST /v1/reviews/riders/:id
router.post('/riders/:id', requireAuth, (req, res) => {
  const { rating, comment, order_id } = req.body;
  if (!rating) return error(res, 'rating requerido (1-5)', 400);
  if (rating < 1 || rating > 5) return error(res, 'rating debe estar entre 1 y 5', 400);

  const rider = DB.riders.find(r => r.id === req.params.id);
  if (!rider) return error(res, 'Rider no encontrado', 404);

  const review = {
    id: `rev_${uuidv4().slice(0, 8)}`,
    type: 'rider',
    target_id: req.params.id,
    target_name: rider.name,
    user_id: req.user.sub,
    rating,
    comment: comment || null,
    order_id: order_id || null,
    created_at: new Date().toISOString()
  };
  DB.reviews.push(review);

  // Recalcular rating del rider
  const riderReviews = DB.reviews.filter(r => r.type === 'rider' && r.target_id === req.params.id);
  rider.rating = Math.round((riderReviews.reduce((s, r) => s + r.rating, 0) / riderReviews.length) * 10) / 10;

  return success(res, {
    id: review.id, rating, comment: review.comment,
    rider: { id: rider.id, name: rider.name, rating: rider.rating },
    created_at: review.created_at
  }, 201);
});

// GET /v1/reviews/riders/:id
router.get('/riders/:id', (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const rider = DB.riders.find(r => r.id === req.params.id);
  if (!rider) return error(res, 'Rider no encontrado', 404);

  const reviews = DB.reviews
    .filter(r => r.type === 'rider' && r.target_id === req.params.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return success(res, {
    rider_id: req.params.id,
    rider_name: rider.name,
    rating_avg: rider.rating,
    rating_count: reviews.length,
    ...paginate(reviews, page, limit)
  });
});

// GET /v1/reviews/my — Mis valoraciones
router.get('/my', requireAuth, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const reviews = DB.reviews
    .filter(r => r.user_id === req.user.sub)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return success(res, paginate(reviews, page, limit));
});

module.exports = router;
