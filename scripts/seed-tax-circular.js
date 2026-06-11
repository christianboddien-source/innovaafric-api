'use strict';
// Crea un impuesto de ejemplo para los traslados de las Circulares (tipo circular_cashout).
// El admin puede editarlo o desactivarlo desde el módulo Impuestos del dashboard.
// Uso: node scripts/seed-tax-circular.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.tax.findFirst({
    where: { country: 'CAMERÚN', type: 'circular_cashout' }
  });
  if (existing) {
    console.log(`Ya existe: ${existing.name} ${existing.rate}% (${existing.id})`);
    return;
  }
  const tax = await prisma.tax.create({
    data: {
      id: `tax_circ_cm`,
      name: 'Impuesto sobre comisiones de Circular (ejemplo)',
      type: 'circular_cashout',
      rate: 5,
      country: 'CAMERÚN',
      description: 'Retención aplicada al trasladar unidades a la wallet XenderMoney. EDITAR con la tasa real del país desde el dashboard.'
    }
  });
  console.log(`✅ Impuesto creado: ${tax.name} — ${tax.rate}% (${tax.country})`);
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
