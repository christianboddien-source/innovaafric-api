'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('Sembrando base de datos...');

  // Admin
  await prisma.user.upsert({
    where: { email: 'admin@innovaafric.com' },
    update: {},
    create: {
      id: 'usr_admin', email: 'admin@innovaafric.com', name: 'Admin INNOVAAFRIC',
      phone: '+240000000001', country: 'GQ', role: 'admin',
      passwordHash: await bcrypt.hash('Admin2026!', 10),
      kycStatus: 'verified'
    }
  });
  await prisma.wallet.upsert({
    where: { userId: 'usr_admin' }, update: {},
    create: { userId: 'usr_admin', balanceEur: 0, balanceUsd: 0, balanceXaf: 0, balanceXof: 0 }
  });

  // Usuarios
  const [amara, carlos] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'amara@example.com' },
      update: {},
      create: {
        id: 'usr_001', email: 'amara@example.com', name: 'Amara Diallo',
        phone: '+2401234567', country: 'GQ', role: 'customer',
        passwordHash: await bcrypt.hash('pass1234', 10),
        kycStatus: 'verified'
      }
    }),
    prisma.user.upsert({
      where: { email: 'carlos@circular.com' },
      update: {},
      create: {
        id: 'usr_002', email: 'carlos@circular.com', name: 'Carlos Mbá',
        phone: '+2370987654', country: 'CM', role: 'circular_autorizada',
        passwordHash: await bcrypt.hash('pass5678', 10),
        kycStatus: 'verified'
      }
    })
  ]);

  // Wallets
  await Promise.all([
    prisma.wallet.upsert({
      where: { userId: 'usr_001' }, update: {},
      create: { userId: 'usr_001', balanceEur: 250, balanceUsd: 180, balanceXaf: 65000, balanceXof: 0 }
    }),
    prisma.wallet.upsert({
      where: { userId: 'usr_002' }, update: {},
      create: { userId: 'usr_002', balanceEur: 1800, balanceUsd: 500, balanceXaf: 350000, balanceXof: 0 }
    })
  ]);

  // Productos
  const products = [
    { id: 'prod_001', name: 'Smartphone Xiaomi A3',   priceEur: 189.99, priceXaf: 124699, category: 'electronics', stock: 45,  origin: 'China',   deliveryDays: 4 },
    { id: 'prod_002', name: 'Ventilador Solar 20W',   priceEur: 49.99,  priceXaf: 32791,  category: 'energy',       stock: 120, origin: 'Vietnam', deliveryDays: 5 },
    { id: 'prod_003', name: 'Mochila impermeable 30L',priceEur: 34.50,  priceXaf: 22635,  category: 'accessories',  stock: 78,  origin: 'China',   deliveryDays: 4 },
    { id: 'prod_004', name: 'Auriculares Bluetooth',  priceEur: 25.99,  priceXaf: 17054,  category: 'electronics',  stock: 200, origin: 'China',   deliveryDays: 4 },
    { id: 'prod_005', name: 'Kit herramientas solar', priceEur: 89.00,  priceXaf: 58380,  category: 'energy',       stock: 30,  origin: 'India',   deliveryDays: 5 }
  ];
  for (const p of products) {
    await prisma.product.upsert({ where: { id: p.id }, update: {}, create: p });
  }

  // Productos grocery
  const groceries = [
    { id: 'groc_001', name: 'Arroz basmati 5kg',   priceXaf: 4500, category: 'cereales',       store: 'Supermercado Central' },
    { id: 'groc_002', name: 'Aceite de palma 1L',   priceXaf: 1800, category: 'aceites',         store: 'Supermercado Central' },
    { id: 'groc_003', name: 'Tomates frescos 1kg',  priceXaf: 800,  category: 'frutas_verduras', store: 'Mercado Local' },
    { id: 'groc_004', name: 'Leche en polvo 400g',  priceXaf: 3200, category: 'lacteos',         store: 'Supermercado Central' }
  ];
  for (const g of groceries) {
    await prisma.groceryProduct.upsert({ where: { id: g.id }, update: {}, create: g });
  }

  // Riders
  const riders = [
    { id: 'rider_001', name: 'Jean Pierre Ondo', phone: '+2406543210', zone: 'Malabo Norte', vehicle: 'moto',      status: 'available', rating: 4.8, deliveriesTotal: 342 },
    { id: 'rider_002', name: 'Marie Nguema',     phone: '+2406789012', zone: 'Malabo Sur',   vehicle: 'bicicleta', status: 'busy',      rating: 4.9, deliveriesTotal: 189 },
    { id: 'rider_003', name: 'Paul Essono',      phone: '+2406112233', zone: 'Bata Centro',  vehicle: 'moto',      status: 'available', rating: 4.7, deliveriesTotal: 521 }
  ];
  for (const r of riders) {
    await prisma.rider.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // Merchant
  await prisma.merchant.upsert({
    where: { qrCode: 'QR_MERCH_001' }, update: {},
    create: { id: 'merch_001', name: 'Tienda El Progreso', circularId: 'usr_002', qrCode: 'QR_MERCH_001' }
  });

  // API Client
  await prisma.apiClient.upsert({
    where: { clientId: 'client_demo' }, update: {},
    create: {
      clientId: 'client_demo',
      clientSecret: await bcrypt.hash('secret_demo', 10),
      name: 'Demo App',
      scopes: JSON.stringify(['payments', 'transfers', 'qr', 'shop', 'delivery'])
    }
  });

  // Proveedores de facturas
  const billProviders = [
    { id: 'bp_001', name: 'SOMELEC',           category: 'electricity', country: 'GQ', field: 'account_number', minAmount: 1000,  maxAmount: 500000 },
    { id: 'bp_002', name: 'AES-SONEL',         category: 'electricity', country: 'CM', field: 'account_number', minAmount: 1000,  maxAmount: 500000 },
    { id: 'bp_003', name: 'SNEC',              category: 'water',       country: 'CM', field: 'account_number', minAmount: 500,   maxAmount: 200000 },
    { id: 'bp_004', name: 'CAMWATER',          category: 'water',       country: 'CM', field: 'account_number', minAmount: 500,   maxAmount: 200000 },
    { id: 'bp_005', name: 'MTN Cameroun',      category: 'airtime',     country: 'CM', field: 'phone',          minAmount: 100,   maxAmount: 50000  },
    { id: 'bp_006', name: 'Orange Cameroun',   category: 'airtime',     country: 'CM', field: 'phone',          minAmount: 100,   maxAmount: 50000  },
    { id: 'bp_007', name: 'MTN Guinea Ec.',    category: 'airtime',     country: 'GQ', field: 'phone',          minAmount: 100,   maxAmount: 50000  },
    { id: 'bp_008', name: 'Orange Guinea Ec.', category: 'airtime',     country: 'GQ', field: 'phone',          minAmount: 100,   maxAmount: 50000  },
    { id: 'bp_009', name: 'Camtel',            category: 'internet',    country: 'CM', field: 'account_number', minAmount: 5000,  maxAmount: 100000 },
    { id: 'bp_010', name: 'GETESA',            category: 'internet',    country: 'GQ', field: 'account_number', minAmount: 5000,  maxAmount: 100000 },
    { id: 'bp_011', name: 'Canal+ Afrique',    category: 'tv',          country: 'CM', field: 'account_number', minAmount: 5000,  maxAmount: 30000  },
    { id: 'bp_012', name: 'DStv',              category: 'tv',          country: 'GQ', field: 'account_number', minAmount: 5000,  maxAmount: 30000  }
  ];
  for (const bp of billProviders) {
    await prisma.billProvider.upsert({ where: { id: bp.id }, update: {}, create: bp });
  }

  // Cupones
  const coupons = [
    { id: 'coup_001', code: 'BIENVENIDO20', discountType: 'percentage', discountValue: 20,   minOrderEur: 30,  maxUses: 100, expiresAt: new Date('2026-12-31'), description: '20% de descuento en tu primer pedido' },
    { id: 'coup_002', code: 'VERANO10',     discountType: 'fixed_eur',  discountValue: 10,   minOrderEur: 50,  maxUses: 50,  expiresAt: new Date('2026-08-31'), description: '10€ de descuento desde 50€' },
    { id: 'coup_003', code: 'AFRICA5000',   discountType: 'fixed_xaf',  discountValue: 5000, minOrderXaf: 20000, maxUses: 200, expiresAt: new Date('2026-12-31'), description: '5000 XAF de descuento' }
  ];
  for (const c of coupons) {
    await prisma.coupon.upsert({ where: { id: c.id }, update: {}, create: c });
  }

  // Tasas de cambio
  const rates = [
    { pair: 'EUR-XAF', rate: 655.957 }, { pair: 'EUR-XOF', rate: 655.957 }, { pair: 'EUR-USD', rate: 1.08 },
    { pair: 'USD-XAF', rate: 607.36  }, { pair: 'USD-XOF', rate: 607.36  }, { pair: 'USD-EUR', rate: 0.926 },
    { pair: 'XAF-EUR', rate: 0.00152 }, { pair: 'XOF-EUR', rate: 0.00152 }
  ];
  for (const r of rates) {
    await prisma.exchangeRate.upsert({ where: { pair: r.pair }, update: { rate: r.rate }, create: r });
  }

  // Puntos de fidelidad iniciales
  await Promise.all([
    prisma.loyaltyAccount.upsert({
      where: { userId: 'usr_001' }, update: {},
      create: { userId: 'usr_001', points: 150, totalEarned: 150 }
    }),
    prisma.loyaltyAccount.upsert({
      where: { userId: 'usr_002' }, update: {},
      create: { userId: 'usr_002', points: 320, totalEarned: 320 }
    })
  ]);

  console.log('✓ Base de datos sembrada correctamente.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
