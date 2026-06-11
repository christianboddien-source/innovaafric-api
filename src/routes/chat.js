'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

// Roles de staff que gestionan el chat desde el dashboard
const CHAT_STAFF = ['admin', 'super_admin', 'support_agent', 'support_supervisor'];

// ¿Puede este usuario ver la sala completa? Staff: todas. Usuario: su sala personal.
// Representante: también las salas de las circulares de su red.
async function canSeeFullRoom(user, room) {
  if (CHAT_STAFF.includes(user.role)) return true;
  if (room === `user_${user.sub}`) return true;
  if (room.startsWith('user_')) {
    const rep = await prisma.representative.findUnique({ where: { userId: user.sub } });
    if (!rep) return false;
    const circ = await prisma.circular.findUnique({ where: { userId: room.slice(5) } });
    return !!(circ && circ.repId === rep.id);
  }
  return false;
}

// GET /v1/chat/rooms — salas activas (staff)
router.get('/rooms', requireAuth, requireRole(...CHAT_STAFF), async (_req, res) => {
  const messages = await prisma.chatMessage.findMany({
    orderBy: { createdAt: 'desc' },
    include: { from: { select: { name: true, role: true } } }
  });
  const rooms = {};
  messages.forEach(m => {
    if (!rooms[m.room]) rooms[m.room] = { room: m.room, lastMessage: '', lastAt: m.createdAt, unread: 0, count: 0, lastUser: '' };
    rooms[m.room].count++;
    if (!m.read) rooms[m.room].unread++;
    if (new Date(m.createdAt) >= new Date(rooms[m.room].lastAt)) {
      rooms[m.room].lastMessage = m.message;
      rooms[m.room].lastAt = m.createdAt;
      rooms[m.room].lastUser = m.from?.name || 'Usuario';
    }
  });
  const list = Object.values(rooms).sort((a,b) => new Date(b.lastAt) - new Date(a.lastAt));
  return success(res, { rooms: list, total: list.length });
});

// GET /v1/chat/messages?room=support
router.get('/messages', requireAuth, async (req, res) => {
  const { room = 'support', limit = 100 } = req.query;
  const where = { room };
  // Staff ve cualquier sala; el dueño ve su sala personal; el rep las de su red.
  // En salas compartidas, solo los mensajes que envió o recibió.
  if (!await canSeeFullRoom(req.user, room)) {
    where.OR = [{ fromId: req.user.sub }, { toId: req.user.sub }];
  }
  const messages = await prisma.chatMessage.findMany({
    where, orderBy: { createdAt: 'asc' }, take: parseInt(limit),
    include: { from: { select: { name: true, role: true } } }
  });
  return success(res, { messages, total: messages.length });
});

// POST /v1/chat/messages — enviar mensaje
router.post('/messages', requireAuth, async (req, res) => {
  const { message, room = 'support', to_id } = req.body;
  if (!message?.trim()) return error(res, 'Mensaje vacío', 400);
  const msg = await prisma.chatMessage.create({
    data: {
      id: `msg_${uuidv4().slice(0,8)}`,
      fromId: req.user.sub, toId: to_id || null,
      room, message: message.trim()
    }
  });
  return success(res, msg, 201);
});

// PATCH /v1/chat/read — marcar como leídos
router.patch('/read', requireAuth, requireRole(...CHAT_STAFF), async (req, res) => {
  const { room } = req.body;
  if (!room) return error(res, 'room requerido', 400);
  const { count } = await prisma.chatMessage.updateMany({ where: { room, read: false }, data: { read: true } });
  return success(res, { message: 'Marcados como leídos', count });
});

// GET /v1/chat/my-unread — última actividad ajena en mis salas (para el aviso 🔴 en las apps)
router.get('/my-unread', requireAuth, async (req, res) => {
  const me = req.user.sub;
  const rooms = [`user_${me}`];
  // Si es representante, también vigila las salas de sus circulares
  const rep = await prisma.representative.findUnique({ where: { userId: me } }).catch(() => null);
  if (rep) {
    const circs = await prisma.circular.findMany({ where: { repId: rep.id }, select: { userId: true } });
    rooms.push(...circs.map(c => `user_${c.userId}`));
  }
  const latest = await prisma.chatMessage.findMany({
    where: { room: { in: rooms }, fromId: { not: me } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { room: true, createdAt: true }
  });
  const lastByRoom = {};
  latest.forEach(m => { if (!lastByRoom[m.room]) lastByRoom[m.room] = m.createdAt; });
  return success(res, { rooms: lastByRoom });
});

// GET /v1/chat/unread — total no leídos (admin)
router.get('/unread', requireAuth, requireRole(...CHAT_STAFF), async (_req, res) => {
  const count = await prisma.chatMessage.count({ where: { read: false } });
  return success(res, { unread: count });
});

module.exports = router;
