'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const prisma  = require('../config/prisma');
const { success, error, paginate } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /v1/accounting
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { type, category, from, to, page = 1, limit = 50 } = req.query;
  const where = {};
  if (type)     where.type = type;
  if (category) where.category = category;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to)   where.date.lte = new Date(to);
  }
  const entries = await prisma.accountingEntry.findMany({ where, orderBy: { date: 'desc' } });
  return success(res, paginate(entries, page, limit));
});

// GET /v1/accounting/summary — Resumen P&L
router.get('/summary', requireAuth, requireRole('admin'), async (req, res) => {
  const { from, to } = req.query;
  const where = {};
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to)   where.date.lte = new Date(to);
  }
  const entries = await prisma.accountingEntry.findMany({ where });
  const income   = entries.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
  const expenses = entries.filter(e=>e.type==='expense').reduce((s,e)=>s+e.amount,0);
  const byCategory = {};
  entries.forEach(e=>{
    if (!byCategory[e.category]) byCategory[e.category] = { income:0, expense:0, transfer:0 };
    byCategory[e.category][e.type] = (byCategory[e.category][e.type]||0) + e.amount;
  });
  // Monthly breakdown
  const monthly = {};
  entries.forEach(e=>{
    const m = new Date(e.date).toISOString().slice(0,7);
    if (!monthly[m]) monthly[m] = { income:0, expense:0 };
    if (e.type==='income')  monthly[m].income  += e.amount;
    if (e.type==='expense') monthly[m].expense += e.amount;
  });
  return success(res, {
    total_income:   income,
    total_expenses: expenses,
    net_profit:     income - expenses,
    by_category:    byCategory,
    monthly,
    entries_count:  entries.length
  });
});

// POST /v1/accounting
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { type, category, amount, currency = 'XAF', description, reference, date } = req.body;
  if (!type || !category || !amount || !description)
    return error(res, 'Campos requeridos: type, category, amount, description', 400);
  const validTypes = ['income','expense','transfer'];
  if (!validTypes.includes(type)) return error(res, `Tipo inválido: ${validTypes.join(', ')}`, 400);
  const entry = await prisma.accountingEntry.create({
    data: {
      id: `acc_${uuidv4().slice(0,8)}`,
      type, category, amount: parseFloat(amount), currency, description, reference,
      date: date ? new Date(date) : new Date()
    }
  });
  return success(res, entry, 201);
});

// PUT /v1/accounting/:id
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.accountingEntry.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Asiento no encontrado', 404);
  const { type, category, amount, currency, description, reference, date } = req.body;
  const data = {};
  if (type)                data.type = type;
  if (category)            data.category = category;
  if (amount !== undefined) data.amount = parseFloat(amount);
  if (currency)            data.currency = currency;
  if (description)         data.description = description;
  if (reference !== undefined) data.reference = reference;
  if (date)                data.date = new Date(date);
  return success(res, await prisma.accountingEntry.update({ where: { id: req.params.id }, data }));
});

// DELETE /v1/accounting/:id
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.accountingEntry.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Asiento no encontrado', 404);
  await prisma.accountingEntry.delete({ where: { id: req.params.id } });
  return success(res, { message: 'Asiento eliminado', id: req.params.id });
});

module.exports = router;
