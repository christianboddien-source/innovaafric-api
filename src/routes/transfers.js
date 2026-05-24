'use strict';

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { ok, error } = require('../helpers/response');

const router = express.Router();
const prisma = new PrismaClient();

/* ── GET /transfers — lista admin ─────────────────── */
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const where = status ? { status } : {};
    const [transfers, total] = await Promise.all([
      prisma.bankTransfer.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, country: true } } },
        orderBy: { createdAt: 'desc' },
        take:  parseInt(limit),
        skip:  parseInt(offset)
      }),
      prisma.bankTransfer.count({ where })
    ]);
    const stats = {
      pending:    await prisma.bankTransfer.count({ where: { status: 'pending' } }),
      processing: await prisma.bankTransfer.count({ where: { status: 'processing' } }),
      completed:  await prisma.bankTransfer.count({ where: { status: 'completed' } }),
      rejected:   await prisma.bankTransfer.count({ where: { status: 'rejected' } }),
      total:      await prisma.bankTransfer.count()
    };
    ok(res, { transfers, total, stats });
  } catch (e) {
    error(res, e.message);
  }
});

/* ── GET /transfers/my — transferencias del usuario ─ */
router.get('/my', verifyToken, async (req, res) => {
  try {
    const transfers = await prisma.bankTransfer.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    ok(res, { transfers });
  } catch (e) {
    error(res, e.message);
  }
});

/* ── POST /transfers — crear solicitud ────────────── */
router.post('/', verifyToken, async (req, res) => {
  try {
    const { amount, currency, bankName, accountName, accountNumber, swiftCode, ibanCode, country, reference } = req.body;
    if (!amount || !bankName || !accountName || !accountNumber || !country) {
      return error(res, 'Faltan campos requeridos: amount, bankName, accountName, accountNumber, country', 400);
    }
    if (amount <= 0) return error(res, 'El importe debe ser mayor a 0', 400);

    // Verificar que el usuario tiene saldo suficiente
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return error(res, 'Wallet no encontrada', 404);
    const curr = currency || 'XAF';
    const balanceField = `balance${curr.charAt(0).toUpperCase()}${curr.slice(1).toLowerCase()}`;
    const available = wallet[balanceField] ?? 0;
    if (available < amount) return error(res, `Saldo insuficiente. Disponible: ${available} ${curr}`, 400);

    // Descontar saldo
    await prisma.wallet.update({
      where: { userId: req.user.id },
      data: { [balanceField]: { decrement: amount } }
    });

    const transfer = await prisma.bankTransfer.create({
      data: {
        userId: req.user.id,
        amount, currency: curr, bankName, accountName, accountNumber,
        swiftCode: swiftCode || null, ibanCode: ibanCode || null,
        country, reference: reference || null,
        status: 'pending'
      }
    });
    ok(res, { transfer, message: 'Solicitud de transferencia creada. Será procesada en 1-3 días hábiles.' }, 201);
  } catch (e) {
    error(res, e.message);
  }
});

/* ── PATCH /transfers/:id/process ─────────────────── */
router.patch('/:id/process', verifyToken, requireAdmin, async (req, res) => {
  try {
    const t = await prisma.bankTransfer.update({
      where: { id: req.params.id },
      data: { status: 'processing', notes: req.body.notes || null }
    });
    ok(res, t);
  } catch (e) {
    error(res, e.message);
  }
});

/* ── PATCH /transfers/:id/complete ────────────────── */
router.patch('/:id/complete', verifyToken, requireAdmin, async (req, res) => {
  try {
    const t = await prisma.bankTransfer.update({
      where: { id: req.params.id },
      data: { status: 'completed', processedAt: new Date(), notes: req.body.notes || null }
    });
    ok(res, t);
  } catch (e) {
    error(res, e.message);
  }
});

/* ── PATCH /transfers/:id/reject ──────────────────── */
router.patch('/:id/reject', verifyToken, requireAdmin, async (req, res) => {
  try {
    const transfer = await prisma.bankTransfer.findUnique({ where: { id: req.params.id } });
    if (!transfer) return error(res, 'Transferencia no encontrada', 404);
    if (transfer.status === 'completed') return error(res, 'No se puede rechazar una transferencia completada', 400);

    // Devolver saldo si aún no estaba completada
    if (transfer.status !== 'rejected') {
      const curr = transfer.currency;
      const balanceField = `balance${curr.charAt(0).toUpperCase()}${curr.slice(1).toLowerCase()}`;
      await prisma.wallet.update({
        where: { userId: transfer.userId },
        data: { [balanceField]: { increment: transfer.amount } }
      });
    }

    const t = await prisma.bankTransfer.update({
      where: { id: req.params.id },
      data: { status: 'rejected', notes: req.body.notes || 'Rechazada por administración' }
    });
    ok(res, t);
  } catch (e) {
    error(res, e.message);
  }
});

module.exports = router;
