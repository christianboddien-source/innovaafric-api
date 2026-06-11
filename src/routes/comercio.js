'use strict';
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');
const { success: ok, error } = require('../helpers/response');

// El JWT lleva el id del usuario en `sub`
const uid = (req) => req.user.sub || req.user.id;

async function myMerchant(req) {
  return prisma.merchant.findUnique({ where: { userId: uid(req) } });
}

// GET /v1/comercio/me — perfil del comercio + resumen de comandas
router.get('/me', requireAuth, async (req, res) => {
  try {
    const m = await myMerchant(req);
    if (!m) return error(res, 'No estás registrado como Comercio', 403);
    if (!m.active) return error(res, 'Tu comercio está suspendido. Contacta con InnovaAFRIC.', 403);

    const [user, preparing, ready, inTransit, delivered, sales] = await Promise.all([
      prisma.user.findUnique({ where: { id: m.userId }, select: { name: true, email: true, phone: true } }),
      prisma.groceryOrder.count({ where: { merchantId: m.id, status: 'preparing' } }),
      prisma.groceryOrder.count({ where: { merchantId: m.id, status: 'ready' } }),
      prisma.groceryOrder.count({ where: { merchantId: m.id, status: 'in_transit' } }),
      prisma.groceryOrder.count({ where: { merchantId: m.id, status: 'delivered' } }),
      prisma.groceryOrder.aggregate({
        where: { merchantId: m.id, status: 'delivered' },
        _sum: { totalXaf: true }
      })
    ]);

    return ok(res, {
      ...m, user,
      stats: { preparing, ready, inTransit, delivered, totalSalesXaf: sales._sum.totalXaf || 0 }
    });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/comercio/orders — comandas del comercio
router.get('/orders', requireAuth, async (req, res) => {
  try {
    const m = await myMerchant(req);
    if (!m) return error(res, 'No eres Comercio', 403);
    const orders = await prisma.groceryOrder.findMany({
      where: { merchantId: m.id },
      include: {
        items: true,
        user: { select: { name: true, phone: true } },
        rider: { select: { name: true, phone: true, vehicle: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    return ok(res, { count: orders.length, orders });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/comercio/orders/:id/ready — comanda preparada → avisar a los riders
router.post('/orders/:id/ready', requireAuth, async (req, res) => {
  try {
    const m = await myMerchant(req);
    if (!m) return error(res, 'No eres Comercio', 403);
    const order = await prisma.groceryOrder.findUnique({ where: { id: req.params.id } });
    if (!order || order.merchantId !== m.id) return error(res, 'Comanda no encontrada', 404);
    if (order.status !== 'preparing') return error(res, `La comanda está en estado "${order.status}"`, 400);

    const updated = await prisma.groceryOrder.update({
      where: { id: order.id },
      data: { status: 'ready' }
    });
    // Los riders disponibles la verán al instante en su pestaña Comandas
    const ridersOnline = await prisma.rider.count({ where: { status: 'available' } });
    return ok(res, {
      message: `📢 Comanda lista — visible para ${ridersOnline} rider(s) disponibles ahora mismo`,
      order: updated
    });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/comercio/orders/:id/cancel — cancelar y reembolsar al cliente
router.post('/orders/:id/cancel', requireAuth, async (req, res) => {
  try {
    const m = await myMerchant(req);
    if (!m) return error(res, 'No eres Comercio', 403);
    const order = await prisma.groceryOrder.findUnique({ where: { id: req.params.id } });
    if (!order || order.merchantId !== m.id) return error(res, 'Comanda no encontrada', 404);
    if (!['preparing', 'ready'].includes(order.status)) {
      return error(res, 'Solo se puede cancelar antes de que un rider la acepte', 400);
    }
    const { reason } = req.body;

    await prisma.$transaction([
      prisma.groceryOrder.update({
        where: { id: order.id },
        data: { status: 'cancelled', notes: `${order.notes || ''} | Cancelada por el comercio: ${reason || 'sin stock'}`.trim() }
      }),
      // Reembolso al cliente
      prisma.wallet.upsert({
        where: { userId: order.userId },
        update: { balanceXaf: { increment: order.totalXaf } },
        create: { userId: order.userId, balanceXaf: order.totalXaf }
      }),
      prisma.transaction.create({
        data: {
          id: `refund_${order.id}_${Date.now()}`,
          type: 'refund',
          userId: m.userId,
          recipientId: order.userId,
          amountSent: order.totalXaf, currencySent: 'XAF',
          amountReceived: order.totalXaf, currencyReceived: 'XAF',
          fee: 0, status: 'completed',
          note: `Reembolso comanda #${order.id} cancelada por ${m.name}`
        }
      })
    ]);

    return ok(res, { message: `Comanda cancelada y ${order.totalXaf.toLocaleString()} XAF reembolsados al cliente` });
  } catch (e) { return error(res, e.message); }
});

module.exports = router;
