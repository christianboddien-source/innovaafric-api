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

describe('GET /v1/money/balance', () => {
  it('devuelve balances en 4 divisas', async () => {
    const res = await request(app).get('/v1/money/balance').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.balances).toHaveProperty('EUR');
    expect(res.body.data.balances).toHaveProperty('XAF');
    expect(res.body.data.balances).toHaveProperty('USD');
    expect(res.body.data.balances).toHaveProperty('XOF');
  });

  it('rechaza sin token', async () => {
    const res = await request(app).get('/v1/money/balance');
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /v1/money/topup', () => {
  it('recarga saldo correctamente', async () => {
    const res = await request(app)
      .post('/v1/money/topup')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 10000, currency: 'XAF', method: 'mtn_money' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.amount).toBe(10000);
    expect(res.body.data.status).toBe('completed');
  });

  it('rechaza método inválido', async () => {
    const res = await request(app)
      .post('/v1/money/topup')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5000, currency: 'XAF', method: 'bitcoin' });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /v1/money/transfer (P2P)', () => {
  it('transfiere entre usuarios correctamente', async () => {
    const res = await request(app)
      .post('/v1/money/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1000, currency: 'XAF', to_user: 'usr_002', note: 'Test' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.fee).toBe(0);
    expect(res.body.data.amount).toBe(1000);
  });

  it('rechaza auto-transferencia', async () => {
    const res = await request(app)
      .post('/v1/money/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 500, currency: 'XAF', to_user: 'usr_001' });
    expect(res.statusCode).toBe(400);
  });

  it('rechaza saldo insuficiente', async () => {
    const res = await request(app)
      .post('/v1/money/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 9999999, currency: 'XAF', to_user: 'usr_002' });
    expect(res.statusCode).toBe(422);
  });
});

describe('POST /v1/money/send (internacional)', () => {
  it('envía dinero con conversión de divisas', async () => {
    const res = await request(app)
      .post('/v1/money/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 10, currency: 'EUR', recipient_id: 'usr_002', dest_currency: 'XAF' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.amount_received).toBeGreaterThan(0);
    expect(res.body.data.fee).toBeGreaterThan(0);
    expect(res.body.data.exchange_rate).toBe(655.957);
  });
});

describe('GET /v1/money/history', () => {
  it('devuelve historial paginado', async () => {
    const res = await request(app).get('/v1/money/history').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('pagination');
  });
});
