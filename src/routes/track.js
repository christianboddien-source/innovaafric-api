'use strict';

const router = require('express').Router();
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { success: ok, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');
const push = require('../services/push');

const ADMIN = ['admin', 'super_admin', 'business_developer', 'country_manager', 'regional_director', 'marketing_manager'];
const SITES = ['innovaafric', 'xendermoney', 'xendershop', 'xenderbigshop', 'xenderdelivery', 'app'];

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
}
function ipHash(req) {
  const ip = clientIp(req);
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip + (process.env.JWT_SECRET || 'ia')).digest('hex').slice(0, 16);
}
function countryOf(req) {
  return (req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['x-country'] || '').toUpperCase().slice(0, 2) || null;
}
function deviceOf(ua) {
  ua = (ua || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|android|iphone/.test(ua)) return 'mobile';
  return 'desktop';
}

// POST /v1/track/visit — registrar una visita (público, sin auth)
// body: { site, path, ref }
router.post('/visit', async (req, res) => {
  try {
    let { site, path: p, ref } = req.body || {};
    site = String(site || '').toLowerCase().trim();
    if (!SITES.includes(site)) site = 'app';
    await prisma.visit.create({
      data: {
        id: 'vis_' + crypto.randomUUID().slice(0, 12),
        site,
        path: (p ? String(p) : '/').slice(0, 300),
        country: countryOf(req),
        referer: (ref ? String(ref) : (req.headers.referer || '')).slice(0, 300) || null,
        device: deviceOf(req.headers['user-agent']),
        ipHash: ipHash(req)
      }
    });
    return ok(res, { tracked: true });
  } catch (e) { return error(res, e.message); }
});

// Construye el resumen (reutilizado por /stats, /summary y el push diario)
async function buildStats() {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start7 = new Date(startToday.getTime() - 6 * 86400000);
  const live5 = new Date(now.getTime() - 5 * 60000);

  const [todayRows, weekRows, liveRows, recent] = await Promise.all([
    prisma.visit.findMany({ where: { createdAt: { gte: startToday } }, select: { site: true, path: true, country: true, device: true, ipHash: true } }),
    prisma.visit.findMany({ where: { createdAt: { gte: start7 } }, select: { createdAt: true } }),
    prisma.visit.count({ where: { createdAt: { gte: live5 } } }),
    prisma.visit.findMany({ orderBy: { createdAt: 'desc' }, take: 25, select: { site: true, path: true, country: true, device: true, createdAt: true } })
  ]);

  const tally = (rows, key) => {
    const m = {};
    rows.forEach(r => { const k = r[key] || '—'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const uniques = new Set(todayRows.map(r => r.ipHash).filter(Boolean)).size;

  // visitas por día (últimos 7)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(startToday.getTime() - i * 86400000);
    days.push({ day: d.toISOString().slice(0, 10), count: 0 });
  }
  weekRows.forEach(r => {
    const k = new Date(r.createdAt).toISOString().slice(0, 10);
    const slot = days.find(x => x.day === k); if (slot) slot.count++;
  });

  return {
    live: liveRows,
    today: {
      total: todayRows.length,
      uniques,
      bySite: tally(todayRows, 'site'),
      byPage: tally(todayRows, 'path').slice(0, 10),
      byCountry: tally(todayRows, 'country').slice(0, 10),
      byDevice: tally(todayRows, 'device')
    },
    last7days: days,
    recent
  };
}

// GET /v1/track/stats — panel (admin)
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try { return ok(res, await buildStats()); }
  catch (e) { return error(res, e.message); }
});

// GET /v1/track/summary — resumen corto del día (admin / usado por el push)
router.get('/summary', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try { return ok(res, summaryText(await buildStats())); }
  catch (e) { return error(res, e.message); }
});

function summaryText(stats) {
  const t = stats.today;
  const topPage = t.byPage[0] ? `${t.byPage[0][0]} (${t.byPage[0][1]})` : '—';
  const topCountry = t.byCountry[0] && t.byCountry[0][0] !== '—' ? `${t.byCountry[0][0]} (${t.byCountry[0][1]})` : '—';
  const topSite = t.bySite[0] ? `${t.bySite[0][0]} (${t.bySite[0][1]})` : '—';
  return {
    total: t.total,
    uniques: t.uniques,
    topSite, topPage, topCountry,
    text: `Hoy: ${t.total} visitas (${t.uniques} visitantes). Top web: ${topSite}. Top país: ${topCountry}.`
  };
}

// Envía el resumen diario por push a los admin suscritos. Reutilizable por el scheduler.
async function sendDailySummary() {
  const stats = await buildStats();
  const s = summaryText(stats);
  const admins = await prisma.user.findMany({ where: { role: { in: ADMIN } }, select: { id: true } });
  const r = await push.sendToUsers(admins.map(a => a.id), {
    title: '📊 Resumen de visitas',
    body: s.text,
    url: '/visitas',
    tag: 'visit-summary'
  });
  return { ...s, push: r };
}

// POST /v1/track/send-summary — disparar el resumen ahora (admin, para probar)
router.post('/send-summary', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try { return ok(res, await sendDailySummary()); }
  catch (e) { return error(res, e.message); }
});

module.exports = router;
module.exports.buildStats = buildStats;
module.exports.summaryText = summaryText;
module.exports.sendDailySummary = sendDailySummary;
