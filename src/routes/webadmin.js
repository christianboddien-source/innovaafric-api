'use strict';

// ─────────────────────────────────────────────────────────────
// Web-Admin — editar y publicar las páginas del ecosistema.
// El backend hace de intermediario SEGURO con la API de GitHub:
// el token vive solo aquí (process.env.GITHUB_TOKEN), nunca en el navegador.
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const GH_OWNER = 'christianboddien-source';
const GH_API   = 'https://api.github.com';
const ADMIN_ROLES = ['admin', 'super_admin', 'country_manager', 'regional_director'];

// Páginas editables (repo, rama, ruta, etiqueta amigable)
const PAGES = [
  { id:'app',          label:'App principal (cliente)', repo:'innovaafric-prod', branch:'main',   path:'index.html' },
  { id:'lp-money',     label:'Landing · XenderMoney',   repo:'innovaafric-prod', branch:'main',   path:'xendermoney/index.html' },
  { id:'lp-shop',      label:'Landing · XenderShop',    repo:'innovaafric-prod', branch:'main',   path:'xendershop/index.html' },
  { id:'lp-big',       label:'Landing · BigShop',       repo:'innovaafric-prod', branch:'main',   path:'xenderbigshop/index.html' },
  { id:'lp-deliv',     label:'Landing · Delivery',      repo:'innovaafric-prod', branch:'main',   path:'xenderdelivery/index.html' },
  { id:'lp-inn',       label:'Landing · InnovaAFRIC',   repo:'innovaafric-prod', branch:'main',   path:'innovaafric/index.html' },
  { id:'app-comercio', label:'App · Comercio',          repo:'innovaafric-api',  branch:'master', path:'src/views/comercio.html' },
  { id:'app-circular', label:'App · Circular',          repo:'innovaafric-api',  branch:'master', path:'src/views/circular.html' },
  { id:'app-rep',      label:'App · Representante',      repo:'innovaafric-api',  branch:'master', path:'src/views/representante.html' },
  { id:'app-rider',    label:'App · Rider',             repo:'innovaafric-api',  branch:'master', path:'src/views/rider.html' }
];

function ghHeaders() {
  const t = process.env.GITHUB_TOKEN;
  if (!t) return null;
  return {
    'Authorization': 'Bearer ' + t.trim(),
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'innovaafric-webadmin'
  };
}
const findPage = (id) => PAGES.find(p => p.id === id);

// GET /v1/webadmin/pages — lista de páginas editables
router.get('/pages', requireAuth, requireRole(...ADMIN_ROLES), (req, res) => {
  return success(res, {
    tokenConfigured: !!process.env.GITHUB_TOKEN,
    pages: PAGES.map(p => ({ id: p.id, label: p.label, repo: p.repo, path: p.path }))
  });
});

// GET /v1/webadmin/file?id=... — lee el HTML actual de una página
router.get('/file', requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const p = findPage(req.query.id);
    if (!p) return error(res, 'Página no encontrada', 404);
    const h = ghHeaders();
    if (!h) return error(res, 'Falta configurar GITHUB_TOKEN en Railway para poder editar/publicar.', 503);
    const r = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${encodeURIComponent(p.path).replace(/%2F/g,'/')}?ref=${p.branch}`, { headers: h });
    if (!r.ok) return error(res, 'GitHub ' + r.status + ': ' + (await r.text()).slice(0, 150), r.status === 404 ? 404 : 502);
    const j = await r.json();
    const content = Buffer.from(j.content || '', 'base64').toString('utf8');
    return success(res, { id: p.id, label: p.label, repo: p.repo, path: p.path, sha: j.sha, size: content.length, content });
  } catch (e) { return error(res, 'Error al leer: ' + (e.message || e), 500); }
});

// PUT /v1/webadmin/file — guarda (commit) los cambios en GitHub
router.put('/file', requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { id, content, sha, message } = req.body || {};
    const p = findPage(id);
    if (!p) return error(res, 'Página no encontrada', 404);
    if (typeof content !== 'string' || !content.length) return error(res, 'Contenido vacío o inválido', 400);
    const h = ghHeaders();
    if (!h) return error(res, 'Falta configurar GITHUB_TOKEN en Railway para poder publicar.', 503);
    const body = {
      message: (message || 'web-admin: editar ' + p.path) + '\n\nvía panel Webs del dashboard',
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: p.branch
    };
    if (sha) body.sha = sha; // sha del archivo actual — evita sobrescribir cambios de otros
    const r = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${encodeURIComponent(p.path).replace(/%2F/g,'/')}`, {
      method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return error(res, 'GitHub ' + r.status + ': ' + (j.message || 'no se pudo publicar'), r.status === 409 ? 409 : 502);
    return success(res, { committed: true, newSha: j.content && j.content.sha, commit: j.commit && j.commit.sha });
  } catch (e) { return error(res, 'Error al publicar: ' + (e.message || e), 500); }
});

module.exports = router;
