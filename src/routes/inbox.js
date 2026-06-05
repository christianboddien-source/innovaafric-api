'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','marketing_manager','support_agent','support_supervisor','country_manager','regional_director'];

// GET /v1/messages/inbox — admin ve todas las notificaciones
router.get('/inbox', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { read, type, channel, limit = 100 } = req.query;
    const where = {};
    if (read !== undefined) where.read = read === 'true';
    if (type)    where.type    = type;
    if (channel) where.channel = channel;
    const messages = await prisma.notification.findMany({
      where, orderBy: { createdAt: 'desc' }, take: parseInt(limit),
      include: { user: { select: { id: true, name: true, email: true } } }
    });
    return success(res, messages.map(m => ({
      id: m.id, from: 'sistema', to: m.userId, subject: m.title,
      body: m.body, type: m.type, channel: m.channel,
      read: m.read, date: m.createdAt, user: m.user
    })));
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/messages/inbox — envío masivo de mensajes in-app
router.post('/inbox', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { subject, body, type = 'info', channel = 'in_app', target } = req.body;
    if (!subject || !body) return error(res, 'subject y body son obligatorios', 400);

    let where = {};
    if (target && target.startsWith('role:'))    where.role    = target.split(':')[1];
    if (target && target.startsWith('country:')) where.country = target.split(':')[1];

    const users = await prisma.user.findMany({ where, select: { id: true } });
    if (!users.length) return error(res, 'Sin destinatarios', 400);

    await prisma.notification.createMany({
      data: users.map(u => ({
        id: uuidv4(), userId: u.id,
        title: subject, body, type, channel, read: false
      }))
    });
    return success(res, { sent: users.length, target: target || 'all', subject }, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// GET /v1/messages/inbox/stats
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [total, unread, byType] = await Promise.all([
      prisma.notification.count(),
      prisma.notification.count({ where: { read: false } }),
      prisma.notification.groupBy({ by: ['type'], _count: { id: true } })
    ]);
    return success(res, { total, unread, read: total - unread, byType });
  } catch (e) { return error(res, e.message, 500); }
});

module.exports = router;
