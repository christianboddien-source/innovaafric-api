'use strict';
// ═══════════════════════════════════════════════════════════════════
// FIX v1 — Sincronización de wallets Railway → Supabase
// ═══════════════════════════════════════════════════════════════════
// PROBLEMA DETECTADO: Railway (Prisma/Postgres propia) y Supabase son dos bases
// de datos separadas. El único puente que existía era un webhook que solo se
// dispara UNA VEZ, al crear el usuario (INSERT). Después de ese instante, cada
// base vive por su cuenta — ninguna operación de dinero hecha desde Railway
// (recargas de Circulares, pagos QR de Comercio, comisiones de Riders/
// Representantes, envíos/retiros de money.js...) llegaba nunca a Supabase.
// Resultado real comprobado: un cliente recargado por una Circular Autorizada
// no veía el dinero en XenderMoney, porque XenderMoney lee de Supabase.
//
// SOLUCIÓN: después de cada operación que cambia el balance de un wallet en
// Railway, llamar a syncWalletToSupabase(userId, walletActualizado) para
// reflejar el mismo balance en la tabla `wallets` de Supabase.
//
// DISEÑO DELIBERADO — "best effort", nunca bloqueante:
// - Si Supabase no responde o falla, la operación en Railway YA se completó y
//   confirmó al usuario — no la revertimos por un fallo de sincronización.
//   Revertir dinero ya confirmado sería peor que quedar temporalmente
//   desincronizado.
// - En su lugar, registramos el fallo con detalle en consola (Railway logs)
//   para poder reconciliar manualmente si pasa.
// - Usa PATCH (no upsert/insert): el wallet en Supabase debería existir ya
//   desde el registro del usuario. Si no existe, lo registramos como aviso en
//   vez de crear una fila nueva a ciegas con columnas a 0 que podrían pisar
//   datos reales por una condición de carrera.
// ═══════════════════════════════════════════════════════════════════
const axios = require('axios');
const prisma = require('../config/prisma');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://spnfvmvrlexyiljwyola.supabase.co').replace(/\/+$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// La tabla wallets de Supabase está indexada por el UUID de Supabase Auth, pero
// el id de Railway es "usr_<primeros8>". Resolvemos el UUID real: si ya es un
// UUID, se usa tal cual; si no, se busca el supabaseId guardado en el usuario.
async function resolveSupabaseUserId(userId) {
  if (UUID_RE.test(userId)) return userId;
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { supabaseId: true } });
    if (u && u.supabaseId) return u.supabaseId;
  } catch (e) { /* si falla la búsqueda, caemos al userId original */ }
  return userId;
}

// Mapea los nombres de campo de Prisma (Railway) a las columnas reales de la tabla `wallets` en Supabase
const FIELD_MAP = {
  balanceEur: 'eur',
  balanceUsd: 'usd',
  balanceXaf: 'xaf',
  balanceXof: 'xof'
};

/**
 * Sincroniza el balance de un wallet hacia Supabase tras una operación de dinero en Railway.
 * @param {string} userId - id del usuario (mismo id en Railway y Supabase)
 * @param {object} wallet - el objeto wallet devuelto por Prisma tras el update/upsert
 *                           (puede tener balanceEur, balanceUsd, balanceXaf, balanceXof)
 * @returns {Promise<{synced:boolean, reason?:string}>}
 */
async function syncWalletToSupabase(userId, wallet) {
  if (!userId || !wallet) return { synced: false, reason: 'missing_args' };
  if (!SUPABASE_SERVICE_KEY) {
    console.warn('[supabaseSync] SUPABASE_SERVICE_KEY no configurada — wallet NO sincronizado con Supabase para userId=' + userId);
    return { synced: false, reason: 'no_service_key' };
  }

  const payload = {};
  for (const prismaField in FIELD_MAP) {
    if (wallet[prismaField] !== undefined && wallet[prismaField] !== null) {
      payload[FIELD_MAP[prismaField]] = wallet[prismaField];
    }
  }
  if (Object.keys(payload).length === 0) return { synced: false, reason: 'no_fields_to_sync' };

  const supabaseUserId = await resolveSupabaseUserId(userId);

  try {
    const res = await axios.patch(
      SUPABASE_URL + '/rest/v1/wallets?user_id=eq.' + encodeURIComponent(supabaseUserId),
      payload,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        timeout: 5000
      }
    );
    if (!Array.isArray(res.data) || res.data.length === 0) {
      console.warn('[supabaseSync] PATCH sin efecto — el wallet de userId=' + userId + ' (supabase=' + supabaseUserId + ') no existe todavía en Supabase. Revisar manualmente (posible cuenta creada solo en Railway).');
      return { synced: false, reason: 'wallet_not_found_in_supabase' };
    }
    return { synced: true };
  } catch (e) {
    console.error('[supabaseSync] FALLO sincronizando wallet userId=' + userId + ' — ' + ((e.response && JSON.stringify(e.response.data)) || e.message));
    return { synced: false, reason: e.message };
  }
}

module.exports = { syncWalletToSupabase };
