'use strict';

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { ok, error } = require('../helpers/response');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const prisma = new PrismaClient();

/* ── GET /events ──────────────────────────────────── */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { country, type, from, to } = req.query;
    const where = {};
    if (country) where.country = country;
    if (type)    where.type    = type;
    if (from || to) {
      where.startDate = {};
      if (from) where.startDate.gte = new Date(from);
      if (to)   where.startDate.lte = new Date(to);
    }
    const events = await prisma.event.findMany({
      where,
      orderBy: { startDate: 'asc' }
    });
    ok(res, { events, total: events.length });
  } catch (e) {
    error(res, e.message);
  }
});

/* ── GET /events/:id ──────────────────────────────── */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const ev = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!ev) return error(res, 'Evento no encontrado', 404);
    ok(res, ev);
  } catch (e) {
    error(res, e.message);
  }
});

/* ── POST /events ─────────────────────────────────── */
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, type, startDate, endDate, allDay, country, city, color } = req.body;
    if (!title || !startDate) return error(res, 'title y startDate son requeridos', 400);
    const ev = await prisma.event.create({
      data: {
        id: uuidv4(),
        title, description, type: type || 'announcement',
        startDate: new Date(startDate),
        endDate:   endDate ? new Date(endDate) : null,
        allDay:    allDay !== false,
        country:   country || null,
        city:      city    || null,
        color:     color   || '#00AEEF',
        createdBy: req.user.id
      }
    });
    ok(res, ev, 201);
  } catch (e) {
    error(res, e.message);
  }
});

/* ── PUT /events/:id ──────────────────────────────── */
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, type, startDate, endDate, allDay, country, city, color } = req.body;
    const ev = await prisma.event.update({
      where: { id: req.params.id },
      data: {
        ...(title       !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(type        !== undefined && { type }),
        ...(startDate   !== undefined && { startDate: new Date(startDate) }),
        ...(endDate     !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(allDay      !== undefined && { allDay }),
        ...(country     !== undefined && { country }),
        ...(city        !== undefined && { city }),
        ...(color       !== undefined && { color })
      }
    });
    ok(res, ev);
  } catch (e) {
    error(res, e.message);
  }
});

/* ── DELETE /events/:id ───────────────────────────── */
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await prisma.event.delete({ where: { id: req.params.id } });
    ok(res, { message: 'Evento eliminado' });
  } catch (e) {
    error(res, e.message);
  }
});

module.exports = router;
