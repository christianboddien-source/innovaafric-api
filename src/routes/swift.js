'use strict';
const express = require('express');
const router  = express.Router();
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');
const prisma  = require('../config/prisma');

const ADMIN = ['admin','super_admin','finance_officer','compliance_officer','country_manager','regional_director'];

// ── Helpers ───────────────────────────────────────────────────
function buildRef(type) {
  const prefix = type === 'SEPA' ? 'SEPA' : 'SWIFT';
  const year   = new Date().getFullYear();
  const seq    = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${year}-${seq}`;
}

// ── GET /v1/swift/transfers ───────────────────────────────────
router.get('/transfers', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { type, status, limit = 50, offset = 0 } = req.query;

    const where = {};
    // BankTransfer.reference almacena el tipo SWIFT/SEPA en el campo notes
    // Filtramos por el prefijo de la referencia si se pide
    if (status) where.status = status;

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

    // Mapear al formato esperado por el dashboard
    let mapped = transfers.map(t => ({
      id:       t.id,
      ref:      t.reference || buildRef(t.notes?.includes('SEPA') ? 'SEPA' : 'SWIFT'),
      type:     t.notes?.includes('SEPA') ? 'SEPA' : 'SWIFT',
      origin:   t.user?.country || '—',
      dest:     t.country,
      amount:   t.amount,
      currency: t.currency,
      bic:      t.swiftCode || t.ibanCode || '—',
      iban:     t.ibanCode,
      accountName: t.accountName,
      bankName: t.bankName,
      status:   t.status,
      date:     t.createdAt,
      user:     t.user
    }));

    // Filtro por tipo en memoria (SWIFT vs SEPA) si se solicita
    if (type) {
      const upperType = type.toUpperCase();
      mapped = mapped.filter(t => t.type === upperType);
    }

    return success(res, { transfers: mapped, total: mapped.length });
  } catch (e) {
    console.error('[swift] GET /transfers:', e.message);
    return error(res, e.message, 500);
  }
});

// ── POST /v1/swift/transfers ──────────────────────────────────
// Crea una solicitud de transferencia SWIFT o SEPA
router.post('/transfers', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { type = 'SWIFT', origin, dest, amount, currency = 'EUR', bic, iban, accountName, bankName } = req.body;
    if (!dest || !amount || !accountName || !bankName) {
      return error(res, 'dest, amount, accountName y bankName son obligatorios', 400);
    }
    if (amount <= 0) return error(res, 'amount debe ser mayor que 0', 400);

    const upperType = type.toUpperCase() === 'SEPA' ? 'SEPA' : 'SWIFT';
    const ref       = buildRef(upperType);

    const transfer = await prisma.bankTransfer.create({
      data: {
        userId:        req.user.sub || req.user.id,
        amount:        parseFloat(amount),
        currency,
        bankName,
        accountName,
        accountNumber: iban || bic || ref,
        swiftCode:     bic  || null,
        ibanCode:      iban || null,
        country:       dest,
        reference:     ref,
        status:        'pending',
        notes:         upperType   // guardamos SWIFT o SEPA en notes para filtrado
      }
    });

    return success(res, {
      id:       transfer.id,
      ref,
      type:     upperType,
      origin:   origin || '—',
      dest,
      amount:   transfer.amount,
      currency: transfer.currency,
      bic:      bic || '—',
      status:   transfer.status,
      date:     transfer.createdAt
    }, 201);
  } catch (e) {
    console.error('[swift] POST /transfers:', e.message);
    return error(res, e.message, 500);
  }
});

// ── PATCH /v1/swift/transfers/:id/process ────────────────────
router.patch('/transfers/:id/process', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const t = await prisma.bankTransfer.update({
      where: { id: req.params.id },
      data:  { status: 'processing' }
    });
    return success(res, { id: t.id, status: t.status });
  } catch (e) {
    return error(res, e.message, e.code === 'P2025' ? 404 : 500);
  }
});

// ── PATCH /v1/swift/transfers/:id/complete ───────────────────
router.patch('/transfers/:id/complete', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const t = await prisma.bankTransfer.update({
      where: { id: req.params.id },
      data:  { status: 'completed', processedAt: new Date() }
    });
    return success(res, { id: t.id, status: t.status, processedAt: t.processedAt });
  } catch (e) {
    return error(res, e.message, e.code === 'P2025' ? 404 : 500);
  }
});

// ── PATCH /v1/swift/transfers/:id/reject ─────────────────────
router.patch('/transfers/:id/reject', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { reason } = req.body;
    const t = await prisma.bankTransfer.update({
      where: { id: req.params.id },
      data:  { status: 'rejected', notes: reason || 'Rechazada por compliance' }
    });
    return success(res, { id: t.id, status: t.status });
  } catch (e) {
    return error(res, e.message, e.code === 'P2025' ? 404 : 500);
  }
});

// ── GET /v1/swift/stats ───────────────────────────────────────
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [all, liquidado, procesando, rechazado, volResult] = await Promise.all([
      prisma.bankTransfer.count(),
      prisma.bankTransfer.count({ where: { status: 'completed' } }),
      prisma.bankTransfer.count({ where: { status: { in: ['processing', 'pending'] } } }),
      prisma.bankTransfer.count({ where: { status: 'rejected' } }),
      prisma.bankTransfer.aggregate({
        where: { status: 'completed' },
        _sum: { amount: true }
      })
    ]);

    // Contar SWIFT vs SEPA por el campo notes
    const [swiftCount, sepaCount] = await Promise.all([
      prisma.bankTransfer.count({ where: { notes: 'SWIFT' } }),
      prisma.bankTransfer.count({ where: { notes: 'SEPA'  } })
    ]);

    return success(res, {
      total:       all,
      liquidado,
      procesando,
      rechazado,
      totalVolume: volResult._sum.amount || 0,
      swiftCount,
      sepaCount
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
});

module.exports = router;
