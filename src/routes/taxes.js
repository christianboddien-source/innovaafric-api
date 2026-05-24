'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const VALID_TYPES = ['vat', 'income', 'transaction', 'import', 'custom'];

// GET /v1/taxes
router.get('/', async (req, res) => {
  const { country, type } = req.query;
  const where = {};
  if (country) where.country = country.toUpperCase();
  if (type)    where.type = type;
  const taxes = await prisma.tax.findMany({ where, orderBy: { country: 'asc' } });
  return success(res, { taxes, total: taxes.length });
});

// GET /v1/taxes/calculate
router.get('/calculate', async (req, res) => {
  const { amount, country, type = 'vat' } = req.query;
  if (!amount || !country) return error(res, 'amount y country requeridos', 400);
  const taxes = await prisma.tax.findMany({ where: { country: country.toUpperCase(), type, active: true } });
  const base  = parseFloat(amount);
  const breakdown = taxes.map(t => ({ name: t.name, rate: t.rate, amount: Math.round(base * t.rate / 100 * 100) / 100 }));
  const totalTax = breakdown.reduce((s, t) => s + t.amount, 0);
  return success(res, { base_amount: base, taxes: breakdown, total_tax: totalTax, total_with_tax: base + totalTax });
});

// POST /v1/taxes
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, type, rate, country, description } = req.body;
  if (!name || !type || rate === undefined || !country)
    return error(res, 'Campos requeridos: name, type, rate, country', 400);
  if (!VALID_TYPES.includes(type)) return error(res, `Tipo inválido: ${VALID_TYPES.join(', ')}`, 400);
  const tax = await prisma.tax.create({
    data: { id: `tax_${uuidv4().slice(0,8)}`, name, type, rate: parseFloat(rate), country: country.toUpperCase(), description }
  });
  return success(res, tax, 201);
});

// PUT /v1/taxes/:id
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.tax.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Impuesto no encontrado', 404);
  const { name, type, rate, country, description, active } = req.body;
  const data = {};
  if (name)                   data.name = name;
  if (type)                   data.type = type;
  if (rate !== undefined)     data.rate = parseFloat(rate);
  if (country)                data.country = country.toUpperCase();
  if (description !== undefined) data.description = description;
  if (active !== undefined)   data.active = active;
  return success(res, await prisma.tax.update({ where: { id: req.params.id }, data }));
});

// DELETE /v1/taxes/:id
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.tax.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Impuesto no encontrado', 404);
  await prisma.tax.delete({ where: { id: req.params.id } });
  return success(res, { message: 'Impuesto eliminado', id: req.params.id });
});

module.exports = router;
