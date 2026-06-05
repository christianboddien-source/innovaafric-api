'use strict';
const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','business_developer','country_manager','regional_director'];

// GET /v1/merchants
router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { status, country } = req.query;
    const where = {};
    if (status)  where.status  = status;
    if (country) where.country = country;
    const merchants = await prisma.merchantProfile.findMany({ where, orderBy: { joinedAt: 'desc' } });
    return success(res, merchants);
  } catch (e) { return error(res, e.message, 500); }
});

// GET /v1/merchants/:id
router.get('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const m = await prisma.merchantProfile.findUnique({ where: { id: req.params.id } });
    if (!m) return error(res, 'Merchant no encontrado', 404);
    return success(res, m);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/merchants
router.post('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, category, country, city, contact, phone, currency } = req.body;
    if (!name || !category || !country) return error(res, 'name, category y country son obligatorios', 400);
    const m = await prisma.merchantProfile.create({ data: {
      name, category, country,
      city: city || null, contact: contact || null, phone: phone || null,
      currency: currency || 'XAF', status: 'activo'
    }});
    return success(res, m, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// PATCH /v1/merchants/:id
router.patch('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, category, status, city, contact, phone, currency } = req.body;
    const m = await prisma.merchantProfile.update({
      where: { id: req.params.id },
      data:  { name, category, status, city, contact, phone, currency }
    });
    return success(res, m);
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// PUT /v1/merchants/:id/suspend
router.put('/:id/suspend', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const m = await prisma.merchantProfile.update({ where: { id: req.params.id }, data: { status: 'suspendido' } });
    return success(res, { id: m.id, status: m.status });
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// GET /v1/merchants/stats
router.get('/stats/summary', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [total, activo, suspendido, byCountry] = await Promise.all([
      prisma.merchantProfile.count(),
      prisma.merchantProfile.count({ where: { status: 'activo' } }),
      prisma.merchantProfile.count({ where: { status: 'suspendido' } }),
      prisma.merchantProfile.groupBy({ by: ['country'], _count: { id: true } })
    ]);
    return success(res, { total, activo, suspendido, byCountry });
  } catch (e) { return error(res, e.message, 500); }
});

module.exports = router;
