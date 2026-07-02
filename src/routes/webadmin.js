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
// ── Páginas personalizadas (creadas/duplicadas desde el panel) ──
// Se guardan en innovaafric-prod/webadmin-pages.json → GitHub = fuente de verdad.
let CUSTOM_PAGES = [];
const CUSTOM_REPO = 'innovaafric-prod', CUSTOM_BRANCH = 'main', CUSTOM_FILE = 'webadmin-pages.json';

async function ghGetJson(repo, branch, path) {
  const h = ghHeaders(); if (!h) return null;
  const r = await fetch(`${GH_API}/repos/${GH_OWNER}/${repo}/contents/${path}?ref=${branch}`, { headers: h });
  if (r.status === 404) return { sha: null, data: null };
  if (!r.ok) return null;
  const j = await r.json();
  let data = null;
  try { data = JSON.parse(Buffer.from(j.content || '', 'base64').toString('utf8')); } catch (_) {}
  return { sha: j.sha, data };
}

async function loadCustomPages() {
  try {
    const g = await ghGetJson(CUSTOM_REPO, CUSTOM_BRANCH, CUSTOM_FILE);
    if (g && Array.isArray(g.data)) {
      CUSTOM_PAGES = g.data.filter(p => p && p.id && p.path).map(p => ({
        id: p.id, label: p.label || p.path, repo: CUSTOM_REPO, branch: CUSTOM_BRANCH, path: p.path, custom: true
      }));
    }
  } catch (_) {}
  return CUSTOM_PAGES;
}
loadCustomPages(); // best-effort al arrancar

const findPage = (id) => PAGES.concat(CUSTOM_PAGES).find(p => p.id === id);

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

