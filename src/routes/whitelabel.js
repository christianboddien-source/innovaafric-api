'use strict';
const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','business_developer','country_manager','regional_director'];

// GET /v1/white-label/instances
router.get('/instances', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const instances = await prisma.whiteLabelInstance.findMany({ where, orderBy: { createdAt: 'desc' } });
    return success(res, instances);
  } catch (e) { return error(res, e.message, 500); }
});

// GET /v1/white-label/instances/:id
router.get('/instances/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const inst = await prisma.whiteLabelInstance.findUnique({ where: { id: req.params.id } });
    if (!inst) return error(res, 'Instancia no encontrada', 404);
    return success(res, inst);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/white-label/instances
router.post('/instances', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, partnerId, domain, colorPrimary, notes } = req.body;
    if (!name || !domain) return error(res, 'name y domain son obligatorios', 400);
    const inst = await prisma.whiteLabelInstance.create({ data: {
      name, partnerId: partnerId || null, domain,
      colorPrimary: colorPrimary || '#00AEEF',
      notes: notes || null, status: 'activo'
    }});
    return success(res, inst, 201);
  } catch (e) {
    if (e.code === 'P2002') return error(res, 'Dominio ya registrado', 409);
    return error(res, e.message, 500);
  }
});

// PATCH /v1/white-label/instances/:id
router.patch('/instances/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, status, colorPrimary, notes } = req.body;
    const inst = await prisma.whiteLabelInstance.update({
      where: { id: req.params.id },
      data:  { name, status, colorPrimary, notes }
    });
    return success(res, inst);
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// DELETE /v1/white-label/instances/:id
router.delete('/instances/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    await prisma.whiteLabelInstance.update({ where: { id: req.params.id }, data: { status: 'inactivo' } });
    return success(res, { message: 'Instancia desactivada.' });
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// GET /v1/white-label/stats
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [total, activo] = await Promise.all([
      prisma.whiteLabelInstance.count(),
      prisma.whiteLabelInstance.count({ where: { status: 'activo' } })
    ]);
    return success(res, { total, activo, inactivo: total - activo });
  } catch (e) { return error(res, e.message, 500); }
});

module.exports = router;
