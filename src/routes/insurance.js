'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','finance_officer','risk_officer','country_manager','regional_director'];

// GET /v1/insurance/plans
router.get('/plans', requireAuth, async (req, res) => {
  try {
    const { type, status } = req.query;
    const where = {};
    if (type)   where.type   = type;
    if (status) where.status = status;
    const plans = await prisma.insurancePlan.findMany({ where, orderBy: { createdAt: 'desc' } });
    return success(res, plans);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/insurance/plans
router.post('/plans', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, type, coverage, premium, currency, duration, provider } = req.body;
    if (!name || !type || !coverage || !premium || !provider) return error(res, 'Faltan campos obligatorios', 400);
    const plan = await prisma.insurancePlan.create({ data: {
      name, type, coverage: parseFloat(coverage), premium: parseFloat(premium),
      currency: currency || 'XAF', duration: parseInt(duration || 12), provider
    }});
    return success(res, plan, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// PATCH /v1/insurance/plans/:id
router.patch('/plans/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, status, premium, coverage, subscribers } = req.body;
    const plan = await prisma.insurancePlan.update({
      where: { id: req.params.id },
      data:  { name, status, premium: premium ? parseFloat(premium) : undefined, coverage: coverage ? parseFloat(coverage) : undefined, subscribers: subscribers ? parseInt(subscribers) : undefined }
    });
    return success(res, plan);
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// GET /v1/insurance/claims
router.get('/claims', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const claims = await prisma.insuranceClaim.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { plan: { select: { id: true, name: true, type: true } } }
    });
    return success(res, claims);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/insurance/claims
router.post('/claims', requireAuth, async (req, res) => {
  try {
    const { planId, userEmail, amount, currency, description, userId } = req.body;
    if (!planId || !userEmail || !amount || !description) return error(res, 'Faltan campos obligatorios', 400);
    const plan = await prisma.insurancePlan.findUnique({ where: { id: planId } });
    if (!plan) return error(res, 'Plan no encontrado', 404);
    const claim = await prisma.insuranceClaim.create({ data: {
      planId, userId: userId || null, userEmail,
      amount: parseFloat(amount), currency: currency || plan.currency, description
    }});
    return success(res, claim, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// PATCH /v1/insurance/claims/:id — aprobar/rechazar
router.patch('/claims/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const claim = await prisma.insuranceClaim.update({
      where: { id: req.params.id },
      data:  { status, notes }
    });
    return success(res, claim);
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

module.exports = router;
