'use strict';
// Crea un Comercio de prueba + una comanda por preparar para validar la app /comercio.
// Requiere que la migración 20260611220000_merchant_app esté aplicada.
// Idempotente. Uso: node scripts/seed-test-comercio.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

const COM_EMAIL = 'comercio.test@innovaafric.com';
const COM_PASS  = 'Comercio2026!';

async function main() {
  // 1. Usuario del comercio
  const comUser = await prisma.user.upsert({
    where: { email: COM_EMAIL },
    update: { role: 'supplier' },
    create: {
      id: uuidv4(),
      email: COM_EMAIL,
      name: 'Mini Market Bonabéri',
      phone: '+237600000004',
      country: 'Camerún',
      city: 'Duala',
      role: 'supplier',
      passwordHash: bcrypt.hashSync(COM_PASS, 10),
      kycStatus: 'verified'
    }
  });

  // 2. Merchant vinculado
  let merchant = await prisma.merchant.findUnique({ where: { userId: comUser.id } });
  if (!merchant) {
    merchant = await prisma.merchant.create({
      data: {
        id: 'mer_test_001',
        name: 'Mini Market Bonabéri',
        qrCode: 'qr_bonaberi_001',
        active: true,
        userId: comUser.id,
        phone: '+237600000004',
        address: 'Avenida Principal 24, Bonabéri',
        city: 'Duala',
        country: 'Camerún',
        category: 'Alimentación'
      }
    });
  }

  // 3. Comanda por preparar (del cliente de prueba)
  const client = await prisma.user.findUnique({ where: { email: 'cliente.test@innovaafric.com' } });
  if (client) {
    const existing = await prisma.groceryOrder.findFirst({
      where: { merchantId: merchant.id, status: 'preparing' }
    });
    if (!existing) {
      await prisma.groceryOrder.create({
        data: {
          id: `groc_test_${uuidv4().slice(0, 8)}`,
          userId: client.id,
          merchantId: merchant.id,
          totalXaf: 22000,
          deliveryAddress: 'Barrio Bonapriso, calle 5, Duala',
          status: 'preparing',
          riderFeeXaf: 2200,
          notes: 'Pedido de prueba para la app del comercio'
        }
      });
      console.log('   Comanda por preparar creada (22.000 XAF, fee rider 2.200)');
    } else {
      console.log('   Ya hay una comanda por preparar');
    }
  }

  console.log('✅ Comercio de prueba listo:');
  console.log(`   ${COM_EMAIL} / ${COM_PASS} — Mini Market Bonabéri, Duala`);
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
