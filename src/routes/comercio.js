'use strict';
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { success: ok, error } = require('../helpers/response');

const ADMIN = ['admin', 'super_admin', 'business_developer', 'country_manager'];

// El JWT lleva el id del usuario en `sub`
const uid = (req) => req.user.sub || req.user.id;

async function myMerchant(req) {
  return prisma.merchant.findUnique({ where: { userId: uid(req) } });
}

// ─────────────────────────────────────────────────────────────
// ADMIN: alta y listado de comercios con app
// ─────────────────────────────────────────────────────────────

// POST /v1/comercio/register — crea el usuario + comercio en un paso (admin)
router.post('/register', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, email, phone, address, city, country, category, password } = req.body;
    if (!name || !email || !country) return error(res, 'name, email y country son obligatorios', 400);

    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const already = await prisma.merchant.findUnique({ where: { userId: user.id } });
      if (already) return error(res, 'Este email ya tiene un comercio registrado', 409);
    }

    // Contraseña generada si no se indica
    const plainPass = password || `IA-${uuidv4().slice(0, 8)}`;
    const isNewUser = !user;
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: uuidv4(),
          email,
          name,
          phone: phone || '',
          country,
          city: city || null,
          role: 'supplier',
          passwordHash: bcrypt.hashSync(plainPass, 10),
          kycStatus: 'verified'
        }
      });
    }

    const merchant = await prisma.merchant.create({
      data: {
        id: `mer_${uuidv4().slice(0, 8)}`,
        name,
        qrCode: `qr_${uuidv4().slice(0, 10)}`,
        active: true,
        userId: user.id,
        phone: phone || null,
        address: address || null,
        city: city || null,
        country,
        category: category || null
      }
    });

    const baseUrl = process.env.PUBLIC_URL || 'https://innovaafric-api-production.up.railway.app';
    return ok(res, {
      message: `✅ Comercio "${name}" creado`,
      merchant,
      appUrl: `${baseUrl}/comercio`,
      credentials: isNewUser
        ? { email, password: plainPass, note: 'Entrega estas credenciales al comercio. Puede cambiar la contraseña con "He olvidado mi contraseña".' }
        : { email, note: 'El usuario ya existía — usa su contraseña habitual.' }
    }, 201);
  } catch (e) { return error(res, e.message); }
});

// GET /v1/comercio/list — todos los comercios con app (admin)
router.get('/list', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const merchants = await prisma.merchant.findMany({ orderBy: { createdAt: 'desc' } });
    const users = await prisma.user.findMany({
      where: { id: { in: merchants.map(m => m.userId).filter(Boolean) } },
      select: { id: true, email: true, phone: true }
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const withUsers = merchants.map(m => ({ ...m, user: m.userId ? userMap[m.userId] || null : null }));
    return ok(res, { count: withUsers.length, merchants: withUsers });
  } catch (e) { return error(res, e.message); }
});

// PATCH /v1/comercio/:id/active — admin activa/suspende un comercio
router.patch('/:id/active', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { active } = req.body;
    const m = await prisma.merchant.update({
      where: { id: req.params.id },
      data: { active: !!active }
    });
    return ok(res, { message: `Comercio ${m.active ? 'activado' : 'suspendido'}`, merchant: m });
  } catch (e) { return error(res, e.message); }
});

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

// PATCH /v1/comercio/open — abrir/cerrar el comercio (autogestión)
router.patch('/open', requireAuth, async (req, res) => {
  try {
    const m = await myMerchant(req);
    if (!m) return error(res, 'No eres Comercio', 403);
    const isOpen = !!req.body.isOpen;
    const updated = await prisma.merchant.update({ where: { id: m.id }, data: { isOpen } });
    return ok(res, { isOpen: updated.isOpen, message: isOpen ? 'Comercio ABIERTO' : 'Comercio CERRADO' });
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
