require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const users = await prisma.user.findMany({
    where: { OR: [ { email: { contains: 'ceo', mode: 'insensitive' } }, { name: { contains: 'ceo', mode: 'insensitive' } } ] },
    select: { id: true, email: true, name: true, role: true, kycStatus: true, country: true }
  });
  console.log('USUARIOS CEO EN RAILWAY:', users.length);
  for (const u of users) {
    const w = await prisma.wallet.findUnique({ where: { userId: u.id } });
    console.log(`- ${u.email} | ${u.name} | rol ${u.role} | KYC ${u.kycStatus}`);
    console.log(`  wallet: ${w ? `XAF ${w.balanceXaf} | EUR ${w.balanceEur} | USD ${w.balanceUsd} | XOF ${w.balanceXof}` : 'SIN WALLET'}`);
  }
  await prisma.$disconnect();
})();
