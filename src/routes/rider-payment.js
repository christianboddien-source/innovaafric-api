'use strict';
const router = require('express').Router();
const prisma  = require('../config/prisma');
const { requireAuth: authenticate, requireRole } = require('../middleware/auth');
const { success: ok, error } = require('../helpers/response');
const { distributeCommission } = require('../services/commission');

// El JWT lleva el id del usuario en `sub`
const uid = (req) => req.user.sub || req.user.id;

/**
 * POST /v1/rider-payment/confirm/:orderId
 * El cliente confirma la entrega → sistema libera el pago al rider automáticamente
 * (si riderPaymentMode === 'auto') o lo pone en cola manual.
 */
router.post('/confirm/:orderId', authenticate, async (req, res) => {
  try {
    const order = await prisma.groceryOrder.findUnique({
      where: { id: req.params.orderId },
      include: { rider: true }
    });

    if (!order) return error(res, 'Pedido no encontrado', 404);
    if (order.userId !== uid(req)) return error(res, 'No autorizado', 403);
    if (order.riderFeeStatus === 'released' || order.riderFeeStatus === 'manual_released')
      return error(res, 'Pago del rider ya liberado', 400);
    if (order.status !== 'delivering' && order.status !== 'delivered')
      return error(res, 'El pedido aún no está en camino', 400);

    const now = new Date();

    if (order.riderPaymentMode === 'auto' && order.riderId && order.riderFeeXaf > 0) {
      // Buscar wallet del rider
      const rider = await prisma.rider.findUnique({
        where: { id: order.riderId },
        select: { userId: true, name: true }
      });

      if (rider?.userId) {
        // Transferir riderFeeXaf al wallet del rider
        await prisma.$transaction([
          prisma.wallet.update({
            where: { userId: rider.userId },
            data: { balanceXaf: { increment: order.riderFeeXaf } }
          }),
          prisma.transaction.create({
            data: {
              id: `rider_pay_${order.id}_${Date.now()}`,
              type: 'rider_payment',
              userId: order.userId,
              recipientId: rider.userId,
              amountSent: order.riderFeeXaf,
              currencySent: 'XAF',
              amountReceived: order.riderFeeXaf,
              currencyReceived: 'XAF',
              fee: 0,
              note: `Pago rider pedido #${order.id}`,
              status: 'completed'
            }
          }),
          prisma.groceryOrder.update({
            where: { id: order.id },
            data: {
              status: 'delivered',
              riderFeeStatus: 'released',
              confirmedAt: now,
              riderPaidAt: now
            }
          })
        ]);

        // Registrar comisión de delivery (IVA del fee del rider)
        await distributeCommission({
          feeType: 'delivery',
          amount: order.riderFeeXaf,
          currency: 'XAF',
          orderId: order.id,
          clientUserId: order.userId
        });

        return ok(res, {
          message: `✅ Entrega confirmada. €${order.riderFeeXaf} XAF transferidos al rider ${rider.name}`,
          riderPaid: true,
          amount: order.riderFeeXaf
        });
      }
    }

    // Modo manual o rider sin userId → poner en cola
    await prisma.groceryOrder.update({
      where: { id: order.id },
      data: {
        status: 'delivered',
        riderFeeStatus: 'escrow',
        confirmedAt: now
      }
    });

    return ok(res, {
      message: '✅ Entrega confirmada. Pago del rider pendiente de liberación manual.',
      riderPaid: false,
      manual: true
    });

  } catch (e) {
    return error(res, e.message);
  }
});

/**
 * POST /v1/rider-payment/release/:orderId
 * Admin libera manualmente el pago al rider.
 */
router.post('/release/:orderId', authenticate, requireRole('admin', 'super_admin', 'finance_officer'), async (req, res) => {
  try {
    const order = await prisma.groceryOrder.findUnique({
      where: { id: req.params.orderId },
      include: { rider: true }
    });

    if (!order) return error(res, 'Pedido no encontrado', 404);
    if (order.riderFeeStatus === 'released' || order.riderFeeStatus === 'manual_released')
      return error(res, 'Pago ya liberado', 400);
    if (!order.riderId) return error(res, 'Sin rider asignado', 400);

    const rider = await prisma.rider.findUnique({
      where: { id: order.riderId },
      select: { userId: true, name: true }
    });

    if (!rider?.userId) return error(res, 'El rider no tiene cuenta wallet vinculada', 400);

    const now = new Date();

    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: rider.userId },
        data: { balanceXaf: { increment: order.riderFeeXaf } }
      }),
      prisma.transaction.create({
        data: {
          id: `rider_manual_${order.id}_${Date.now()}`,
          type: 'rider_payment',
          userId: uid(req),
          recipientId: rider.userId,
          amountSent: order.riderFeeXaf,
          currencySent: 'XAF',
          amountReceived: order.riderFeeXaf,
          currencyReceived: 'XAF',
          fee: 0,
          note: `Pago manual rider pedido #${order.id}`,
          status: 'completed'
        }
      }),
      prisma.groceryOrder.update({
        where: { id: order.id },
        data: { riderFeeStatus: 'manual_released', riderPaidAt: now }
      })
    ]);

    return ok(res, {
      message: `Pago manual de ${order.riderFeeXaf} XAF liberado al rider ${rider.name}`,
      riderPaid: true
    });
  } catch (e) {
    return error(res, e.message);
  }
});

/**
 * PATCH /v1/rider-payment/mode/:orderId
 * Admin cambia el modo de pago del rider (auto ↔ manual).
 */
router.patch('/mode/:orderId', authenticate, requireRole('admin', 'super_admin', 'finance_officer'), async (req, res) => {
  try {
    const { mode } = req.body;
    if (!['auto', 'manual'].includes(mode)) return error(res, 'mode debe ser auto o manual', 400);

    await prisma.groceryOrder.update({
      where: { id: req.params.orderId },
      data: { riderPaymentMode: mode }
    });

    return ok(res, { message: `Modo de pago cambiado a: ${mode}` });
  } catch (e) {
    return error(res, e.message);
  }
});

/**
 * GET /v1/rider-payment/pending
 * Admin: lista pedidos con pago de rider pendiente de liberar.
 */
router.get('/pending', authenticate, requireRole('admin', 'super_admin', 'finance_officer'), async (req, res) => {
  try {
    const orders = await prisma.groceryOrder.findMany({
      where: { riderFeeStatus: 'escrow', riderFeeXaf: { gt: 0 } },
      include: { rider: { select: { id: true, name: true, phone: true, userId: true } },
                 user:  { select: { id: true, name: true, phone: true } } },
      orderBy: { confirmedAt: 'asc' }
    });

    return ok(res, { count: orders.length, orders });
  } catch (e) {
    return error(res, e.message);
  }
});

module.exports = router;
