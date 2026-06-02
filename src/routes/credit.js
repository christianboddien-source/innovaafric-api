'use strict';
const express = require('express');
const router  = express.Router();
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','loan_officer','finance_officer','risk_officer','compliance_officer','country_manager','regional_director'];

let SCORES = [
  {userId:'usr-001',user:'Amara Diallo',email:'amara@test.com',score:742,rating:'A',history:24,onTime:23,defaults:0,income:350000,txCount:142,lastUpdate:'2026-06-01',approved:true},
  {userId:'usr-002',user:'Carlos Martínez',email:'carlos@test.com',score:618,rating:'B',history:12,onTime:11,defaults:1,income:220000,txCount:87,lastUpdate:'2026-05-28',approved:true},
  {userId:'usr-003',user:'Fatou Seck',email:'fatou@test.com',score:531,rating:'C',history:6,onTime:5,defaults:1,income:180000,txCount:45,lastUpdate:'2026-05-15',approved:false},
  {userId:'usr-004',user:'Jean-Pierre N.',email:'jp@test.com',score:412,rating:'D',history:3,onTime:2,defaults:2,income:120000,txCount:21,lastUpdate:'2026-04-10',approved:false}
];

// GET /v1/credit/scores
router.get('/scores', requireAuth, requireRole(...ADMIN), async (req, res) => {
  return success(res, SCORES);
});

// GET /v1/credit/scores/:userId
router.get('/scores/:userId', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const s = SCORES.find(x => x.userId === req.params.userId || x.email === req.params.userId);
  if (!s) return error(res, 'Score no encontrado', 404);
  return success(res, s);
});

// POST /v1/credit/scores/:userId/recalculate
router.post('/scores/:userId/recalculate', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const s = SCORES.find(x => x.userId === req.params.userId);
  if (!s) return error(res, 'Usuario no encontrado', 404);
  s.score = Math.min(850, s.score + Math.floor(Math.random()*20));
  s.lastUpdate = new Date().toISOString().split('T')[0];
  return success(res, s);
});

module.exports = router;
