'use strict';
const router = require('express').Router();
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');
const { success: ok, error } = require('../helpers/response');

// Presencia en memoria: userId → { lat, lng, role, name, country, city, ts }
// Tiempo real mientras la app está abierta; se vacía al reiniciar el servidor.
const PRESENCE = new Map();
const TTL_MS = 10 * 60 * 1000; // visible hasta 10 minutos después del último ping

const ADMIN_ROLES = ['admin', 'super_admin', 'country_manager', 'regional_director',
                     'support_agent', 'support_supervisor', 'finance_officer'];
const uid = (req) => req.user.sub || req.user.id;

// El rol de mapa se resuelve por las tablas, no solo por el rol JWT
async function resolveRole(userId, jwtRole) {
  if (ADMIN_ROLES.includes(jwtRole)) return 'innovaafric';
  if (jwtRole === 'circular_autorizada') return 'circular';
  if (jwtRole === 'supplier' || jwtRole === 'comercio') return 'comercio';
  const [rep, rider] = await Promise.all([
    prisma.representative.findUnique({ where: { userId } }).catch(() => null),
    prisma.rider.findUnique({ where: { userId } }).catch(() => null)
  ]);
  if (rep) return 'representante';
  if (rider) return 'rider';
  return 'cliente';
}

// Quién puede ver a quién en el mapa
const VISIBLE = {
  circular:      ['circular', 'representante', 'innovaafric', 'comercio'],
  representante: ['circular', 'rider', 'representante', 'innovaafric', 'comercio'],
  rider:         ['rider', 'representante', 'innovaafric', 'comercio'],
  comercio:      ['rider', 'circular', 'representante', 'innovaafric'], // el comercio ve riders cercanos para recoger
  innovaafric:   ['circular', 'rider', 'representante', 'innovaafric', 'cliente', 'comercio'],
  cliente:       ['circular', 'comercio', 'rider'] // circulares (recarga), comercios y su rider
};

// POST /v1/locations/ping — la app envía su posición GPS periódicamente
router.post('/ping', requireAuth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return error(res, 'lat y lng numéricos requeridos', 400);
    }
    const me = uid(req);
    let entry = PRESENCE.get(me);
    if (!entry) {
      const user = await prisma.user.findUnique({
        where: { id: me }, select: { name: true, country: true, city: true }
      });
      const role = await resolveRole(me, req.user.role);
      entry = { role, name: user?.name || '—', country: user?.country || '', city: user?.city || '' };
    }
    entry.lat = lat; entry.lng = lng; entry.ts = Date.now();
    PRESENCE.set(me, entry);
    return ok(res, { message: 'posición actualizada', role: entry.role, online: PRESENCE.size });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/locations/nearby — quién está activo en mi país (según mi rol)
router.get('/nearby', requireAuth, async (req, res) => {
  try {
    const me = uid(req);
    const myEntry = PRESENCE.get(me);
    const user = await prisma.user.findUnique({ where: { id: me }, select: { country: true } });
    const myCountry = String(req.query.country || user?.country || '').toLowerCase();
    const myRole = myEntry?.role || await resolveRole(me, req.user.role);
    const allowed = VISIBLE[myRole] || [];

    const now = Date.now();
    const people = [];
    for (const [id, p] of PRESENCE.entries()) {
      if (now - p.ts > TTL_MS) { PRESENCE.delete(id); continue; }
      if (id === me) continue;
      if (!allowed.includes(p.role)) continue;
      if (myCountry && p.country && p.country.toLowerCase() !== myCountry) continue;
      people.push({ id, role: p.role, name: p.name, city: p.city, lat: p.lat, lng: p.lng, lastSeen: p.ts });
    }
    return ok(res, {
      count: people.length,
      people,
      you: myEntry ? { lat: myEntry.lat, lng: myEntry.lng, role: myRole } : { role: myRole }
    });
  } catch (e) { return error(res, e.message); }
});

module.exports = router;
// Posición en vivo de un usuario concreto (para el tracking del pedido del cliente)
module.exports.getPresence = (userId) => {
  const p = PRESENCE.get(userId);
  if (!p || Date.now() - p.ts > TTL_MS) return null;
  return { lat: p.lat, lng: p.lng, lastSeen: p.ts };
};
