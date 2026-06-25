'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// claves ya traducidas en app-i18n.js
const i18n = fs.readFileSync(path.join(ROOT, 'public/app-i18n.js'), 'utf8');
const known = new Set();
for (const m of i18n.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*\{\s*fr:/gm)) {
  known.add(m[1].replace(/\\'/g, "'"));
}

const files = ['comercio', 'rider', 'representante', 'circular'].map(f => 'src/views/' + f + '.html');
const SP = /[áéíóúñ¿¡]|\b(el|la|los|las|un|una|tu|tus|mi|mis|de|con|para|por|que|si|est[aá]s?|cliente|clientes|recarga|comisi|unidad|pedido|saldo|puntos|invita|gana|comprar|vender|entrega|disponible|gratis|cerrado|abierto|enviar|buscar|nuevo|nueva|aún|hoy|cobro|cobros|ganancia|nivel|medalla|red|tienda|producto|precio|agotado|nombre|categor)\b/i;
const cand = new Map();
function add(s) {
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || s.length < 3 || s.length > 90) return;
  if (/^[\d\s.,%€$+\-:/]+$/.test(s)) return;
  if (/[<>]/.test(s)) return;
  if (/https?:|^\/|function|var |const |let |px|rgba|undefined|null|querySelector|getElementById|innerHTML|className|style|addEventListener/.test(s)) return;
  if (!SP.test(s)) return;
  if (known.has(s)) return;
  cand.set(s, (cand.get(s) || 0) + 1);
}
for (const f of files) {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of h.matchAll(/>([^<>{}]*[A-Za-zÁÉÍÓÚáéíóúñ][^<>{}]*)</g)) add(m[1]);
  for (const m of h.matchAll(/'([^'\\\n]{3,90})'/g)) add(m[1]);
  for (const m of h.matchAll(/"([^"\\\n]{3,90})"/g)) add(m[1]);
  // placeholders
  for (const m of h.matchAll(/placeholder="([^"]{3,90})"/g)) add(m[1]);
}
const arr = [...cand.keys()].sort((a, b) => a.localeCompare(b, 'es'));
console.log('TOTAL candidatas no traducidas:', arr.length);
fs.writeFileSync(path.join(require('os').tmpdir(), 'untranslated.txt'), arr.join('\n'));
console.log(arr.join('\n'));
