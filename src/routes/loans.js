'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const CF = { EUR:'balanceEur', USD:'balanceUsd', XAF:'balanceXaf', XOF:'balanceXof' };

// GET /v1/loans — todos (admin)
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { status } = req.query;
  const loans = await prisma.loan.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, email: true, country: true } } }
  });
  const stats = {
    total: loans.length,
    pending:  loans.filter(l=>l.status==='pending').length,
    approved: loans.filter(l=>l.status==='approved').length,
    disbursed:loans.filter(l=>l.status==='disbursed').length,
    repaid:   loans.filter(l=>l.status==='repaid').length,
    rejected: loans.filter(l=>l.status==='rejected').length,
    total_disbursed: loans.filter(l=>['disbursed','repaid'].includes(l.status)).reduce((s,l)=>s+l.amount,0)
  };
  return success(res, { loans, stats });
});

// GET /v1/loans/my — préstamos propios
router.get('/my', requireAuth, async (req, res) => {
  const loans = await prisma.loan.findMany({ where: { userId: req.user.sub }, orderBy: { createdAt: 'desc' } });
  return success(res, { loans, total: loans.length });
});

// POST /v1/loans — solicitar préstamo
router.post('/', requireAuth, async (req, res) => {
  const { amount, currency = 'XAF', purpose, notes } = req.body;
  if (!amount || !purpose) return error(res, 'Campos requeridos: amount, purpose', 400);
  if (parseFloat(amount) <= 0) return error(res, 'El importe debe ser mayor que 0', 400);

  const validPurposes = ['restock', 'personal', 'business', 'equipment', 'emergency'];
  if (!validPurposes.includes(purpose)) return error(res, `Propósito inválido: ${validPurposes.join(', ')}`, 400);

  const active = await prisma.loan.findFirst({ where: { userId: req.user.sub, status: { in: ['pending','approved','disbursed'] } } });
  if (active) return error(res, 'Ya tienes un préstamo activo', 409);

  const loan = await prisma.loan.create({
    data: {
      id: `loan_${uuidv4().slice(0,8)}`,
      userId: req.user.sub,
      amount: parseFloat(amount), currency, purpose, notes,
      dueDate: new Date(Date.now() + 30 * 86400000)
    }
  });
  return success(res, loan, 201);
});

// PATCH /v1/loans/:id/approve
router.patch('/:id/approve', requireAuth, requireRole('admin'), async (req, res) => {
  const loan = await prisma.loan.findUnique({ where: { id: req.params.id } });
  if (!loan) return error(res, 'Préstamo no encontrado', 404);
  if (loan.status !== 'pending') return error(res, 'Solo se pueden aprobar préstamos pendientes', 400);
  const { interestRate, dueDate, notes } = req.body;
  const updated = await prisma.loan.update({
    where: { id: req.params.id },
    data: {
      status: 'approved', approvedBy: req.user.sub, approvedAt: new Date(),
      ...(interestRate !== undefined && { interestRate: parseFloat(interestRate) }),
      ...(dueDate && { dueDate: new Date(dueDate) }),
      ...(notes && { notes })
    }
  });
  return success(res, updated);
});

// PATCH /v1/loans/:id/reject
router.patch('/:id/reject', requireAuth, requireRole('admin'), async (req, res) => {
  const loan = await prisma.loan.findUnique({ where: { id: req.params.id } });
  if (!loan) return error(res, 'Préstamo no encontrado', 404);
  if (!['pending','approved'].includes(loan.status)) return error(res, 'No se puede rechazar en este estado', 400);
  return success(res, await prisma.loan.update({
    where: { id: req.params.id },
    data: { status: 'rejected', notes: req.body.notes || loan.notes }
  }));
});

// PATCH /v1/loans/:id/disburse — desembolsar
router.patch('/:id/disburse', requireAuth, requireRole('admin'), async (req, res) => {
  const loan = await prisma.loan.findUnique({ where: { id: req.params.id } });
  if (!loan) return error(res, 'Préstamo no encontrado', 404);
  if (loan.status !== 'approved') return error(res, 'Solo se pueden desembolsar préstamos aprobados', 400);

  const field = CF[loan.currency] || 'balanceXaf';
  await prisma.wallet.upsert({
    where:  { userId: loan.userId },
    update: { [field]: { increment: loan.amount } },
    create: { userId: loan.userId, [field]: loan.amount }
  });
  await prisma.transaction.create({
    data: {
      id: `lnd_${uuidv4().slice(0,8)}`,
      type: 'topup', userId: loan.userId,
      amountSent: loan.amount, currencySent: loan.currency,
      fee: 0, status: 'completed',
      reference: `Desembolso préstamo ${loan.id}`
    }
  });
  return success(res, await prisma.loan.update({ where: { id: req.params.id }, data: { status: 'disbursed' } }));
});

// PATCH /v1/loans/:id/repay — registrar pago
router.patch('/:id/repay', requireAuth, requireRole('admin'), async (req, res) => {
  const loan = await prisma.loan.findUnique({ where: { id: req.params.id } });
  if (!loan) return error(res, 'Préstamo no encontrado', 404);
  const newRepaid = loan.repaidAmount + parseFloat(req.body.amount || 0);
  const totalDue  = loan.amount * (1 + loan.interestRate / 100);
  const newStatus = newRepaid >= totalDue ? 'repaid' : 'disbursed';
  return success(res, await prisma.loan.update({
    where: { id: req.params.id },
    data:  { repaidAmount: newRepaid, status: newStatus }
  }));
});

module.exports = router;
