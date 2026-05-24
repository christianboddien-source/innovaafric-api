'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /v1/categories
router.get('/', async (_req, res) => {
  const cats = await prisma.providerCategory.findMany({ orderBy: { name: 'asc' } });
  return success(res, { categories: cats, total: cats.length });
});

// POST /v1/categories
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, icon = '📋', color = '#00AEEF', description } = req.body;
  if (!name) return error(res, 'Nombre requerido', 400);
  const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  try {
    const cat = await prisma.providerCategory.create({
      data: { id: `cat_${uuidv4().slice(0,8)}`, name, slug, icon, color, description }
    });
    return success(res, cat, 201);
  } catch { return error(res, 'Nombre o slug ya existe', 409); }
});

// PUT /v1/categories/:id
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.providerCategory.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Categoría no encontrada', 404);
  const { name, icon, color, description, active } = req.body;
  const data = {};
  if (name)                   { data.name = name; data.slug = name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''); }
  if (icon)                   data.icon = icon;
  if (color)                  data.color = color;
  if (description !== undefined) data.description = description;
  if (active !== undefined)   data.active = active;
  return success(res, await prisma.providerCategory.update({ where: { id: req.params.id }, data }));
});

// DELETE /v1/categories/:id
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.providerCategory.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Categoría no encontrada', 404);
  await prisma.providerCategory.delete({ where: { id: req.params.id } });
  return success(res, { message: 'Categoría eliminada', id: req.params.id });
});

module.exports = router;
