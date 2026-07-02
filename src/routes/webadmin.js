'use strict';

// ─────────────────────────────────────────────────────────────
// Web-Admin — editar y publicar las páginas del ecosistema.
// El backend hace de intermediario SEGURO con la API de GitHub:
// el token vive solo aquí (process.env.GITHUB_TOKEN), nunca en el navegador.
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { success, error } = require('../helpers/response');
const { requireAuth, requireLevel } = require('../middleware/auth');

const GH_OWNER = 'christianboddien-source';
const GH_API   = 'https://api.github.com';
// Mismo guard que el resto de endpoints admin del dashboard (nivel 2 = admin+)
const guard = [requireAuth, requireLevel(2)];

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

// URL pública/en vivo de cada página (para la vista previa embebida)
function pageUrl(p) {
  if (p.repo === 'innovaafric-prod') {
    const dir = p.path.replace(/index\.html$/, '');
    return 'https://christianboddien-source.github.io/innovaafric-prod/' + dir;
  }
  const map = {
    'src/views/comercio.html': 'comercio', 'src/views/circular.html': 'circular',
    'src/views/representante.html': 'representante', 'src/views/rider.html': 'rider'
  };
  return 'https://innovaafric-api-production.up.railway.app/' + (map[p.path] || '');
}

// GET /v1/webadmin/pages — lista de páginas editables
router.get('/pages', ...guard, (req, res) => {
  return success(res, {
    tokenConfigured: !!process.env.GITHUB_TOKEN,
    pages: PAGES.map(p => ({ id: p.id, label: p.label, repo: p.repo, path: p.path, url: pageUrl(p) }))
  });
});

// GET /v1/webadmin/file?id=... — lee el HTML actual de una página
router.get('/file', ...guard, async (req, res) => {
  try {
    const p = findPage(req.query.id);
    if (!p) return error(res, 'Página no encontrada', 404);
    const h = ghHeaders();
    if (!h) return error(res, 'Falta configurar GITHUB_TOKEN en Railway para poder editar/publicar.', 503);
    const r = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${encodeURIComponent(p.path).replace(/%2F/g,'/')}?ref=${p.branch}`, { headers: h });
    if (!r.ok) return error(res, 'GitHub ' + r.status + ': ' + (await r.text()).slice(0, 150), r.status === 404 ? 404 : 502);
    const j = await r.json();
    const content = Buffer.from(j.content || '', 'base64').toString('utf8');
    return success(res, { id: p.id, label: p.label, repo: p.repo, path: p.path, url: pageUrl(p), sha: j.sha, size: content.length, content });
  } catch (e) { return error(res, 'Error al leer: ' + (e.message || e), 500); }
});

// PUT /v1/webadmin/file — guarda (commit) los cambios en GitHub
router.put('/file', ...guard, async (req, res) => {
  try {
    const { id, content, sha, message } = req.body || {};
    const p = findPage(id);
    if (!p) return error(res, 'Página no encontrada', 404);
    if (typeof content !== 'string' || !content.length) return error(res, 'Contenido vacío o inválido', 400);
    const h = ghHeaders();
    if (!h) return error(res, 'Falta configurar GITHUB_TOKEN en Railway para poder publicar.', 503);
    const clean = content.replace(/^﻿+/, ''); // quitar BOM(s) sobrantes al inicio
    const body = {
      message: (message || 'web-admin: editar ' + p.path) + '\n\nvía panel Webs del dashboard',
      content: Buffer.from(clean, 'utf8').toString('base64'),
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

// POST /v1/webadmin/revert — vuelve la página a su versión ANTERIOR (un clic = deshacer)
router.post('/revert', ...guard, async (req, res) => {
  try {
    const p = findPage(req.body && req.body.id);
    if (!p) return error(res, 'Página no encontrada', 404);
    const h = ghHeaders();
    if (!h) return error(res, 'Falta configurar GITHUB_TOKEN en Railway.', 503);
    const ghPath = encodeURIComponent(p.path).replace(/%2F/g, '/');
    // 1) últimos 2 commits que tocaron el archivo
    const cr = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/commits?path=${ghPath}&sha=${p.branch}&per_page=2`, { headers: h });
    if (!cr.ok) return error(res, 'GitHub ' + cr.status + ': no se pudo leer el historial', 502);
    const commits = await cr.json();
    if (!Array.isArray(commits) || commits.length < 2) return error(res, 'No hay una versión anterior para revertir.', 400);
    // 2) contenido del commit anterior (ya viene en base64)
    const fr = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${ghPath}?ref=${commits[1].sha}`, { headers: h });
    if (!fr.ok) return error(res, 'GitHub ' + fr.status + ': no se pudo leer la versión anterior', 502);
    const fj = await fr.json();
    // 3) sha ACTUAL (para sobrescribir)
    const cur = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${ghPath}?ref=${p.branch}`, { headers: h });
    const curj = await cur.json();
    // 4) commit de reversión
    const body = {
      message: 'web-admin: revertir ' + p.path + ' a la versión anterior\n\nvía panel Webs del dashboard',
      content: fj.content, branch: p.branch, sha: curj.sha
    };
    const pr = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${ghPath}`, {
      method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const pj = await pr.json().catch(() => ({}));
    if (!pr.ok) return error(res, 'GitHub ' + pr.status + ': ' + (pj.message || 'no se pudo revertir'), 502);
    // devolver el contenido restaurado para refrescar el editor
    const restored = Buffer.from(fj.content || '', 'base64').toString('utf8');
    return success(res, { reverted: true, newSha: pj.content && pj.content.sha, content: restored });
  } catch (e) { return error(res, 'Error al revertir: ' + (e.message || e), 500); }
});

// POST /v1/webadmin/image — sube una imagen al repo (assets/uploads) y devuelve su URL pública
router.post('/image', ...guard, async (req, res) => {
  try {
    const { filename, dataBase64 } = req.body || {};
    if (!dataBase64) return error(res, 'Imagen requerida', 400);
    const h = ghHeaders();
    if (!h) return error(res, 'Falta configurar GITHUB_TOKEN en Railway.', 503);
    const safe = String(filename || 'img').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-40);
    const ghPath = 'assets/uploads/' + Date.now() + '-' + safe;
    const content = String(dataBase64).replace(/^data:[^;]+;base64,/, ''); // quitar prefijo data URI
    const body = { message: 'web-admin: subir imagen ' + safe, content, branch: 'main' };
    const r = await fetch(`${GH_API}/repos/${GH_OWNER}/innovaafric-prod/contents/${ghPath}`, {
      method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return error(res, 'GitHub ' + r.status + ': ' + (j.message || 'no se pudo subir la imagen'), 502);
    return success(res, { url: 'https://christianboddien-source.github.io/innovaafric-prod/' + ghPath, path: ghPath });
  } catch (e) { return error(res, 'Error al subir la imagen: ' + (e.message || e), 500); }
});

module.exports = router;
