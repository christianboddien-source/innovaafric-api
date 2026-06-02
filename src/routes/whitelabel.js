'use strict';
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','business_developer','country_manager','regional_director'];

let INSTANCES = [
  {id:'wl-001',name:'WaveApp Pro',partner:'Wave Sénégal',domain:'wave-pro.innovaafric.com',color:'#1a56db',users:1280,txToday:342,status:'activo'},
  {id:'wl-002',name:'JumiaPay',partner:'Jumia Camerún',domain:'jumiapay.innovaafric.com',color:'#f97316',users:890,txToday:121,status:'activo'},
  {id:'wl-003',name:'OrangeWallet',partner:'Orange Fintech',domain:'owallet.innovaafric.com',color:'#f59e0b',users:3400,txToday:891,status:'activo'}
];

// GET /v1/white-label/instances
router.get('/instances', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, INSTANCES);
});

// POST /v1/white-label/instances
router.post('/instances', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { name, partner, domain, color } = req.body;
  if (!name || !partner || !domain) return error(res, 'Faltan campos obligatorios', 400);
  const inst = {
    id: 'wl-'+uuidv4().slice(0,8),
    name, partner, domain, color: color||'#06b6d4',
    users: 0, txToday: 0, status: 'activo'
  };
  INSTANCES.push(inst);
  return success(res, inst, 201);
});

// PUT /v1/white-label/instances/:id/status
router.put('/instances/:id/status', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const inst = INSTANCES.find(i => i.id === req.params.id);
  if (!inst) return error(res, 'Instancia no encontrada', 404);
  inst.status = req.body.status || inst.status;
  return success(res, inst);
});

module.exports = router;