// GET /v1/webadmin/pages — lista de páginas editables (sistema + personalizadas)
router.get('/pages', ...guard, async (req, res) => {
  await loadCustomPages(); // refrescar por si otro admin creó/duplicó páginas
  const all = PAGES.concat(CUSTOM_PAGES);
  return success(res, {
    tokenConfigured: !!process.env.GITHUB_TOKEN,
    pages: all.map(p => ({ id: p.id, label: p.label, repo: p.repo, path: p.path, url: pageUrl(p), custom: !!p.custom }))
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

// GET /v1/webadmin/history?id=... — últimas versiones (commits) de una página
router.get('/history', ...guard, async (req, res) => {
  try {
    const p = findPage(req.query.id);
    if (!p) return error(res, 'Página no encontrada', 404);
    const h = ghHeaders();
    if (!h) return error(res, 'Falta configurar GITHUB_TOKEN en Railway.', 503);
    const ghPath = encodeURIComponent(p.path).replace(/%2F/g, '/');
    const r = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/commits?path=${ghPath}&sha=${p.branch}&per_page=20`, { headers: h });
    if (!r.ok) return error(res, 'GitHub ' + r.status + ': no se pudo leer el historial', 502);
    const commits = await r.json();
    const list = (Array.isArray(commits) ? commits : []).map(c => ({
      sha: c.sha,
      message: (c.commit && c.commit.message || '').split('\n')[0],
      date: c.commit && c.commit.author && c.commit.author.date,
      author: c.commit && c.commit.author && c.commit.author.name
    }));
    return success(res, { count: list.length, versions: list });
  } catch (e) { return error(res, 'Error al leer el historial: ' + (e.message || e), 500); }
});

// POST /v1/webadmin/restore — restaura la página a una versión (commit) concreta
router.post('/restore', ...guard, async (req, res) => {
  try {
    const p = findPage(req.body && req.body.id);
    const sha = req.body && req.body.sha;
    if (!p) return error(res, 'Página no encontrada', 404);
    if (!sha) return error(res, 'Falta la versión a restaurar', 400);
    const h = ghHeaders();
    if (!h) return error(res, 'Falta configurar GITHUB_TOKEN en Railway.', 503);
    const ghPath = encodeURIComponent(p.path).replace(/%2F/g, '/');
    const fr = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${ghPath}?ref=${sha}`, { headers: h });
    if (!fr.ok) return error(res, 'GitHub ' + fr.status + ': no se pudo leer esa versión', 502);
    const fj = await fr.json();
    const cur = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${ghPath}?ref=${p.branch}`, { headers: h });
    const curj = await cur.json();
    const body = {
      message: 'web-admin: restaurar ' + p.path + ' a una versión anterior\n\nvía panel Webs del dashboard',
      content: fj.content, branch: p.branch, sha: curj.sha
    };
    const pr = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${ghPath}`, {
      method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const pj = await pr.json().catch(() => ({}));
    if (!pr.ok) return error(res, 'GitHub ' + pr.status + ': ' + (pj.message || 'no se pudo restaurar'), 502);
    return success(res, { restored: true, newSha: pj.content && pj.content.sha, content: Buffer.from(fj.content || '', 'base64').toString('utf8') });
  } catch (e) { return error(res, 'Error al restaurar: ' + (e.message || e), 500); }
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

// POST /v1/webadmin/page/create — crear una página nueva o DUPLICAR una existente
// body: { path:'promo/index.html', label?:'Promo', fromId?:'lp-money' }
router.post('/page/create', ...guard, async (req, res) => {
  try {
    const h = ghHeaders();
    if (!h) return error(res, 'Falta configurar GITHUB_TOKEN en Railway.', 503);
    const { fromId, label } = req.body || {};
    let path = String((req.body && req.body.path) || '').trim().replace(/^\/+/, '');
    if (!path) return error(res, 'Indica la ruta de la nueva página (ej: promo/index.html).', 400);
    if (!path.toLowerCase().endsWith('.html')) path += path.endsWith('/') ? 'index.html' : '/index.html';
    if (path.includes('..') || !/^[a-zA-Z0-9/_-]+\.html$/.test(path))
      return error(res, 'Ruta no válida. Usa solo letras, números, / y - y termina en .html', 400);
    if (PAGES.some(p => p.repo === CUSTOM_REPO && p.path === path))
      return error(res, 'Esa ruta ya corresponde a una página del sistema.', 409);

    // Contenido: duplicar la página origen o una plantilla mínima de marca
    let content;
    if (fromId) {
      const src = findPage(fromId);
      if (!src) return error(res, 'Página origen no encontrada', 404);
      const sr = await fetch(`${GH_API}/repos/${GH_OWNER}/${src.repo}/contents/${encodeURIComponent(src.path).replace(/%2F/g,'/')}?ref=${src.branch}`, { headers: h });
      if (!sr.ok) return error(res, 'No se pudo leer la página origen', 502);
      const sj = await sr.json();
      content = Buffer.from(sj.content || '', 'base64').toString('utf8');
    } else {
      const title = String(label || 'Nueva página').replace(/[<>]/g, '').slice(0, 80);
      content = '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
        + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        + '<title>' + title + ' · InnovaAFRIC</title>\n</head>\n'
        + '<body style="font-family:Arial,sans-serif;margin:0;padding:48px;color:#0a1628">\n'
        + '  <h1 style="color:#0d9bc4;margin:0">' + title + '</h1>\n'
        + '  <div style="font-size:11px;letter-spacing:2px;color:#555">WE SIMPLIFY LIFE</div>\n'
        + '  <p style="margin-top:24px">Edita esta página desde el panel <b>Webs</b> del dashboard.</p>\n'
        + '</body>\n</html>\n';
    }

    // ¿ya existe el archivo en el repo?
    const exists = await fetch(`${GH_API}/repos/${GH_OWNER}/${CUSTOM_REPO}/contents/${path}?ref=${CUSTOM_BRANCH}`, { headers: h });
    if (exists.ok) return error(res, 'Ya existe un archivo en esa ruta. Elige otra.', 409);

    // Crear el archivo (sin sha = archivo nuevo)
    const put = await fetch(`${GH_API}/repos/${GH_OWNER}/${CUSTOM_REPO}/contents/${path}`, {
      method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'web-admin: crear página ' + path + '\n\nvía panel Webs del dashboard', content: Buffer.from(content, 'utf8').toString('base64'), branch: CUSTOM_BRANCH })
    });
    const pj = await put.json().catch(() => ({}));
    if (!put.ok) return error(res, 'GitHub ' + put.status + ': ' + (pj.message || 'no se pudo crear'), 502);

    // Registrar en webadmin-pages.json
    const id = 'cst-' + path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const g = await ghGetJson(CUSTOM_REPO, CUSTOM_BRANCH, CUSTOM_FILE);
    const list = (g && Array.isArray(g.data)) ? g.data : [];
    if (!list.some(x => x.path === path)) list.push({ id, label: label || path, path });
    const jbody = {
      message: 'web-admin: registrar página ' + path,
      content: Buffer.from(JSON.stringify(list, null, 2), 'utf8').toString('base64'),
      branch: CUSTOM_BRANCH
    };
    if (g && g.sha) jbody.sha = g.sha;
    await fetch(`${GH_API}/repos/${GH_OWNER}/${CUSTOM_REPO}/contents/${CUSTOM_FILE}`, {
      method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(jbody)
    });
    await loadCustomPages();
    return success(res, { created: true, page: { id, label: label || path, repo: CUSTOM_REPO, path, url: pageUrl({ repo: CUSTOM_REPO, path }), custom: true } });
  } catch (e) { return error(res, 'Error al crear la página: ' + (e.message || e), 500); }
});

// POST /v1/webadmin/page/delete — eliminar una página (SOLO las creadas desde el panel)
router.post('/page/delete', ...guard, async (req, res) => {
  try {
    const id = req.body && req.body.id;
    const p = CUSTOM_PAGES.find(x => x.id === id);
    if (!p) return error(res, 'Solo se pueden eliminar páginas creadas desde el panel.', 400);
    const h = ghHeaders();
    if (!h) return error(res, 'Falta configurar GITHUB_TOKEN en Railway.', 503);
    const ghPath = encodeURIComponent(p.path).replace(/%2F/g, '/');
    // borrar el archivo si existe
    const cur = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${ghPath}?ref=${p.branch}`, { headers: h });
    if (cur.ok) {
      const cj = await cur.json();
      await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${ghPath}`, {
        method: 'DELETE', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'web-admin: eliminar página ' + p.path, sha: cj.sha, branch: p.branch })
      });
    }
    // quitar del registro
    const g = await ghGetJson(CUSTOM_REPO, CUSTOM_BRANCH, CUSTOM_FILE);
    if (g && Array.isArray(g.data) && g.sha) {
      const list = g.data.filter(x => x.id !== id && x.path !== p.path);
      await fetch(`${GH_API}/repos/${GH_OWNER}/${CUSTOM_REPO}/contents/${CUSTOM_FILE}`, {
        method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'web-admin: quitar registro ' + p.path, content: Buffer.from(JSON.stringify(list, null, 2), 'utf8').toString('base64'), branch: CUSTOM_BRANCH, sha: g.sha })
      });
    }
    await loadCustomPages();
    return success(res, { deleted: true });
  } catch (e) { return error(res, 'Error al eliminar: ' + (e.message || e), 500); }
});

// GET /v1/webadmin/backup — copia de seguridad del contenido actual de TODAS las páginas
router.get('/backup', ...guard, async (req, res) => {
  try {
    const h = ghHeaders();
    if (!h) return error(res, 'Falta configurar GITHUB_TOKEN en Railway.', 503);
    await loadCustomPages();
    const all = PAGES.concat(CUSTOM_PAGES);
    const out = [];
    for (const p of all) {
      try {
        const r = await fetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/contents/${encodeURIComponent(p.path).replace(/%2F/g,'/')}?ref=${p.branch}`, { headers: h });
        if (!r.ok) { out.push({ id: p.id, label: p.label, repo: p.repo, path: p.path, error: 'GitHub ' + r.status }); continue; }
        const j = await r.json();
        out.push({ id: p.id, label: p.label, repo: p.repo, branch: p.branch, path: p.path, content: Buffer.from(j.content || '', 'base64').toString('utf8') });
      } catch (e) { out.push({ id: p.id, path: p.path, error: e.message }); }
    }
    return success(res, { generatedAt: new Date().toISOString(), count: out.length, pages: out });
  } catch (e) { return error(res, 'Error al generar la copia: ' + (e.message || e), 500); }
});

module.exports = router;
