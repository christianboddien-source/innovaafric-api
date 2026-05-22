'use strict';

const bcrypt = require('bcryptjs');

const DB = {
  users: [
    {
      id: 'usr_001', email: 'amara@example.com', name: 'Amara Diallo',
      phone: '+2401234567', country: 'GQ', role: 'customer',
      password_hash: bcrypt.hashSync('pass1234', 10),
      kyc_status: 'verified', created_at: '2026-01-15T10:00:00Z'
    },
    {
      id: 'usr_002', email: 'carlos@circular.com', name: 'Carlos Mbá',
      phone: '+2370987654', country: 'CM', role: 'circular_autorizada',
      password_hash: bcrypt.hashSync('pass5678', 10),
      kyc_status: 'verified', created_at: '2026-02-01T09:00:00Z'
    }
  ],
  wallets: {
    'usr_001': { balance_eur: 250.00, balance_usd: 180.00, balance_xaf: 65000, balance_xof: 0 },
    'usr_002': { balance_eur: 1800.00, balance_usd: 500.00, balance_xaf: 350000, balance_xof: 0 }
  },
  transactions: [],
  products: [
    { id: 'prod_001', name: 'Smartphone Xiaomi A3', price_eur: 189.99, price_xaf: 124699, category: 'electronics', stock: 45, origin: 'China', ce_certified: true, delivery_days: 4 },
    { id: 'prod_002', name: 'Ventilador Solar 20W', price_eur: 49.99, price_xaf: 32791, category: 'energy', stock: 120, origin: 'Vietnam', ce_certified: true, delivery_days: 5 },
    { id: 'prod_003', name: 'Mochila impermeable 30L', price_eur: 34.50, price_xaf: 22635, category: 'accessories', stock: 78, origin: 'China', ce_certified: true, delivery_days: 4 },
    { id: 'prod_004', name: 'Auriculares Bluetooth', price_eur: 25.99, price_xaf: 17054, category: 'electronics', stock: 200, origin: 'China', ce_certified: true, delivery_days: 4 },
    { id: 'prod_005', name: 'Kit herramientas solar', price_eur: 89.00, price_xaf: 58380, category: 'energy', stock: 30, origin: 'India', ce_certified: true, delivery_days: 5 }
  ],
  grocery_products: [
    { id: 'groc_001', name: 'Arroz basmati 5kg', price_xaf: 4500, category: 'cereales', store: 'Supermercado Central', available: true },
    { id: 'groc_002', name: 'Aceite de palma 1L', price_xaf: 1800, category: 'aceites', store: 'Supermercado Central', available: true },
    { id: 'groc_003', name: 'Tomates frescos 1kg', price_xaf: 800, category: 'frutas_verduras', store: 'Mercado Local', available: true },
    { id: 'groc_004', name: 'Leche en polvo 400g', price_xaf: 3200, category: 'lacteos', store: 'Supermercado Central', available: true }
  ],
  orders: [],
  grocery_orders: [],
  deliveries: [],
  riders: [
    { id: 'rider_001', name: 'Jean Pierre Ondo', phone: '+2406543210', zone: 'Malabo Norte', vehicle: 'moto', status: 'available', rating: 4.8, deliveries_total: 342 },
    { id: 'rider_002', name: 'Marie Nguema', phone: '+2406789012', zone: 'Malabo Sur', vehicle: 'bicicleta', status: 'busy', rating: 4.9, deliveries_total: 189 },
    { id: 'rider_003', name: 'Paul Essono', phone: '+2406112233', zone: 'Bata Centro', vehicle: 'moto', status: 'available', rating: 4.7, deliveries_total: 521 }
  ],
  carts: {},
  api_clients: [
    { client_id: 'client_demo', client_secret: bcrypt.hashSync('secret_demo', 10), name: 'Demo App', scopes: ['payments', 'transfers', 'qr', 'shop', 'delivery'] }
  ],
  merchants: [
    { id: 'merch_001', name: 'Tienda El Progreso', circular_id: 'usr_002', qr_code: 'QR_MERCH_001', active: true }
  ],
  webhooks: [],
  exchange_rates: {
    'EUR-XAF': 655.957, 'EUR-XOF': 655.957, 'EUR-USD': 1.08,
    'USD-XAF': 607.36,  'USD-XOF': 607.36,  'USD-EUR': 0.926,
    'XAF-EUR': 0.00152, 'XOF-EUR': 0.00152
  }
};

module.exports = DB;
