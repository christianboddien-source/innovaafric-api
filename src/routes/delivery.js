'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /v1/delivery/track/:tracking_id
router.get('/track/:tracking_id', (req, res) => {
  const order = DB.orders.find(o => o.tracking_id === req.params.tracking_id);
  if (!order) return error(res, 'Tracking ID no encontrado', 404);

  const statusFlow = ['confirmed', 'processing_hub', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered'];
  const currentIdx = Math.min(2, statusFlow.length - 1);

  return success(res, {
    tracking_id: order.tracking_id,
    order_id: order.id,
    status: statusFlow[currentIdx],
    status_history: statusFlow.slice(0, currentIdx + 1).map((s, i) => ({
      status: s, timestamp: new Date(Date.now() - (currentIdx - i) * 86400000).toISOString()
    })),
    current_location: { hub: 'Valencia, España', lat: 39.4699, lng: -0.3763 },
    estimated_delivery: order.estimated_delivery,
    ce_certified: true,
    updated_at: new Date().toISOString()
  });
});

// GET /v1/delivery/riders
router.get('/riders', requireAuth, requireRole('circular_autorizada', 'admin'), (req, res) => {
  const { zone, status } = req.query;
  let riders = [...DB.riders];
  if (zone)   riders = riders.filter(r => r.zone.toLowerCase().includes(zone.toLowerCase()));
  if (status) riders = riders.filter(r => r.status === status);
  return success(res, { riders, total: riders.length });
});

// POST /v1/delivery/riders — Registrar nuevo rider
router.post('/riders', requireAuth, (req, res) => {
  const { name, phone, zone, vehicle } = req.body;
  if (!name || !phone || !zone || !vehicle) {
    return error(res, 'Campos requeridos: name, phone, zone, vehicle', 400);
  }
  const validVehicles = ['moto', 'bicicleta', 'coche', 'furgoneta'];
  if (!validVehicles.includes(vehicle)) return error(res, `Vehículo no válido: ${validVehicles.join(', ')}`, 400);

  const rider = {
    id: `rider_${uuidv4().slice(0, 8)}`,
    name, phone, zone, vehicle,
    status: 'pending_approval',
    rating: null, deliveries_total: 0,
    registered_by: req.user.sub,
    created_at: new Date().toISOString()
  };
  DB.riders.push(rider);
  triggerWebhook('rider.registered', { id: rider.id, zone, vehicle });
  return success(res, rider, 201);
});

// PUT /v1/delivery/riders/:id/status
router.put('/riders/:id/status', requireAuth, (req, res) => {
  const rider = DB.riders.find(r => r.id === req.params.id);
  if (!rider) return error(res, 'Rider no encontrado', 404);
  const { status } = req.body;
  const validStatuses = ['available', 'busy', 'offline'];
  if (!validStatuses.includes(status)) return error(res, `Status inválido: ${validStatuses.join(', ')}`, 400);
  rider.status = status;
  rider.updated_at = new Date().toISOString();
  return success(res, rider);
});

// GET /v1/delivery/orders/:id
router.get('/orders/:id', requireAuth, (req, res) => {
  const order = DB.orders.find(o => o.id === req.params.id) ||
                DB.grocery_orders.find(o => o.id === req.params.id);
  if (!order) return error(res, 'Pedido no encontrado', 404);
  return success(res, order);
});

// POST /v1/delivery/orders/:id/confirm — Confirmar entrega
router.post('/orders/:id/confirm', requireAuth, (req, res) => {
  const { photo_url, signature_url, notes } = req.body;
  const order = DB.orders.find(o => o.id === req.params.id) ||
                DB.grocery_orders.find(o => o.id === req.params.id);
  if (!order) return error(res, 'Pedido no encontrado', 404);

  order.status = 'delivered';
  order.delivery_proof = {
    photo_url: photo_url || null,
    signature_url: signature_url || null,
    notes: notes || null,
    delivered_at: new Date().toISOString(),
    rider_id: req.user.sub
  };
  triggerWebhook('order.delivered', { id: order.id, delivered_at: order.delivery_proof.delivered_at });
  return success(res, { id: order.id, status: 'delivered', delivery_proof: order.delivery_proof });
});

module.exports = router;
