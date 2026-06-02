'use strict';
const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const KYC_ROLES = ['admin','super_admin','kyc_officer','compliance_officer','country_manager','regional_director'];

// POST /v1/kyc/:id/approve
router.post('/:id/approve', requireAuth, requireRole(...KYC_ROLES), async (req, res) => {
  try {
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data: { kycStatus: 'verified' }
    });
    return success(res, { id: u.id, kycStatus: u.kycStatus });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/kyc/:id/reject
router.post('/:id/reject', requireAuth, requireRole(...KYC_ROLES), async (req, res) => {
  try {
    const { reason } = req.body;
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data: { kycStatus: 'rejected', kycDocument: reason || 'Rechazado por KYC officer' }
    });
    return success(res, { id: u.id, kycStatus: u.kycStatus });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/kyc/pending
router.get('/pending', requireAuth, requireRole(...KYC_ROLES), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { kycStatus: { in: ['under_review','pending'] } },
      select: { id:true, name:true, email:true, country:true, kycStatus:true, kycDocument:true, createdAt:true },
      orderBy: { createdAt: 'asc' }
    });
    return success(res, users);
  } catch (e) { return error(res, e.message); }
});

// GET /v1/kyc/stats
router.get('/stats', requireAuth, requireRole(...KYC_ROLES), async (req, res) => {
  try {
    const [pending, verified, rejected] = await Promise.all([
      prisma.user.count({ where: { kycStatus: { in: ['pending','under_review'] } } }),
      prisma.user.count({ where: { kycStatus: 'verified' } }),
      prisma.user.count({ where: { kycStatus: 'rejected' } })
    ]);
    return success(res, { pending, verified, rejected, total: pending+verified+rejected });
  } catch (e) { return error(res, e.message); }
});

module.exports = router;
