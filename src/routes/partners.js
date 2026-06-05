'use strict';
const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','business_developer','finance_officer','country_manager','regional_director'];

// GET /v1/partners
router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { status, country, type } = req.query;
    const where = {};
    if (status)  where.status  = status;
    if (country) where.country = country;
    if (type)    where.type    = type;
    const partners = await prisma.partner.findMany({ where, orderBy: { joinedAt: 'desc' }, include: { _count: { select: { invoices: true } } } });
    return success(res, partners);
  } catch (e) { return error(res, e.message, 500); }
});

// GET /v1/partners/:id
router.get('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const p = await prisma.partner.findUnique({ where: { id: req.params.id }, include: { invoices: { orderBy: { createdAt: 'desc' }, take: 10 } } });
    if (!p) return error(res, 'Partner no encontrado', 404);
    return success(res, p);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/partners
router.post('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, type, country, contact, phone, share } = req.body;
    if (!name || !type || !country) return error(res, 'name, type y country son obligatorios', 400);
    const p = await prisma.partner.create({ data: { name, type, country, contact: contact||null, phone: phone||null, share: parseFloat(share||2.5) } });
    return success(res, p, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// PATCH /v1/partners/:id
router.patch('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, type, status, contact, phone, share } = req.body;
    const p = await prisma.partner.update({ where: { id: req.params.id }, data: { name, type, status, contact, phone, share: share ? parseFloat(share) : undefined } });
    return success(res, p);
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// PUT /v1/partners/:id/suspend
router.put('/:id/suspend', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const p = await prisma.partner.update({ where: { id: req.params.id }, data: { status: 'suspendido' } });
    return success(res, { id: p.id, status: p.status });
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// GET /v1/partners/invoices — todas las facturas de partners
router.get('/invoices/all', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const invoices = await prisma.partnerInvoice.findMany({ where, orderBy: { createdAt: 'desc' }, include: { partner: { select: { id: true, name: true, country: true } } } });
    return success(res, invoices);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/partners/:id/invoices
router.post('/:id/invoices', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { amount, currency, period, dueDate, notes } = req.body;
    if (!amount || !period || !dueDate) return error(res, 'amount, period y dueDate son obligatorios', 400);
    const p = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!p) return error(res, 'Partner no encontrado', 404);
    const inv = await prisma.partnerInvoice.create({ data: { partnerId: p.id, amount: parseFloat(amount), currency: currency||'XAF', period, dueDate: new Date(dueDate), notes: notes||null } });
    return success(res, inv, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// PATCH /v1/partners/invoices/:id/pay
router.patch('/invoices/:id/pay', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const inv = await prisma.partnerInvoice.update({ where: { id: req.params.id }, data: { status: 'pagada' } });
    return success(res, { id: inv.id, status: inv.status });
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

module.exports = router;
