'use strict';

// ─────────────────────────────────────────────────────────────
// Código IA de usuario — DEBE coincidir con el del dashboard.
//
// Los ids de usuario no son uniformes: unos son UUID limpios
// ("863ecc83-…") y otros llevan prefijo ("usr_eb1686…"). El dashboard
// muestra el código quitando ese prefijo de letras (usr_/cli_/user_…),
// así que aquí hacemos lo mismo para que el código sea idéntico en
// ambos sitios y la búsqueda por código funcione.
//
// Ejemplos:
//   "usr_eb1686aa…"        → IA-EB1686
//   "863ecc83-1234-…"      → IA-863EC8
// ─────────────────────────────────────────────────────────────

// Normaliza un id a su parte significativa (sin prefijo de letras ni guiones)
function normId(id) {
  return String(id || '').replace(/^[a-z]+_/i, '').replace(/-/g, '');
}

// Código IA visible (IA-XXXXXX)
function iaCode(id) {
  return 'IA-' + normId(id).toUpperCase().substring(0, 6);
}

// Dado lo que escribe el usuario, devuelve cláusulas Prisma para el campo id
// que casen un código IA (o null si no parece un código). Cubre tanto ids UUID
// como ids con prefijo ("usr_…").
function iaIdClauses(q) {
  const hex = String(q || '').toUpperCase().replace(/^IA-?/, '');
  if (!/^[0-9A-F]{6}$/.test(hex)) return null;
  const h = hex.toLowerCase();
  return [
    { id: { startsWith: h } },        // UUID: el código va al principio
    { id: { contains: '_' + h } }     // prefijado: "usr_eb1686…"
  ];
}

module.exports = { normId, iaCode, iaIdClauses };
