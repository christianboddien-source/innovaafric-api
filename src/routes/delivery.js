'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /v1/delivery/track/:tracking_id
router.get('/track/:tracking_id', async (req, res) => {
  const order = await prisma.order.findFirst({ where: { trackingId: req.params.tracking_id } });
  if (!order) return error(res, 'Tracking ID no encontrado', 404);

  const statusFlow = ['confirmed', 'processing_hub', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered'];
  const currentIdx = Math.min(2, statusFlow.length - 1);

  return success(res, {
    tracking_id: order.trackingId,
    order_id: order.id,
    status: statusFlow[currentIdx],
    status_history: statusFlow.slice(0, currentIdx + 1).map((s, i) => ({
      status: s, timestamp: new Date(Date.now() - (currentIdx - i) * 86400000).toISOString()
    })),
    current_location: { hub: 'Valencia, España', lat: 39.4699, lng: -0.3763 },
    estimated_delivery: order.estimatedDelivery,
    ce_certified: true,
    updated_at: new Date().toISOString()
  });
});

// El JWT lleva el id del usuario en `sub`
const uid = (req) => req.user.sub || req.user.id;

// ─────────────────────────────────────────────────────────────
// APP DEL RIDER
// ─────────────────────────────────────────────────────────────

// GET /v1/delivery/rider/me — perfil del rider logueado
router.get('/rider/me', requireAuth, async (req, res) => {
  const rider = await prisma.rider.findUnique({ where: { userId: uid(req) } });
  if (!rider) return error(res, 'No estás registrado como Rider', 403);
  const user = await prisma.user.findUnique({
    where: { id: uid(req) },
    select: { name: true, email: true, phone: true, country: true, city: true }
  });
  return success(res, { ...rider, user });
});

// PATCH /v1/delivery/rider/status — el rider cambia su disponibilidad
router.patch('/rider/status', requireAuth, async (req, res) => {
  const rider = await prisma.rider.findUnique({ where: { userId: uid(req) } });
  if (!rider) return error(res, 'No eres rider', 403);
  const { status } = req.body;
  if (!['available', 'busy', 'offline'].includes(status)) {
    return error(res, 'status debe ser available|busy|offline', 400);
  }
  const updated = await prisma.rider.update({ where: { id: rider.id }, data: { status } });
  return success(res, { message: `Estado actualizado: ${status}`, rider: updated });
});

// GET /v1/delivery/available-orders — comandas sin rider asignado
router.get('/available-orders', requireAuth, async (req, res) => {
  const rider = await prisma.rider.findUnique({ where: { userId: uid(req) } });
  if (!rider) return error(res, 'No eres rider', 403);
  const orders = await prisma.groceryOrder.findMany({
    where: { riderId: null, status: { in: ['preparing', 'ready', 'pending', 'confirmed'] } },
    include: {
      items: true,
      user: { select: { name: true, phone: true, city: true } }
    },
    orderBy: { createdAt: 'asc' },
    take: 30
  });
  return success(res, { count: orders.length, orders });
});

// POST /v1/delivery/orders/:id/accept — el rider acepta la comanda
router.post('/orders/:id/accept', requireAuth, async (req, res) => {
  const rider = await prisma.rider.findUnique({ where: { userId: uid(req) } });
  if (!rider) return error(res, 'No eres rider', 403);
  const order = await prisma.groceryOrder.findUnique({ where: { id: req.params.id } });
  if (!order) return error(res, 'Comanda no encontrada', 404);
  if (order.riderId) return error(res, 'Esta comanda ya fue aceptada por otro rider', 409);

  const [updatedOrder] = await prisma.$transaction([
    prisma.groceryOrder.update({
      where: { id: order.id },
      data: { riderId: rider.id, status: 'in_transit' }
    }),
    prisma.rider.update({ where: { id: rider.id }, data: { status: 'busy' } })
  ]);

  await triggerWebhook('order.accepted_by_rider', { orderId: order.id, riderId: rider.id });
  return success(res, {
    message: `✅ Comanda aceptada. Entrega en: ${order.deliveryAddress}`,
    order: updatedOrder,
    riderFee: order.riderFeeXaf
  });
});

// GET /v1/delivery/my-deliveries — comandas del rider (en curso e histórico)
router.get('/my-deliveries', requireAuth, async (req, res) => {
  const rider = await prisma.rider.findUnique({ where: { userId: uid(req) } });
  if (!rider) return error(res, 'No eres rider', 403);
  const orders = await prisma.groceryOrder.findMany({
    where: { riderId: rider.id },
    include: { user: { select: { name: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  return success(res, { count: orders.length, orders });
});

// GET /v1/delivery/riders
router.get('/riders', requireAuth, requireRole('circular_autorizada', 'admin'), async (req, res) => {
  const { zone, status } = req.query;
  const where = {};
  if (status) where.status = status;

  let riders = await prisma.rider.findMany({ where });
  if (zone) riders = riders.filter(r => r.zone.toLowerCase().includes(zone.toLowerCase()));
  return success(res, { riders, total: riders.length });
});

// POST /v1/delivery/riders — Registrar nuevo rider
router.post('/riders', requireAuth, async (req, res) => {
  const { name, phone, zone, vehicle } = req.body;
  if (!name || !phone || !zone || !vehicle) {
    return error(res, 'Campos requeridos: name, phone, zone, vehicle', 400);
  }
  const validVehicles = ['moto', 'bicicleta', 'coche', 'furgoneta'];
  if (!validVehicles.includes(vehicle)) return error(res, `Vehículo no válido: ${validVehicles.join(', ')}`, 400);

  const rider = await prisma.rider.create({
    data: {
      id: `rider_${uuidv4().slice(0, 8)}`,
      name, phone, zone, vehicle,
      status: 'pending_approval',
      registeredBy: req.user.sub
    }
  });

  await triggerWebhook('rider.registered', { id: rider.id, zone, vehicle });
  return success(res, rider, 201);
});

// PUT /v1/delivery/riders/:id/status
router.put('/riders/:id/status', requireAuth, async (req, res) => {
  const rider = await prisma.rider.findUnique({ where: { id: req.params.id } });
  if (!rider) return error(res, 'Rider no encontrado', 404);
  const { status } = req.body;
  const validStatuses = ['available', 'busy', 'offline'];
  if (!validStatuses.includes(status)) return error(res, `Status inválido: ${validStatuses.join(', ')}`, 400);

  const updated = await prisma.rider.update({ where: { id: req.params.id }, data: { status } });
  return success(res, updated);
});

// GET /v1/delivery/orders/:id
router.get('/orders/:id', requireAuth, async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } })
    || await prisma.groceryOrder.findUnique({ where: { id: req.params.id }, include: { items: true } });
  if (!order) return error(res, 'Pedido no encontrado', 404);
  return success(res, order);
});

// POST /v1/delivery/orders/:id/confirm — Confirmar entrega
router.post('/orders/:id/confirm', requireAuth, async (req, res) => {
  const { photo_url, signature_url, notes } = req.body;
  const deliveryProof = JSON.stringify({
    photo_url: photo_url || null,
    signature_url: signature_url || null,
    notes: notes || null,
    delivered_at: new Date().toISOString(),
    rider_id: req.user.sub
  });

  let order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (order) {
    order = await prisma.order.update({ where: { id: req.params.id }, data: { status: 'delivered', deliveryProof } });
  } else {
    order = await prisma.groceryOrder.findUnique({ where: { id: req.params.id } });
    if (!order) return error(res, 'Pedido no encontrado', 404);
    order = await prisma.groceryOrder.update({ where: { id: req.params.id }, data: { status: 'delivered', deliveryProof } });
  }

  await triggerWebhook('order.delivered', { id: order.id, delivered_at: JSON.parse(deliveryProof).delivered_at });
  return success(res, { id: order.id, status: 'delivered', delivery_proof: JSON.parse(deliveryProof) });
});

module.exports = router;
