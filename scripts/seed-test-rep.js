'use strict';
// Crea un Representante de prueba y vincula la circular de prueba a su red.
// Idempotente. Uso: node scripts/seed-test-rep.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

const REP_EMAIL = 'rep.test@innovaafric.com';
const REP_PASS  = 'Rep2026!';

async function main() {
  // 1. Usuario representante
  const repUser = await prisma.user.upsert({
    where: { email: REP_EMAIL },
    update: {},
    create: {
      id: uuidv4(),
      email: REP_EMAIL,
      name: 'Representante de Prueba',
      phone: '+237600000002',
      country: 'Camerún',
      role: 'customer', // los reps se identifican por la tabla Representative
      passwordHash: bcrypt.hashSync(REP_PASS, 10),
      kycStatus: 'verified'
    }
  });

  // 2. Registro Representative + cuenta
  const rep = await prisma.representative.upsert({
    where: { userId: repUser.id },
    update: { status: 'active' },
    create: {
      userId: repUser.id,
      zone: 'Duala Centro',
      country: 'Camerún',
      status: 'active',
      totalEarned: 2500, // comisiones de red simuladas (50% del ahorro de sus circulares)
      notes: 'Representante de prueba para validar el panel /representante'
    }
  });
  await prisma.repAccount.upsert({
    where: { repId: rep.id },
    update: {},
    create: { repId: rep.id, unitBalance: 50000 }
  });

  // 3. Vincular la circular de prueba a su red
  const circUser = await prisma.user.findUnique({ where: { email: 'circular.test@innovaafric.com' } });
  if (circUser) {
    await prisma.circular.update({
      where: { userId: circUser.id },
      data: { repId: rep.id, authorizedByType: 'representative', authorizedBy: repUser.id }
    });
    console.log('   Circular de prueba vinculada a la red del rep');
  }

  console.log('✅ Representante de prueba listo:');
  console.log(`   ${REP_EMAIL} / ${REP_PASS} — zona Duala Centro, 2.500 en comisiones`);
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
