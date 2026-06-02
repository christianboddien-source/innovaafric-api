'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','marketing_manager','support_agent','support_supervisor','country_manager','regional_director'];

let MESSAGES = [
  {id:'msg-001',from:'sistema',to:'all',subject:'Actualización de tarifas',body:'Estimado usuario, hemos actualizado nuestras tarifas de transferencia internacional. Consulta los nuevos precios en la app.',type:'transaccional',channel:'in-app',read:false,date:'2026-06-02T10:00:00Z'},
  {id:'msg-002',from:'promo',to:'role:customer',subject:'¡Oferta especial de junio!',body:'Transfiere gratis este mes con el código INNOVA2026.',type:'promo',channel:'in-app',read:false,date:'2026-06-01T09:00:00Z'},
  {id:'msg-003',from:'sistema',to:'country:SN',subject:'Nuevo operador Wave disponible',body:'Ya puedes recargar tu wallet con Wave en Sénégal.',type:'info',channel:'in-app',read:true,date:'2026-05-28T14:00:00Z'}
];

// GET /v1/messages/inbox
router.get('/inbox', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { read, type } = req.query;
  let list = MESSAGES;
  if (read !== undefined) list = list.filter(m => String(m.read) === read);
  if (type) list = list.filter(m => m.type === type);
  return success(res, list);
});

// POST /v1/messages/inbox
router.post('/inbox', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { to, subject, body, type, channel } = req.body;
  if (!to || !subject || !body) return error(res, 'Destinatario, asunto y cuerpo son obligatorios', 400);
  const msg = {
    id: 'msg-'+uuidv4().slice(0,8),
    from: 'admin', to, subject, body,
    type: type||'info', channel: channel||'in-app',
    read: false, date: new Date().toISOString()
  };
  MESSAGES.push(msg);
  return success(res, msg, 201);
});

// PUT /v1/messages/inbox/:id/read
router.put('/inbox/:id/read', requireAuth, async (req, res) => {
  const m = MESSAGES.find(x => x.id === req.params.id);
  if (!m) return error(res, 'Mensaje no encontrado', 404);
  m.read = true;
  return success(res, m);
});

module.exports = router;
