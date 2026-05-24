'use strict';

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ok, error } = require('../helpers/response');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const prisma  = new PrismaClient();
const requireAdmin = requireRole('admin');

/* GET /tickets — lista admin */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, priority, category, limit = 100, offset = 0 } = req.query;
    const where = {};
    if (status)   where.status   = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, take: parseInt(limit), skip: parseInt(offset) }),
      prisma.supportTicket.count({ where })
    ]);
    const stats = {
      open:        await prisma.supportTicket.count({ where: { status: 'open' } }),
      in_progress: await prisma.supportTicket.count({ where: { status: 'in_progress' } }),
      resolved:    await prisma.supportTicket.count({ where: { status: 'resolved' } }),
      urgent:      await prisma.supportTicket.count({ where: { priority: 'urgent' } }),
      total:       await prisma.supportTicket.count()
    };
    ok(res, { tickets, total, stats });
  } catch (e) { error(res, e.message); }
});

/* POST /tickets — crear ticket (usuarios o admins) */
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message, priority, category } = req.body;
    if (!name || !email || !subject || !message) return error(res, 'name, email, subject y message son requeridos', 400);
    const t = await prisma.supportTicket.create({
      data: {
        id: uuidv4(), name, email, subject, message,
        priority: priority || 'medium',
        category: category || 'general',
        status: 'open'
      }
    });
    ok(res, t, 201);
  } catch (e) { error(res, e.message); }
});

/* PATCH /tickets/:id/respond — responder ticket */
router.patch('/:id/respond', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { response, status } = req.body;
    if (!response) return error(res, 'response es requerido', 400);
    const t = await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: {
        response,
        status:      status || 'resolved',
        respondedAt: new Date(),
        respondedBy: req.user.sub,
        updatedAt:   new Date()
      }
    });
    ok(res, t);
  } catch (e) { error(res, e.message); }
});

/* PATCH /tickets/:id/status — cambiar estado */
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, priority } = req.body;
    const t = await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: {
        ...(status   && { status }),
        ...(priority && { priority }),
        updatedAt: new Date()
      }
    });
    ok(res, t);
  } catch (e) { error(res, e.message); }
});

/* DELETE /tickets/:id */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.supportTicket.delete({ where: { id: req.params.id } });
    ok(res, { message: 'Ticket eliminado' });
  } catch (e) { error(res, e.message); }
});

module.exports = router;
