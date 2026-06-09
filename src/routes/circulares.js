'use strict';
const router  = require('express').Router();
const prisma  = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { success: ok, error } = require('../helpers/response');

const COMMISSION = 0.05; // 5% descuento en compra de unidades

// ─────────────────────────────────────────────────────────────
// RUTAS PROPIAS DEL CIRCULAR
// ─────────────────────────────────────────────────────────────

// GET /v1/circulares/me — ver mi cuenta
router.get('/me', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({
      where: { userId: req.user.id },
      include: { account: true }
    });
    if (!circ) return error(res, 'No estás registrado como Circular Autorizada', 403);
    return ok(res, circ);
  } catch (e) { return error(res, e.message); }
});

// POST /v1/circulares/purchase-units — circular solicita compra de unidades (5% descuento)
router.post('/purchase-units', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({ where: { userId: req.user.id } });
    if (!circ) return error(res, 'No eres Circular Autorizada', 403);
    if (circ.status !== 'active') return error(res, 'Tu cuenta no está activa. Contacta con tu representante o InnovaAFRIC.', 403);

    const { unitsRequested, currency = 'XAF', bankName, bankRef, notes } = req.body;
    if (!unitsRequested || unitsRequested <= 0) return error(res, 'unitsRequested debe ser > 0', 400);

    const rate       = circ.commissionRate ?? COMMISSION;
    const amountSaved = Math.round(unitsRequested * rate * 100) / 100;
    const amountToPay = Math.round(unitsRequested * (1 - rate) * 100) / 100;

    const purchase = await prisma.circularPurchase.create({
      data: {
        circularId: circ.id,
        unitsRequested, commissionRate: rate,
        amountToPay, amountSaved, currency,
        bankName, bankRef, notes,
        status: 'pending'
      }
    });

    return ok(res, {
      message: `Solicitud registrada. Transfiere ${amountToPay} ${currency} a InnovaAFRIC con ref: ${purchase.id}`,
      purchase,
      instructions: {
        amountToPay,
        saved: amountSaved,
        unitsYouWillReceive: unitsRequested,
        transferRef: purchase.id,
        note: `Con tu comisión del ${rate * 100}% ahorras ${amountSaved} ${currency}`
      }
    });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/circulares/topup-client — circular recarga la wallet de un usuario del barrio
router.post('/topup-client', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({
      where: { userId: req.user.id }, include: { account: true }
    });
    if (!circ) return error(res, 'No eres Circular Autorizada', 403);
    if (circ.status !== 'active') return error(res, 'Cuenta no activa', 403);
    if (!circ.account) return error(res, 'Tu cuenta de unidades no está inicializada', 400);

    const { clientId, amount, currency = 'XAF', note } = req.body;
    if (!clientId || !amount || amount <= 0) return error(res, 'clientId y amount requeridos', 400);
    if (circ.account.unitBalance < amount) {
      return error(res, `Saldo insuficiente. Tienes ${circ.account.unitBalance} unidades`, 400);
    }

    const client = await prisma.user.findUnique({
      where: { id: clientId }, select: { id: true, name: true, phone: true }
    });
    if (!client) return error(res, 'Cliente no encontrado', 404);

    const walletField = currency === 'XAF' ? 'balanceXaf'
                      : currency === 'XOF' ? 'balanceXof'
                      : currency === 'USD' ? 'balanceUsd'
                      : 'balanceEur';

    await prisma.$transaction([
      prisma.wallet.upsert({
        where: { userId: clientId },
        update: { [walletField]: { increment: amount } },
        create: { userId: clientId, [walletField]: amount }
      }),
      prisma.transaction.create({
        data: {
          id: `circ_topup_${circ.id}_${Date.now()}`,
          type: 'topup',
          userId: req.user.id,
          recipientId: clientId,
          amountSent: amount, currencySent: currency,
          amountReceived: amount, currencyReceived: currency,
          fee: 0,
          note: note || `Recarga por Circular Autorizada ${circ.id}`,
          status: 'completed'
        }
      }),
      prisma.circularAccount.update({
        where: { circularId: circ.id },
        data: {
          unitBalance:    { decrement: amount },
          totalUnitsUsed: { increment: amount }
        }
      }),
      prisma.circularTopUp.create({
        data: {
          circularId: circ.id, clientId,
          clientName: client.name, clientPhone: client.phone,
          amount, currency, note, status: 'completed'
        }
      })
    ]);

    const updated = await prisma.circularAccount.findUnique({ where: { circularId: circ.id } });
    const alertLow = updated.unitBalance < updated.alertThreshold;

    return ok(res, {
      message: `✅ ${amount} ${currency} acreditados a ${client.name}`,
      newBalance: updated.unitBalance,
      alertLow,
      alertMessage: alertLow ? `⚠️ Tu saldo es bajo (${updated.unitBalance} unidades). Solicita recarga.` : null
    });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/circulares/my-operations — historial del circular
router.get('/my-operations', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({
      where: { userId: req.user.id }, include: { account: true }
    });
    if (!circ) return error(res, 'No eres Circular Autorizada', 403);

    const { from, to, page = 1, limit = 50 } = req.query;
    const dateFilter = (from || to) ? { createdAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {};

    const [topUps, purchases] = await Promise.all([
      prisma.circularTopUp.findMany({
        where: { circularId: circ.id, ...dateFilter },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: Number(limit)
      }),
      prisma.circularPurchase.findMany({
        where: { circularId: circ.id, ...dateFilter },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return ok(res, { account: circ.account, topUps, purchases });
  } catch (e) { return error(res, e.message); }
});

// ─────────────────────────────────────────────────────────────
// RUTAS ADMIN + REPRESENTANTES
// ─────────────────────────────────────────────────────────────

// POST /v1/circulares/authorize — InnovaAFRIC o un Representante autoriza a un circular
router.post('/authorize', requireAuth, async (req, res) => {
  try {
    const actorRole = req.user.role;
    const isAdmin = ['admin', 'super_admin', 'finance_officer', 'country_manager'].includes(actorRole);
    const isRep   = actorRole === 'representante';
    if (!isAdmin && !isRep) return error(res, 'Solo admins o representantes pueden autorizar circulares', 403);

    const { userId, neighborhood, country, notes } = req.body;
    if (!userId || !neighborhood || !country) {
      return error(res, 'userId, neighborhood y country son requeridos', 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return error(res, 'Usuario no encontrado', 404);

    const existing = await prisma.circular.findUnique({ where: { userId } });
    if (existing) return error(res, 'Este usuario ya está registrado como Circular Autorizada', 409);

    // Si es un representante, buscamos su registro
    let repId = null;
    if (isRep) {
      const rep = await prisma.representative.findUnique({ where: { userId: req.user.id } });
      if (!rep) return error(res, 'No se encontró tu registro de representante', 403);
      repId = rep.id;
    }

    const circular = await prisma.circular.create({
      data: {
        userId,
        neighborhood,
        country,
        commissionRate: COMMISSION,
        status: 'active',
        authorizedBy: req.user.id,
        authorizedByType: isAdmin ? 'admin' : 'representative',
        repId,
        notes: notes || null
      }
    });

    // Crear cuenta de unidades vacía
    await prisma.circularAccount.create({ data: { circularId: circular.id } });

    // Actualizar rol del usuario a circular_autorizada
    await prisma.user.update({ where: { id: userId }, data: { role: 'circular_autorizada' } });

    return ok(res, {
      message: `✅ ${user.name || user.email} autorizado como Circular Autorizada en ${neighborhood}`,
      circular
    }, 201);
  } catch (e) { return error(res, e.message); }
});

// GET /v1/circulares — lista todos los circulares (admin o rep)
router.get('/', requireAuth, async (req, res) => {
  try {
    const actorRole = req.user.role;
    const isAdmin = ['admin', 'super_admin', 'finance_officer', 'country_manager'].includes(actorRole);
    const isRep   = actorRole === 'representante';
    if (!isAdmin && !isRep) return error(res, 'Sin permiso', 403);

    let where = {};
    if (isRep) {
      const rep = await prisma.representative.findUnique({ where: { userId: req.user.id } });
      if (rep) where = { repId: rep.id }; // rep solo ve sus circulares
    }

    const circulares = await prisma.circular.findMany({
      where,
      include: {
        account: true,
        user: { select: { id: true, name: true, email: true, phone: true, country: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return ok(res, { count: circulares.length, circulares });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/circulares/purchases/pending — compras pendientes de confirmar (admin)
router.get('/purchases/pending', requireAuth, requireRole('admin', 'super_admin', 'finance_officer'), async (req, res) => {
  try {
    const purchases = await prisma.circularPurchase.findMany({
      where: { status: 'pending' },
      include: {
        circular: {
          include: { user: { select: { name: true, email: true, phone: true } } }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
    return ok(res, { count: purchases.length, purchases });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/circulares/purchases/:id/confirm — admin confirma y acredita unidades
router.post('/purchases/:id/confirm', requireAuth, requireRole('admin', 'super_admin', 'finance_officer'), async (req, res) => {
  try {
    const purchase = await prisma.circularPurchase.findUnique({
      where: { id: req.params.id },
      include: { circular: { include: { account: true } } }
    });
    if (!purchase) return error(res, 'Solicitud no encontrada', 404);
    if (purchase.status !== 'pending') return error(res, 'Ya procesada', 400);

    const circularId = purchase.circular.id;

    await prisma.$transaction([
      prisma.circularPurchase.update({
        where: { id: purchase.id },
        data: { status: 'confirmed', confirmedBy: req.user.id, confirmedAt: new Date() }
      }),
      prisma.circularAccount.upsert({
        where: { circularId },
        update: {
          unitBalance:      { increment: purchase.unitsRequested },
          totalUnitsBought: { increment: purchase.unitsRequested },
          totalPaid:        { increment: purchase.amountToPay },
          totalSaved:       { increment: purchase.amountSaved }
        },
        create: {
          circularId,
          unitBalance:      purchase.unitsRequested,
          totalUnitsBought: purchase.unitsRequested,
          totalPaid:        purchase.amountToPay,
          totalSaved:       purchase.amountSaved
        }
      })
    ]);

    const updated = await prisma.circularAccount.findUnique({ where: { circularId } });

    // Si fue autorizado por un rep, notificar al rep (comisión de red)
    if (purchase.circular.repId) {
      // El representante ha generado actividad en su red — se puede usar para comisiones futuras
      await prisma.representative.update({
        where: { id: purchase.circular.repId },
        data: { totalEarned: { increment: purchase.amountSaved * 0.5 } } // 50% del ahorro del circular va al rep
      }).catch(() => {});
    }

    return ok(res, {
      message: `✅ ${purchase.unitsRequested} unidades acreditadas al Circular`,
      newBalance: updated.unitBalance
    });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/circulares/purchases/:id/reject — admin rechaza solicitud
router.post('/purchases/:id/reject', requireAuth, requireRole('admin', 'super_admin', 'finance_officer'), async (req, res) => {
  try {
    const { reason } = req.body;
    await prisma.circularPurchase.update({
      where: { id: req.params.id },
      data: { status: 'rejected', rejectedReason: reason || 'Rechazado por admin', confirmedBy: req.user.id, confirmedAt: new Date() }
    });
    return ok(res, { message: 'Solicitud rechazada' });
  } catch (e) { return error(res, e.message); }
});

// PATCH /v1/circulares/:id/status — admin activa/suspende un circular
router.patch('/:id/status', requireAuth, requireRole('admin', 'super_admin', 'country_manager'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended', 'pending'].includes(status)) {
      return error(res, 'status debe ser active|suspended|pending', 400);
    }
    const updated = await prisma.circular.update({
      where: { id: req.params.id },
      data: { status }
    });
    return ok(res, { message: `Estado actualizado a ${status}`, circular: updated });
  } catch (e) { return error(res, e.message); }
});

module.exports = router;
