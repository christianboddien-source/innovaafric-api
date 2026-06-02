'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','marketing_manager','country_manager','regional_director'];

let SMS_LOG = [
  {id:'sms-001',to:'+240 333 100 001',message:'Tu transferencia de 50.000 XAF fue exitosa.',status:'entregado',provider:'Infobip',country:'GQ',date:'2026-06-02T10:15:00Z'},
  {id:'sms-002',to:'+221 77 200 002',message:'Nuevo inicio de sesión detectado en tu cuenta.',status:'entregado',provider:'Twilio',country:'SN',date:'2026-06-02T09:30:00Z'},
  {id:'sms-003',to:'+237 699 300 003',message:'Tu KYC ha sido aprobado. ¡Bienvenido!',status:'fallido',provider:'Infobip',country:'CM',date:'2026-06-01T14:00:00Z'}
];

// GET /v1/sms
router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, SMS_LOG);
});

// POST /v1/sms/send
router.post('/send', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { to, message, provider } = req.body;
  if (!to || !message) return error(res, 'Teléfono y mensaje son obligatorios', 400);
  const entry = {
    id: 'sms-'+uuidv4().slice(0,8),
    to, message,
    status: Math.random() > 0.1 ? 'entregado' : 'fallido',
    provider: provider||'Infobip',
    country: to.startsWith('+240')?'GQ':to.startsWith('+221')?'SN':to.startsWith('+237')?'CM':'—',
    date: new Date().toISOString()
  };
  SMS_LOG.push(entry);
  return success(res, entry, 201);
});

// GET /v1/sms/stats
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, {
    total: SMS_LOG.length,
    delivered: SMS_LOG.filter(s=>s.status==='entregado').length,
    failed: SMS_LOG.filter(s=>s.status==='fallido').length,
    deliveryRate: SMS_LOG.length ? Math.round(SMS_LOG.filter(s=>s.status==='entregado').length/SMS_LOG.length*100) : 0
  });
});

module.exports = router;
