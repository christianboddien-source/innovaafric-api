'use strict';

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ok, error } = require('../helpers/response');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const prisma  = new PrismaClient();
const requireAdmin = requireRole('admin');

/* GET /campaigns */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, type } = req.query;
    const where = {};
    if (status) where.status = status;
    if (type)   where.type   = type;
    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' } }),
      prisma.campaign.count({ where })
    ]);
    const stats = {
      total:  await prisma.campaign.count(),
      active: await prisma.campaign.count({ where: { status: 'active' } }),
      draft:  await prisma.campaign.count({ where: { status: 'draft' } }),
      ended:  await prisma.campaign.count({ where: { status: 'ended' } })
    };
    ok(res, { campaigns, total, stats });
  } catch (e) { error(res, e.message); }
});

/* POST /campaigns */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, description, type, target, discount, code, startDate, endDate } = req.body;
    if (!title) return error(res, 'title es requerido', 400);
    const c = await prisma.campaign.create({
      data: {
        id: uuidv4(), title,
        description: description || null,
        type:    type    || 'promo',
        status:  'draft',
        target:  target  || 'all',
        discount: discount ? parseFloat(discount) : null,
        code:     code     || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate:   endDate   ? new Date(endDate)   : null,
        createdBy: req.user.sub
      }
    });
    ok(res, c, 201);
  } catch (e) { error(res, e.message); }
});

/* PUT /campaigns/:id */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, description, type, target, discount, code, startDate, endDate } = req.body;
    const c = await prisma.campaign.update({
      where: { id: req.params.id },
      data: {
        ...(title       !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(type        !== undefined && { type }),
        ...(target      !== undefined && { target }),
        ...(discount    !== undefined && { discount: discount ? parseFloat(discount) : null }),
        ...(code        !== undefined && { code: code || null }),
        ...(startDate   !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate     !== undefined && { endDate:   endDate   ? new Date(endDate)   : null }),
        updatedAt: new Date()
      }
    });
    ok(res, c);
  } catch (e) { error(res, e.message); }
});

/* PATCH /campaigns/:id/status */
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['draft','active','paused','ended'].includes(status)) return error(res, 'Estado inválido', 400);
    const c = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status, updatedAt: new Date() }
    });
    ok(res, c);
  } catch (e) { error(res, e.message); }
});

/* DELETE /campaigns/:id */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.campaign.delete({ where: { id: req.params.id } });
    ok(res, { message: 'Campaña eliminada' });
  } catch (e) { error(res, e.message); }
});

module.exports = router;
