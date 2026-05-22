'use strict';

const request = require('supertest');
const app     = require('../app');

let token = '';

beforeAll(async () => {
  const res = await request(app).post('/v1/auth/token').send({
    grant_type: 'password', email: 'amara@example.com', password: 'pass1234'
  });
  token = res.body.data.access_token;
});

describe('GET /v1/bills/providers', () => {
  it('devuelve 12 proveedores con categorías', async () => {
    const res = await request(app).get('/v1/bills/providers');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.total).toBe(12);
    expect(res.body.data.categories).toContain('electricity');
    expect(res.body.data.categories).toContain('airtime');
  });

  it('filtra por categoría', async () => {
    const res = await request(app).get('/v1/bills/providers?category=water');
    expect(res.statusCode).toBe(200);
    res.body.data.providers.forEach(p => expect(p.category).toBe('water'));
  });

  it('filtra por país', async () => {
    const res = await request(app).get('/v1/bills/providers?country=GQ');
    expect(res.statusCode).toBe(200);
    res.body.data.providers.forEach(p => expect(p.country).toBe('GQ'));
  });
});

describe('POST /v1/bills/pay', () => {
  it('paga una factura de electricidad', async () => {
    const res = await request(app)
      .post('/v1/bills/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider_id: 'bp_001', amount: 5000, reference_number: 'ACC-TEST-001' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data).toHaveProperty('confirmation_code');
  });

  it('rechaza importe fuera de rango', async () => {
    const res = await request(app)
      .post('/v1/bills/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider_id: 'bp_001', amount: 50, reference_number: 'ACC-001' });
    expect(res.statusCode).toBe(422);
  });

  it('rechaza proveedor inexistente', async () => {
    const res = await request(app)
      .post('/v1/bills/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider_id: 'bp_999', amount: 5000, reference_number: 'ACC-001' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /v1/bills/history', () => {
  it('devuelve historial de pagos', async () => {
    const res = await request(app).get('/v1/bills/history').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('items');
  });
});

describe('GET /v1/coupons/validate/:code', () => {
  it('valida cupón existente', async () => {
    const res = await request(app)
      .get('/v1/coupons/validate/BIENVENIDO20')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.discount_value).toBe(20);
  });

  it('devuelve 404 para cupón inexistente', async () => {
    const res = await request(app)
      .get('/v1/coupons/validate/NOEXISTE')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });
});
