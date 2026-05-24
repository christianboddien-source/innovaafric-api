'use strict';

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ok, error } = require('../helpers/response');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const router  = express.Router();
const prisma  = new PrismaClient();
const requireAdmin = requireRole('admin');

/* GET /apikeys */
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const keys = await prisma.apiClient.findMany({ orderBy: { createdAt: 'desc' } });
    ok(res, { keys, total: keys.length, active: keys.filter(k => k.active).length });
  } catch (e) { error(res, e.message); }
});

/* POST /apikeys — crear nueva API key */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, scopes, description } = req.body;
    if (!name) return error(res, 'name es requerido', 400);
    const clientId     = 'iak_' + uuidv4().replace(/-/g, '').slice(0, 20);
    const clientSecret = 'sk_live_' + crypto.randomBytes(24).toString('hex');
    const key = await prisma.apiClient.create({
      data: {
        clientId, clientSecret,
        name,
        scopes:      scopes      || 'read',
        description: description || null,
        active:      true
      }
    });
    ok(res, { ...key, clientSecret }, 201);
  } catch (e) { error(res, e.message); }
});

/* PATCH /apikeys/:id/toggle — activar / desactivar */
router.patch('/:id/toggle', requireAuth, requireAdmin, async (req, res) => {
  try {
    const key = await prisma.apiClient.findUnique({ where: { id: req.params.id } });
    if (!key) return error(res, 'API Key no encontrada', 404);
    const updated = await prisma.apiClient.update({
      where: { id: req.params.id },
      data:  { active: !key.active }
    });
    ok(res, updated);
  } catch (e) { error(res, e.message); }
});

/* DELETE /apikeys/:id — revocar */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.apiClient.delete({ where: { id: req.params.id } });
    ok(res, { message: 'API Key revocada' });
  } catch (e) { error(res, e.message); }
});

module.exports = router;
