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

// Aplana una cuenta para las apps: el cliente espera bank_name / bic en plano,
// no un objeto "bank" anidado.
function shapeAccount(a) {
  return {
    id: a.id,
    user_id: a.userId,
    bank_id: a.bankId,
    bank_name: a.bank ? a.bank.name : null,
    bic: a.bank ? a.bank.swiftCode : null,
    country: a.bank ? a.bank.country : null,
    account_number: a.accountNumber,
    account_name: a.accountName,
    iban: a.iban,
    city: a.city,
    currency: a.currency || (a.bank ? a.bank.currency : null),
    phone: a.holderPhone,
    address: a.holderAddress,
    reference: a.reference,
    emoji: a.emoji,
    verified: a.verified,
    created_at: a.createdAt,
    user: a.user || undefined
  };
}

// GET /v1/banks/accounts — el cliente ve las suyas; el admin, todas.
// Antes exigía rol admin, así que ningún usuario podía ver sus propias cuentas.
router.get('/accounts', requireAuth, async (req, res) => {
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  const accounts = await prisma.userBankAccount.findMany({
    where: isAdmin ? {} : { userId: req.user.sub },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true, email: true } },
      bank: { select: { name: true, country: true, currency: true, swiftCode: true } }
    }
  });
  return success(res, { accounts: accounts.map(shapeAccount), total: accounts.length });
});

// POST /v1/banks/accounts — vincular cuenta bancaria.
// Acepta dos formas: la del catálogo (bank_id) y la del formulario de las apps,
// que manda el nombre del banco escrito a mano (bank_name + country).
router.post('/accounts', requireAuth, async (req, res) => {
  const {
    user_id, bank_id, bank_name, account_number, account_name, iban,
    bic, country, city, currency, phone, address, reference, emoji
  } = req.body;

  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  const userId  = isAdmin ? (user_id || req.user.sub) : req.user.sub;

  const number = account_number || iban;
  const holder = account_name || req.body.account_holder;
  if (!bank_id && !bank_name) return error(res, 'Indica bank_id o bank_name', 400);
  if (!number) return error(res, 'Campo requerido: account_number (o iban)', 400);
  if (!holder) return error(res, 'Campo requerido: account_name (titular)', 400);

  let bank;
  if (bank_id) {
    bank = await prisma.bank.findUnique({ where: { id: bank_id } });
    if (!bank) return error(res, 'Banco no encontrado', 404);
  } else {
    // Alta por nombre: si el banco no está en el catálogo, se añade.
    // Así el catálogo se va llenando con los bancos que la gente usa de verdad.
    const cc = String(country || '').toUpperCase() || 'GQ';
    bank = await prisma.bank.findFirst({
      where: { name: { equals: bank_name, mode: 'insensitive' }, country: cc }
    });
    if (!bank) {
      bank = await prisma.bank.create({
        data: {
          id: `bank_${uuidv4().slice(0, 8)}`,
          name: bank_name,
          country: cc,
          currency: currency || 'XAF',
          swiftCode: bic || null
        }
      });
    } else if (bic && !bank.swiftCode) {
      bank = await prisma.bank.update({ where: { id: bank.id }, data: { swiftCode: bic } });
    }
  }

  const account = await prisma.userBankAccount.create({
    data: {
      id: `uba_${uuidv4().slice(0, 8)}`,
      userId, bankId: bank.id,
      accountNumber: number,
      accountName: holder,
      iban: iban || null,
      city: city || null,
      currency: currency || null,
      holderPhone: phone || null,
      holderAddress: address || null,
      reference: reference || null,
      emoji: emoji || null
    },
    include: { bank: { select: { name: true, country: true, currency: true, swiftCode: true } } }
  });
  return success(res, shapeAccount(account), 201);
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

// DELETE /v1/banks/accounts/:id — el dueño puede borrar la suya; el admin, cualquiera
router.delete('/accounts/:id', requireAuth, async (req, res) => {
  const account = await prisma.userBankAccount.findUnique({ where: { id: req.params.id } });
  if (!account) return error(res, 'Cuenta no encontrada', 404);
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  if (!isAdmin && account.userId !== req.user.sub)
    return error(res, 'No puedes borrar una cuenta que no es tuya', 403);
  await prisma.userBankAccount.delete({ where: { id: req.params.id } });
  return success(res, { message: 'Cuenta eliminada', id: req.params.id });
});

module.exports = router;
