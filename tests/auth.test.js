'use strict';

const request = require('supertest');
const app     = require('../app');

let userToken    = '';
let userId       = '';
let kycUserToken = '';

describe('POST /v1/auth/register', () => {
  it('registra un nuevo usuario correctamente', async () => {
    const res = await request(app).post('/v1/auth/register').send({
      name: 'Test Usuario', email: 'test_jest@example.com',
      phone: '+2401111111', password: 'testpass123', country: 'GQ'
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('test_jest@example.com');
    expect(res.body.data.kyc_status).toBe('pending');
    userId = res.body.data.id;
  });

  it('rechaza email duplicado', async () => {
    const res = await request(app).post('/v1/auth/register').send({
      name: 'Duplicado', email: 'amara@example.com',
      phone: '+2409999999', password: 'pass', country: 'GQ'
    });
    expect(res.statusCode).toBe(409);
  });

  it('rechaza campos faltantes', async () => {
    const res = await request(app).post('/v1/auth/register').send({ name: 'Sin email' });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /v1/auth/token (password)', () => {
  it('devuelve access_token con credenciales válidas', async () => {
    const res = await request(app).post('/v1/auth/token').send({
      grant_type: 'password', email: 'amara@example.com', password: 'pass1234'
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).toHaveProperty('refresh_token');
    expect(res.body.data.user.email).toBe('amara@example.com');
    userToken = res.body.data.access_token;
  });

  it('rechaza contraseña incorrecta', async () => {
    const res = await request(app).post('/v1/auth/token').send({
      grant_type: 'password', email: 'amara@example.com', password: 'wrongpass'
    });
    expect(res.statusCode).toBe(401);
  });

  it('rechaza grant_type no soportado', async () => {
    const res = await request(app).post('/v1/auth/token').send({ grant_type: 'invalid' });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /v1/auth/token (client_credentials)', () => {
  it('devuelve token de cliente con credenciales válidas', async () => {
    const res = await request(app).post('/v1/auth/token').send({
      grant_type: 'client_credentials', client_id: 'client_demo', client_secret: 'secret_demo'
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.access_token).toBeDefined();
    expect(res.body.data.token_type).toBe('Bearer');
  });
});

describe('POST /v1/auth/kyc', () => {
  beforeAll(async () => {
    const res = await request(app).post('/v1/auth/token').send({
      grant_type: 'password', email: 'test_jest@example.com', password: 'testpass123'
    });
    kycUserToken = res.body.data.access_token;
  });

  it('envía documentación KYC correctamente', async () => {
    const res = await request(app)
      .post('/v1/auth/kyc')
      .set('Authorization', `Bearer ${kycUserToken}`)
      .send({ document_type: 'passport', document_number: 'P9876543' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('under_review');
  });

  it('rechaza petición sin token', async () => {
    const res = await request(app).post('/v1/auth/kyc').send({ document_type: 'passport', document_number: 'X' });
    expect(res.statusCode).toBe(401);
  });
});
