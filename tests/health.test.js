'use strict';

const request = require('supertest');
const app     = require('../app');

describe('GET /v1/utils/health', () => {
  it('devuelve status healthy con todos los servicios', async () => {
    const res = await request(app).get('/v1/utils/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.services).toHaveProperty('xenderMoney', 'operational');
    expect(res.body.services).toHaveProperty('xenderShop', 'operational');
    expect(res.body.services).toHaveProperty('xenderDelivery', 'operational');
  });
});

describe('GET /v1/utils/rates', () => {
  it('devuelve todas las tasas de cambio', async () => {
    const res = await request(app).get('/v1/utils/rates');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rates).toHaveProperty('EUR-XAF');
  });

  it('devuelve tasa para un par específico', async () => {
    const res = await request(app).get('/v1/utils/rates?from=EUR&to=XAF');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.rate).toBe(655.957);
  });

  it('devuelve 404 para par no soportado', async () => {
    const res = await request(app).get('/v1/utils/rates?from=GBP&to=XAF');
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /v1/utils/convert', () => {
  it('convierte EUR a XAF con comisión', async () => {
    const res = await request(app).get('/v1/utils/convert?amount=100&from=EUR&to=XAF');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.amount_sent).toBe(100);
    expect(res.body.data.fee).toBe(2);
    expect(res.body.data.amount_received).toBeGreaterThan(0);
  });
});

describe('404 handler', () => {
  it('devuelve 404 para rutas inexistentes', async () => {
    const res = await request(app).get('/v1/ruta_inexistente');
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
