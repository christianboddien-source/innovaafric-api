'use strict';
// Crea una Circular Autorizada de prueba con saldo + un cliente de barrio.
// Idempotente: se puede ejecutar varias veces sin duplicar datos.
// Uso: node scripts/seed-test-circular.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

const CIRCULAR_EMAIL = 'circular.test@innovaafric.com';
const CIRCULAR_PASS  = 'Circular2026!';
const CLIENT_EMAIL   = 'cliente.test@innovaafric.com';
const CLIENT_PASS    = 'Cliente2026!';

async function main() {
  // 1. Usuario circular
  const circularUser = await prisma.user.upsert({
    where: { email: CIRCULAR_EMAIL },
    update: { role: 'circular_autorizada' },
    create: {
      id: uuidv4(),
      email: CIRCULAR_EMAIL,
      name: 'Circular de Prueba',
      phone: '+237600000001',
      country: 'Camerún',
      role: 'circular_autorizada',
      passwordHash: bcrypt.hashSync(CIRCULAR_PASS, 10),
      kycStatus: 'verified'
    }
  });

  // 2. Registro Circular activo
  const circular = await prisma.circular.upsert({
    where: { userId: circularUser.id },
    update: { status: 'active' },
    create: {
      userId: circularUser.id,
      neighborhood: 'Barrio Piloto — Duala',
      country: 'Camerún',
      commissionRate: 0.05,
      status: 'active',
      authorizedByType: 'admin',
      notes: 'Circular de prueba creada para validar la app /circular'
    }
  });

  // 3. Cuenta de unidades con saldo (compra de 100.000 ya confirmada)
  await prisma.circularAccount.upsert({
    where: { circularId: circular.id },
    update: { unitBalance: 100000 },
    create: {
      circularId: circular.id,
      unitBalance: 100000,
      totalUnitsBought: 100000,
      totalPaid: 95000,
      totalSaved: 5000,
      alertThreshold: 5000
    }
  });

  // 4. Cliente de barrio con wallet vacía
  const client = await prisma.user.upsert({
    where: { email: CLIENT_EMAIL },
    update: {},
    create: {
      id: uuidv4(),
      email: CLIENT_EMAIL,
      name: 'Cliente de Prueba',
      phone: '+237699887766',
      country: 'Camerún',
      role: 'customer',
      passwordHash: bcrypt.hashSync(CLIENT_PASS, 10),
      kycStatus: 'verified'
    }
  });
  await prisma.wallet.upsert({
    where: { userId: client.id },
    update: {},
    create: { userId: client.id }
  });

  console.log('✅ Datos de prueba listos:');
  console.log(`   Circular: ${CIRCULAR_EMAIL} / ${CIRCULAR_PASS} (100.000 unidades)`);
  console.log(`   Cliente:  ${client.name} — tel ${client.phone}`);
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
