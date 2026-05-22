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

describe('GET /v1/shop/products', () => {
  it('devuelve catálogo paginado', async () => {
    const res = await request(app).get('/v1/shop/products');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items[0]).toHaveProperty('price_eur');
    expect(res.body.data.items[0]).toHaveProperty('price_xaf');
  });

  it('filtra por categoría', async () => {
    const res = await request(app).get('/v1/shop/products?category=electronics');
    expect(res.statusCode).toBe(200);
    res.body.data.items.forEach(p => expect(p.category).toBe('electronics'));
  });

  it('filtra por búsqueda de texto', async () => {
    const res = await request(app).get('/v1/shop/products?q=solar');
    expect(res.statusCode).toBe(200);
    res.body.data.items.forEach(p => expect(p.name.toLowerCase()).toContain('solar'));
  });
});

describe('GET /v1/shop/products/:id', () => {
  it('devuelve producto existente', async () => {
    const res = await request(app).get('/v1/shop/products/prod_001');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe('prod_001');
  });

  it('devuelve 404 para producto inexistente', async () => {
    const res = await request(app).get('/v1/shop/products/prod_999');
    expect(res.statusCode).toBe(404);
  });
});

describe('Carrito y pedidos', () => {
  it('añade producto al carrito', async () => {
    const res = await request(app)
      .post('/v1/shop/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ product_id: 'prod_004', quantity: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.item_count).toBeGreaterThan(0);
  });

  it('consulta el carrito', async () => {
    const res = await request(app).get('/v1/shop/cart').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('total_eur');
  });

  it('crea pedido y gana puntos de fidelidad', async () => {
    const res = await request(app)
      .post('/v1/shop/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_currency: 'EUR', delivery_address: 'Malabo Centro, GQ' });
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('tracking_id');
    expect(res.body.data).toHaveProperty('loyalty_points_earned');
    expect(res.body.data.loyalty_points_earned).toBeGreaterThan(0);
  });

  it('rechaza pedido con carrito vacío', async () => {
    const res = await request(app)
      .post('/v1/shop/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_currency: 'EUR', delivery_address: 'Malabo' });
    expect(res.statusCode).toBe(400);
  });
});
