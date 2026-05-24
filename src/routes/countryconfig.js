'use strict';

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ok, error } = require('../helpers/response');

const router = express.Router();
const prisma  = new PrismaClient();
const requireAdmin = requireRole('admin');

const COUNTRIES = [
  {id:'CM',name:'Camerún'},{id:'SN',name:'Senegal'},{id:'CI',name:'Costa de Marfil'},
  {id:'GH',name:'Ghana'},{id:'NG',name:'Nigeria'},{id:'KE',name:'Kenia'},
  {id:'ZA',name:'Sudáfrica'},{id:'MA',name:'Marruecos'},{id:'ET',name:'Etiopía'},
  {id:'TZ',name:'Tanzania'},{id:'UG',name:'Uganda'},{id:'RW',name:'Ruanda'},
  {id:'GQ',name:'Guinea Ecuatorial'},{id:'GA',name:'Gabón'},{id:'CG',name:'Congo'},
  {id:'ML',name:'Mali'},{id:'BF',name:'Burkina Faso'},{id:'TG',name:'Togo'},
  {id:'BJ',name:'Benín'},{id:'NE',name:'Níger'},{id:'GN',name:'Guinea'},
  {id:'CD',name:'RD Congo'},{id:'AO',name:'Angola'},{id:'MZ',name:'Mozambique'},
  {id:'ZM',name:'Zambia'},{id:'ES',name:'España'},{id:'FR',name:'Francia'}
];

/* GET /countryconfig */
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const configs = await prisma.countryConfig.findMany({ orderBy: { country: 'asc' } });
    const configMap = Object.fromEntries(configs.map(c => [c.country, c]));
    const result = COUNTRIES.map(c => configMap[c.id] || {
      id: c.id, country: c.id, name: c.name,
      active: true, p2pEnabled: true, loansEnabled: true,
      groceryEnabled: true, cardsEnabled: true,
      repName: null, repEmail: null, repPhone: null
    });
    ok(res, { configs: result, total: result.length });
  } catch (e) { error(res, e.message); }
});

/* PUT /countryconfig/:country */
router.put('/:country', requireAuth, requireAdmin, async (req, res) => {
  try {
    const country = req.params.country.toUpperCase();
    const meta = COUNTRIES.find(c => c.id === country);
    if (!meta) return error(res, 'País no reconocido', 400);
    const { active, p2pEnabled, loansEnabled, groceryEnabled, cardsEnabled, repName, repEmail, repPhone } = req.body;
    const config = await prisma.countryConfig.upsert({
      where:  { country },
      create: {
        id: country, country, name: meta.name,
        active:         active         !== undefined ? active         : true,
        p2pEnabled:     p2pEnabled     !== undefined ? p2pEnabled     : true,
        loansEnabled:   loansEnabled   !== undefined ? loansEnabled   : true,
        groceryEnabled: groceryEnabled !== undefined ? groceryEnabled : true,
        cardsEnabled:   cardsEnabled   !== undefined ? cardsEnabled   : true,
        repName: repName || null, repEmail: repEmail || null, repPhone: repPhone || null
      },
      update: {
        ...(active         !== undefined && { active }),
        ...(p2pEnabled     !== undefined && { p2pEnabled }),
        ...(loansEnabled   !== undefined && { loansEnabled }),
        ...(groceryEnabled !== undefined && { groceryEnabled }),
        ...(cardsEnabled   !== undefined && { cardsEnabled }),
        ...(repName  !== undefined && { repName:  repName  || null }),
        ...(repEmail !== undefined && { repEmail: repEmail || null }),
        ...(repPhone !== undefined && { repPhone: repPhone || null }),
        updatedAt: new Date()
      }
    });
    ok(res, config);
  } catch (e) { error(res, e.message); }
});

module.exports = router;
