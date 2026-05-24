'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /v1/banks
router.get('/', async (req, res) => {
  const { country } = req.query;
  const where = {};
  if (country) where.country = country.toUpperCase();
  const banks = await prisma.bank.findMany({ where, orderBy: { name: 'asc' } });
  return success(res, { banks, total: banks.length });
});

// POST /v1/banks
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, code, country, currency, swiftCode, ibanFormat, logo } = req.body;
  if (!name || !country || !currency) return error(res, 'Campos requeridos: name, country, currency', 400);
  const bank = await prisma.bank.create({
    data: { id: `bank_${uuidv4().slice(0,8)}`, name, code, country: country.toUpperCase(), currency, swiftCode, ibanFormat, logo }
  });
  return success(res, bank, 201);
});

// PUT /v1/banks/:id
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.bank.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Banco no encontrado', 404);
  const { name, code, country, currency, swiftCode, ibanFormat, logo, active } = req.body;
  const data = {};
  if (name)                data.name = name;
  if (code)                data.code = code;
  if (country)             data.country = country.toUpperCase();
  if (currency)            data.currency = currency;
  if (swiftCode !== undefined)  data.swiftCode = swiftCode;
  if (ibanFormat !== undefined) data.ibanFormat = ibanFormat;
  if (logo !== undefined)       data.logo = logo;
  if (active !== undefined)     data.active = active;
  return success(res, await prisma.bank.update({ where: { id: req.params.id }, data }));
});

// DELETE /v1/banks/:id
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.bank.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Banco no encontrado', 404);
  try {
    await prisma.bank.delete({ where: { id: req.params.id } });
    return success(res, { message: 'Banco eliminado', id: req.params.id });
  } catch { return error(res, 'No se puede eliminar: tiene cuentas vinculadas', 409); }
});

// GET /v1/banks/accounts — lista todas las cuentas bancarias de usuarios (admin)
router.get('/accounts', requireAuth, requireRole('admin'), async (req, res) => {
  const accounts = await prisma.userBankAccount.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true, email: true } },
      bank: { select: { name: true, country: true } }
    }
  });
  return success(res, { accounts, total: accounts.length });
});

// POST /v1/banks/accounts — vincular cuenta bancaria
router.post('/accounts', requireAuth, async (req, res) => {
  const { user_id, bank_id, account_number, account_name, iban } = req.body;
  const userId = req.user.role === 'admin' ? (user_id || req.user.sub) : req.user.sub;
  if (!bank_id || !account_number || !account_name)
    return error(res, 'Campos requeridos: bank_id, account_number, account_name', 400);
  if (!await prisma.bank.findUnique({ where: { id: bank_id } }))
    return error(res, 'Banco no encontrado', 404);
  const account = await prisma.userBankAccount.create({
    data: { id: `uba_${uuidv4().slice(0,8)}`, userId, bankId: bank_id, accountNumber: account_number, accountName: account_name, iban }
  });
  return success(res, account, 201);
});

// PATCH /v1/banks/accounts/:id/verify
router.patch('/accounts/:id/verify', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.userBankAccount.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Cuenta no encontrada', 404);
  const updated = await prisma.userBankAccount.update({
    where: { id: req.params.id }, data: { verified: req.body.verified !== false }
  });
  return success(res, updated);
});

// DELETE /v1/banks/accounts/:id
router.delete('/accounts/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!await prisma.userBankAccount.findUnique({ where: { id: req.params.id } }))
    return error(res, 'Cuenta no encontrada', 404);
  await prisma.userBankAccount.delete({ where: { id: req.params.id } });
  return success(res, { message: 'Cuenta eliminada', id: req.params.id });
});

module.exports = router;
