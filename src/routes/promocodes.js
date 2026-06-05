'use strict';
const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','marketing_manager','country_manager','regional_director'];

router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    const now = new Date();
    return success(res, coupons.map(c => ({
      id: c.id, code: c.code, type: c.discountType, value: c.discountValue,
      minOrder: c.minOrderXaf || c.minOrderEur || 0,
      uses: c.uses, maxUses: c.maxUses, expires: c.expiresAt,
      status: c.active && new Date(c.expiresAt) > now && c.uses < c.maxUses ? 'activo' : 'inactivo',
      description: c.description
    })));
  } catch (e) { return error(res, e.message, 500); }
});

router.post('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { code, type, value, minOrderXaf, minOrderEur, maxUses, expires, description } = req.body;
    if (!code || !type || !value) return error(res, 'code, type y value son obligatorios', 400);
    const coupon = await prisma.coupon.create({ data: {
      id: code.toUpperCase(), code: code.toUpperCase(),
      discountType: type, discountValue: parseFloat(value),
      minOrderXaf: minOrderXaf ? parseFloat(minOrderXaf) : null,
      minOrderEur: minOrderEur ? parseFloat(minOrderEur) : null,
      maxUses: maxUses ? parseInt(maxUses) : 1000,
      expiresAt: expires ? new Date(expires) : new Date(Date.now() + 365*24*60*60*1000),
      description: description || null, active: true
    }});
    return success(res, coupon, 201);
  } catch (e) {
    if (e.code === 'P2002') return error(res, 'Código ya existe', 409);
    return error(res, e.message, 500);
  }
});

router.patch('/:id/toggle', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const existing = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!existing) return error(res, 'Código no encontrado', 404);
    const updated = await prisma.coupon.update({ where: { id: req.params.id }, data: { active: !existing.active } });
    return success(res, { id: updated.id, active: updated.active });
  } catch (e) { return error(res, e.message, 500); }
});

router.delete('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    return success(res, { message: 'Código eliminado.' });
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

router.post('/validate', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return error(res, 'code es obligatorio', 400);
    const c = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!c)                        return error(res, 'Código no válido', 404);
    if (!c.active)                 return error(res, 'Código desactivado', 400);
    if (c.uses >= c.maxUses)       return error(res, 'Código agotado', 400);
    if (new Date(c.expiresAt) < new Date()) return error(res, 'Código expirado', 400);
    return success(res, { valid: true, code: c.code, discountType: c.discountType, discountValue: c.discountValue, remaining: c.maxUses - c.uses });
  } catch (e) { return error(res, e.message, 500); }
});

module.exports = router;
