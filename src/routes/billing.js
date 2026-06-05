'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','business_developer','finance_officer','country_manager','regional_director'];

// GET /v1/billing/invoices — facturas emitidas (admin)
router.get('/invoices', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const where = {};
    if (status) where.status = status;
    const invoices = await prisma.invoice.findMany({
      where,
      include: { issuer: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });
    return success(res, invoices);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/billing/invoices
router.post('/invoices', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { clientName, clientEmail, currency, subtotal, taxRate, notes, dueDate, issuerId } = req.body;
    if (!clientName || !subtotal) return error(res, 'clientName y subtotal son obligatorios', 400);
    const sub   = parseFloat(subtotal);
    const tax   = parseFloat(taxRate || 0);
    const total = sub + (sub * tax / 100);
    const num   = `INV-${Date.now()}`;

    const invoice = await prisma.invoice.create({ data: {
      id:            uuidv4(),
      invoiceNumber: num,
      issuerId:      issuerId || req.user.sub,
      issuerName:    'INNOVAAFRIC',
      clientName,
      clientEmail:   clientEmail || null,
      currency:      currency || 'EUR',
      subtotal:      sub,
      taxRate:       tax,
      taxAmount:     sub * tax / 100,
      totalEur:      total,
      notes:         notes || null,
      dueDate:       dueDate ? new Date(dueDate) : null,
      status:        'draft'
    }});
    return success(res, invoice, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// PATCH /v1/billing/invoices/:id/send
router.patch('/invoices/:id/send', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const inv = await prisma.invoice.update({
      where: { id: req.params.id },
      data:  { status: 'sent', sentAt: new Date() }
    });
    return success(res, { id: inv.id, status: inv.status });
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// PATCH /v1/billing/invoices/:id/pay
router.patch('/invoices/:id/pay', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const inv = await prisma.invoice.update({
      where: { id: req.params.id },
      data:  { status: 'paid', paidAt: new Date() }
    });
    return success(res, { id: inv.id, status: inv.status });
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// GET /v1/billing/stats
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [total, paid, pending, overdue, vol] = await Promise.all([
      prisma.invoice.count(),
      prisma.invoice.count({ where: { status: 'paid' } }),
      prisma.invoice.count({ where: { status: { in: ['draft', 'sent'] } } }),
      prisma.invoice.count({ where: { status: 'sent', dueDate: { lt: new Date() } } }),
      prisma.invoice.aggregate({ _sum: { totalEur: true }, where: { status: 'paid' } })
    ]);
    return success(res, { total, paid, pending, overdue, totalVolume: vol._sum.totalEur || 0 });
  } catch (e) { return error(res, e.message, 500); }
});

module.exports = router;
