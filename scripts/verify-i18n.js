'use strict';
// Comprueba qué claves del diccionario de app-i18n.js NO aparecen literalmente
// en el HTML/JS de las 4 apps (esas claves nunca casarán y sobran o están mal).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const i18n = fs.readFileSync(path.join(ROOT, 'public/app-i18n.js'), 'utf8');
const keys = [];
for (const m of i18n.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*\{\s*fr:/gm)) keys.push(m[1].replace(/\\'/g, "'"));
const blobs = ['comercio', 'rider', 'representante', 'circular']
  .map(f => fs.readFileSync(path.join(ROOT, 'src/views/' + f + '.html'), 'utf8')).join('\n');
const missing = keys.filter(k => !blobs.includes(k));
console.log('claves totales:', keys.length, '| no encontradas literalmente:', missing.length);
console.log(missing.join('\n'));
