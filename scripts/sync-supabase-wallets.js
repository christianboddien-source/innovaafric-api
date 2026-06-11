'use strict';
// Sincronización ÚNICA de saldos Supabase → Railway.
// Solo copia el saldo si el wallet de Railway está completamente a CERO
// (nunca pisa actividad real de Railway). Idempotente.
// Uso: node scripts/sync-supabase-wallets.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SB_URL = process.env.SUPABASE_URL || 'https://spnfvmvrlexyiljwyola.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_Aqe-VLEi6MfY8AvlpRfnLQ_OAom278u';
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

async function main() {
  // 1. Todos los wallets de Supabase con algún saldo
  const wallets = await (await fetch(
    `${SB_URL}/rest/v1/wallets?select=user_id,eur,usd,xaf,xof&or=(eur.gt.0,usd.gt.0,xaf.gt.0,xof.gt.0)`,
    { headers: H }
  )).json();
  if (!Array.isArray(wallets)) throw new Error('No se pudo leer wallets de Supabase: ' + JSON.stringify(wallets));
  console.log(`Wallets con saldo en Supabase: ${wallets.length}`);

  let synced = 0, skipped = 0, notFound = 0;
  for (const w of wallets) {
    // email del usuario Supabase
    const users = await (await fetch(
      `${SB_URL}/rest/v1/users?select=email,full_name&id=eq.${w.user_id}`, { headers: H }
    )).json();
    const email = users?.[0]?.email;
    if (!email) { notFound++; continue; }

    // usuario Railway por email o por id derivado
    const shortId = 'usr_' + String(w.user_id).slice(0, 8);
    const rUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { id: w.user_id }, { id: shortId }] },
      include: { wallet: true }
    });
    if (!rUser) {
      console.log(`  — ${email}: no existe en Railway (se creará con saldo en su primer login)`);
      notFound++;
      continue;
    }

    const rw = rUser.wallet;
    const railwayEmpty = !rw || ((rw.balanceEur || 0) === 0 && (rw.balanceUsd || 0) === 0 &&
                                 (rw.balanceXaf || 0) === 0 && (rw.balanceXof || 0) === 0);
    if (!railwayEmpty) {
      console.log(`  ⏭️ ${email}: Railway ya tiene saldo (XAF ${rw.balanceXaf}) — no se toca`);
      skipped++;
      continue;
    }

    await prisma.wallet.upsert({
      where: { userId: rUser.id },
      update: {
        balanceEur: Number(w.eur) || 0,
        balanceUsd: Number(w.usd) || 0,
        balanceXaf: Number(w.xaf) || 0,
        balanceXof: Number(w.xof) || 0
      },
      create: {
        userId: rUser.id,
        balanceEur: Number(w.eur) || 0,
        balanceUsd: Number(w.usd) || 0,
        balanceXaf: Number(w.xaf) || 0,
        balanceXof: Number(w.xof) || 0
      }
    });
    console.log(`  ✅ ${email}: sincronizado — XAF ${w.xaf} | EUR ${w.eur} | USD ${w.usd} | XOF ${w.xof}`);
    synced++;
  }

  console.log(`\nRESULTADO: ${synced} sincronizados · ${skipped} con saldo Railway (intactos) · ${notFound} sin usuario Railway`);
  await prisma.$disconnect();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
