'use strict';
// Crea un Rider de prueba + una comanda pendiente para validar la app /rider.
// Idempotente. Uso: node scripts/seed-test-rider.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

const RIDER_EMAIL = 'rider.test@innovaafric.com';
const RIDER_PASS  = 'Rider2026!';

async function main() {
  // 1. Usuario rider
  const riderUser = await prisma.user.upsert({
    where: { email: RIDER_EMAIL },
    update: { role: 'rider' },
    create: {
      id: uuidv4(),
      email: RIDER_EMAIL,
      name: 'Rider de Prueba',
      phone: '+237600000003',
      country: 'Camerún',
      city: 'Duala',
      role: 'rider',
      passwordHash: bcrypt.hashSync(RIDER_PASS, 10),
      kycStatus: 'verified'
    }
  });

  // 2. Registro Rider vinculado
  await prisma.rider.upsert({
    where: { userId: riderUser.id },
    update: { status: 'available' },
    create: {
      id: 'rider_test_001',
      name: 'Rider de Prueba',
      phone: '+237600000003',
      zone: 'Duala',
      vehicle: 'moto',
      status: 'available',
      userId: riderUser.id
    }
  });

  // 3. Comanda pendiente (del cliente de prueba) para aceptar
  const client = await prisma.user.findUnique({ where: { email: 'cliente.test@innovaafric.com' } });
  if (client) {
    const existing = await prisma.groceryOrder.findFirst({
      where: { userId: client.id, riderId: null, status: 'preparing' }
    });
    if (!existing) {
      await prisma.groceryOrder.create({
        data: {
          id: `gro_test_${uuidv4().slice(0, 8)}`,
          userId: client.id,
          totalXaf: 15500,
          deliveryAddress: 'Barrio Bonabéri, calle 12, Duala',
          status: 'preparing',
          riderFeeXaf: 1500,
          notes: 'Comanda de prueba para la app del rider'
        }
      });
      console.log('   Comanda pendiente creada (15.500 XAF, fee rider 1.500)');
    } else {
      console.log('   Ya hay una comanda pendiente');
    }
  }

  console.log('✅ Rider de prueba listo:');
  console.log(`   ${RIDER_EMAIL} / ${RIDER_PASS} — zona Duala, moto`);
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
