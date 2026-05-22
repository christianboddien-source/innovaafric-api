'use strict';

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'INNOVAAFRIC API',
    version: '1.0.0',
    description: `
API REST del ecosistema digital tricontinental INNOVAAFRIC.

**Servicios disponibles:**
- 🔐 Auth — OAuth 2.0, registro, KYC
- 💸 XenderMoney — pagos, transferencias, QR, top-up, tarjetas virtuales
- 🛒 XenderShop — tienda, carrito, pedidos
- 🛍️ XenderBigShop — grocery express
- 🚴 XenderDelivery — tracking, riders
- 🏦 XenderBusiness — cuentas empresa, facturas, pagos masivos
- 📋 Facturas, Tontinas, Cupones, Puntos, Referidos
- 🔔 Notificaciones

**Autenticación:** Bearer JWT — obtén tu token en \`POST /v1/auth/token\`
    `,
    contact: { name: 'INNOVAAFRIC Tech Team', email: 'dev@innovaafric.com' }
  },
  servers: [
    { url: 'http://localhost:3000/v1', description: 'Desarrollo local' },
    { url: 'https://api.innovaafric.com/v1', description: 'Producción' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    },
    schemas: {
      Success: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object' },
          timestamp: { type: 'string', format: 'date-time' }
        }
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'integer' },
              message: { type: 'string' },
              details: { type: 'object', nullable: true }
            }
          },
          timestamp: { type: 'string', format: 'date-time' }
        }
      },
      Pagination: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'object' } },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' }, limit: { type: 'integer' },
              total: { type: 'integer' }, pages: { type: 'integer' }
            }
          }
        }
      }
    }
  },
  security: [{ bearerAuth: [] }],
  paths: {

    // ── AUTH ──────────────────────────────────────────────
    '/auth/token': {
      post: {
        tags: ['Auth'],
        summary: 'Obtener token JWT',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              examples: {
                password: {
                  summary: 'Login con email/password',
                  value: { grant_type: 'password', email: 'amara@example.com', password: 'pass1234' }
                },
                client_credentials: {
                  summary: 'OAuth2 client credentials',
                  value: { grant_type: 'client_credentials', client_id: 'client_demo', client_secret: 'secret_demo' }
                }
              },
              schema: {
                type: 'object',
                properties: {
                  grant_type: { type: 'string', enum: ['password', 'client_credentials'] },
                  email: { type: 'string' }, password: { type: 'string' },
                  client_id: { type: 'string' }, client_secret: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Token generado correctamente' },
          401: { description: 'Credenciales inválidas' }
        }
      }
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Registrar nuevo usuario',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              example: { name: 'Kofi Asante', email: 'kofi@example.com', phone: '+2331234567', password: 'mipass123', country: 'CM', role: 'customer' },
              schema: {
                type: 'object', required: ['name', 'email', 'phone', 'password', 'country'],
                properties: {
                  name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
                  password: { type: 'string' }, country: { type: 'string', example: 'GQ' },
                  role: { type: 'string', enum: ['customer', 'circular_autorizada', 'rider', 'supplier'] }
                }
              }
            }
          }
        },
        responses: { 201: { description: 'Usuario creado' }, 409: { description: 'Email ya registrado' } }
      }
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'], summary: 'Renovar token con refresh_token',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { refresh_token: { type: 'string' } } } } }
        },
        responses: { 200: { description: 'Token renovado' }, 401: { description: 'Refresh token inválido' } }
      }
    },
    '/auth/kyc': {
      post: {
        tags: ['Auth'], summary: 'Enviar documentación KYC',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              example: { document_type: 'passport', document_number: 'P1234567' },
              schema: { type: 'object', required: ['document_type', 'document_number'], properties: { document_type: { type: 'string' }, document_number: { type: 'string' } } }
            }
          }
        },
        responses: { 200: { description: 'Documentación recibida, revisión en 24-48h' } }
      }
    },

    // ── MONEY ─────────────────────────────────────────────
    '/money/balance': {
      get: {
        tags: ['XenderMoney'], summary: 'Consultar saldo de wallet',
        responses: { 200: { description: 'Balances en EUR, USD, XAF, XOF' }, 403: { description: 'KYC no verificado' } }
      }
    },
    '/money/topup': {
      post: {
        tags: ['XenderMoney'], summary: 'Recargar saldo',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              example: { amount: 50000, currency: 'XAF', method: 'mtn_money' },
              schema: {
                type: 'object', required: ['amount', 'method'],
                properties: {
                  amount: { type: 'number' }, currency: { type: 'string', enum: ['EUR', 'USD', 'XAF', 'XOF'] },
                  method: { type: 'string', enum: ['mtn_money', 'orange_money', 'bank_card', 'bank_transfer'] }
                }
              }
            }
          }
        },
        responses: { 200: { description: 'Saldo recargado' } }
      }
    },
    '/money/send': {
      post: {
        tags: ['XenderMoney'], summary: 'Envío internacional de dinero',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              example: { amount: 100, currency: 'EUR', recipient_id: 'usr_001', dest_currency: 'XAF' },
              schema: {
                type: 'object', required: ['amount', 'currency', 'recipient_id', 'dest_currency'],
                properties: {
                  amount: { type: 'number' }, currency: { type: 'string' },
                  recipient_id: { type: 'string', description: 'ID, email o teléfono del destinatario' },
                  dest_currency: { type: 'string' }, reference: { type: 'string' }
                }
              }
            }
          }
        },
        responses: { 200: { description: 'Pago completado con tipo de cambio aplicado' }, 422: { description: 'Saldo insuficiente' } }
      }
    },
    '/money/transfer': {
      post: {
        tags: ['XenderMoney'], summary: 'Transferencia P2P gratuita',
        requestBody: {
          required: true,
          content: { 'application/json': { example: { amount: 5000, currency: 'XAF', to_user: 'usr_002', note: 'Para el almuerzo' } } }
        },
        responses: { 200: { description: 'Transferencia completada sin comisión' } }
      }
    },
    '/money/withdraw': {
      post: {
        tags: ['XenderMoney'], summary: 'Reintegro / Cash-out',
        requestBody: {
          required: true,
          content: { 'application/json': { example: { amount: 20000, currency: 'XAF', method: 'mtn_money', destination: '+2371234567' } } }
        },
        responses: { 200: { description: 'Retiro procesado' } }
      }
    },
    '/money/history': {
      get: {
        tags: ['XenderMoney'], summary: 'Historial de transacciones',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['send', 'withdraw', 'p2p', 'topup', 'qr_payment'] } },
          { name: 'currency', in: 'query', schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Lista paginada de transacciones' } }
      }
    },
    '/money/qr/pay': {
      post: {
        tags: ['XenderMoney'], summary: 'Pago con código QR',
        requestBody: {
          required: true,
          content: { 'application/json': { example: { merchant_qr: 'QR_MERCH_001', amount: 3500, pin: '1234' } } }
        },
        responses: { 200: { description: 'Pago QR completado' } }
      }
    },

    // ── SHOP ──────────────────────────────────────────────
    '/shop/products': {
      get: {
        tags: ['XenderShop'], summary: 'Listar productos', security: [],
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['electronics', 'energy', 'accessories'] } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'min_price', in: 'query', schema: { type: 'number' } },
          { name: 'max_price', in: 'query', schema: { type: 'number' } }
        ],
        responses: { 200: { description: 'Catálogo paginado con precios EUR y XAF' } }
      }
    },
    '/shop/cart': {
      get: { tags: ['XenderShop'], summary: 'Ver carrito', responses: { 200: { description: 'Contenido del carrito con totales' } } },
      post: {
        tags: ['XenderShop'], summary: 'Añadir al carrito',
        requestBody: { required: true, content: { 'application/json': { example: { product_id: 'prod_001', quantity: 2 } } } },
        responses: { 200: { description: 'Producto añadido' } }
      }
    },
    '/shop/orders': {
      post: {
        tags: ['XenderShop'], summary: 'Crear pedido desde carrito',
        requestBody: { required: true, content: { 'application/json': { example: { payment_currency: 'EUR', delivery_address: 'Calle Principal 12, Malabo' } } } },
        responses: { 201: { description: 'Pedido creado con tracking_id y puntos de fidelidad' } }
      },
      get: { tags: ['XenderShop'], summary: 'Mis pedidos', responses: { 200: { description: 'Lista paginada de pedidos' } } }
    },

    // ── BIGSHOP ───────────────────────────────────────────
    '/bigshop/products': {
      get: {
        tags: ['XenderBigShop'], summary: 'Productos grocery disponibles', security: [],
        responses: { 200: { description: 'Productos con tiempo de entrega < 30 min' } }
      }
    },
    '/bigshop/orders': {
      post: {
        tags: ['XenderBigShop'], summary: 'Pedido grocery express',
        requestBody: { required: true, content: { 'application/json': { example: { items: [{ product_id: 'groc_001', quantity: 2 }], delivery_address: 'Barrio Centro, Bata' } } } },
        responses: { 201: { description: 'Pedido asignado a rider disponible' } }
      }
    },

    // ── DELIVERY ──────────────────────────────────────────
    '/delivery/track/{tracking_id}': {
      get: {
        tags: ['XenderDelivery'], summary: 'Tracking de pedido', security: [],
        parameters: [{ name: 'tracking_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Estado y ubicación actual del envío' } }
      }
    },
    '/delivery/riders': {
      get: { tags: ['XenderDelivery'], summary: 'Riders disponibles (circular_autorizada)', responses: { 200: { description: 'Lista de riders con estado' } } },
      post: {
        tags: ['XenderDelivery'], summary: 'Registrar rider',
        requestBody: { required: true, content: { 'application/json': { example: { name: 'Ahmed Diop', phone: '+2371234567', zone: 'Malabo Norte', vehicle: 'moto' } } } },
        responses: { 201: { description: 'Rider registrado' } }
      }
    },

    // ── BILLS ─────────────────────────────────────────────
    '/bills/providers': {
      get: {
        tags: ['Facturas'], summary: 'Listar proveedores de facturas', security: [],
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['electricity', 'water', 'airtime', 'internet', 'tv'] } },
          { name: 'country', in: 'query', schema: { type: 'string', example: 'GQ' } }
        ],
        responses: { 200: { description: '12 proveedores para GQ y CM' } }
      }
    },
    '/bills/pay': {
      post: {
        tags: ['Facturas'], summary: 'Pagar factura',
        requestBody: { required: true, content: { 'application/json': { example: { provider_id: 'bp_001', amount: 15000, reference_number: 'ACC-123456' } } } },
        responses: { 200: { description: 'Pago procesado con código de confirmación' } }
      }
    },
    '/bills/history': {
      get: { tags: ['Facturas'], summary: 'Historial de pagos', responses: { 200: { description: 'Pagos paginados con filtro por categoría' } } }
    },

    // ── TONTINAS ──────────────────────────────────────────
    '/tontines': {
      post: {
        tags: ['Tontinas'], summary: 'Crear grupo de tontina',
        requestBody: { required: true, content: { 'application/json': { example: { name: 'Tontina Familia 2026', contribution_amount: 10000, currency: 'XAF', frequency: 'monthly', max_members: 10 } } } },
        responses: { 201: { description: 'Tontina creada con código de invitación' } }
      },
      get: { tags: ['Tontinas'], summary: 'Mis tontinas', responses: { 200: { description: 'Tontinas como admin o miembro' } } }
    },
    '/tontines/{id}/join': {
      post: {
        tags: ['Tontinas'], summary: 'Unirse a una tontina',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Unido. Si completa el grupo, comienza automáticamente' } }
      }
    },
    '/tontines/{id}/contribute': {
      post: {
        tags: ['Tontinas'], summary: 'Hacer aportación de la ronda',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Aportación registrada. Si es la última, se paga al beneficiario' } }
      }
    },

    // ── CARDS ─────────────────────────────────────────────
    '/cards': {
      post: {
        tags: ['Tarjetas Virtuales'], summary: 'Crear tarjeta virtual EUR/USD',
        requestBody: { required: true, content: { 'application/json': { example: { label: 'Compras Amazon', currency: 'EUR', initial_load: 50 } } } },
        responses: { 201: { description: 'Tarjeta creada con número, CVV y caducidad' } }
      },
      get: { tags: ['Tarjetas Virtuales'], summary: 'Mis tarjetas (número enmascarado)', responses: { 200: { description: 'Lista de tarjetas activas/canceladas' } } }
    },
    '/cards/{id}/freeze': {
      patch: {
        tags: ['Tarjetas Virtuales'], summary: 'Congelar o descongelar tarjeta',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Estado de congelación alternado' } }
      }
    },
    '/cards/{id}': {
      delete: {
        tags: ['Tarjetas Virtuales'], summary: 'Cancelar tarjeta (devuelve saldo al wallet)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Tarjeta cancelada y saldo devuelto' } }
      }
    },

    // ── LOYALTY ───────────────────────────────────────────
    '/loyalty/balance': {
      get: { tags: ['Fidelización'], summary: 'Saldo de puntos', responses: { 200: { description: 'Puntos, equivalente en €, tasa de acumulación' } } }
    },
    '/loyalty/redeem': {
      post: {
        tags: ['Fidelización'], summary: 'Canjear puntos por descuento (mínimo 100)',
        requestBody: { required: true, content: { 'application/json': { example: { points: 200 } } } },
        responses: { 200: { description: '200 puntos = 2€ de descuento' } }
      }
    },

    // ── COUPONS ───────────────────────────────────────────
    '/coupons/validate/{code}': {
      get: {
        tags: ['Cupones'], summary: 'Validar cupón',
        parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string', example: 'BIENVENIDO20' } }],
        responses: { 200: { description: 'Cupón válido con detalles' }, 400: { description: 'Expirado o agotado' } }
      }
    },
    '/coupons/preview': {
      post: {
        tags: ['Cupones'], summary: 'Ver descuento antes de pagar',
        requestBody: { required: true, content: { 'application/json': { example: { code: 'BIENVENIDO20', total_eur: 100, total_xaf: 65000 } } } },
        responses: { 200: { description: 'Desglose del descuento' } }
      }
    },

    // ── REFERRALS ─────────────────────────────────────────
    '/referrals/code': {
      get: { tags: ['Referidos'], summary: 'Mi código de referido + estadísticas', responses: { 200: { description: 'Código + bonus por referido = 500 pts' } } }
    },
    '/referrals/apply': {
      post: {
        tags: ['Referidos'], summary: 'Aplicar código de referido',
        requestBody: { required: true, content: { 'application/json': { example: { referral_code: 'INV_AMARA_001' } } } },
        responses: { 200: { description: '+200 pts bienvenida al nuevo usuario' } }
      }
    },

    // ── BUSINESS ──────────────────────────────────────────
    '/business/accounts': {
      post: {
        tags: ['XenderBusiness'], summary: 'Crear cuenta empresarial',
        requestBody: { required: true, content: { 'application/json': { example: { company_name: 'Distribuidora Mbá SL', tax_id: 'GQ123456', industry: 'commerce', country: 'GQ' } } } },
        responses: { 201: { description: 'Cuenta activada con plan básico (10.000€/mes)' } }
      }
    },
    '/business/bulk/payments': {
      post: {
        tags: ['XenderBusiness'], summary: 'Pago masivo (nóminas, disbursements)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              example: {
                recipients: [{ user_id: 'usr_001', amount: 150000 }, { user_id: 'usr_002', amount: 200000 }],
                currency: 'XAF', description: 'Nómina Mayo 2026'
              }
            }
          }
        },
        responses: { 201: { description: 'Lote procesado, resultado por destinatario' } }
      }
    },
    '/business/invoices': {
      post: {
        tags: ['XenderBusiness'], summary: 'Crear factura digital',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              example: {
                client_name: 'Juan Cliente', client_email: 'juan@example.com', currency: 'EUR',
                items: [{ description: 'Consultoría técnica 10h', quantity: 10, unit_price: 50 }],
                due_date: '2026-06-30'
              }
            }
          }
        },
        responses: { 201: { description: 'Factura con IVA 19% calculado automáticamente' } }
      },
      get: { tags: ['XenderBusiness'], summary: 'Mis facturas emitidas', responses: { 200: { description: 'Facturas con filtro por estado' } } }
    },
    '/business/analytics': {
      get: { tags: ['XenderBusiness'], summary: 'Panel analítico del negocio', responses: { 200: { description: 'Ingresos, facturas, pagos masivos, volumen 30 días' } } }
    },

    // ── NOTIFICATIONS ─────────────────────────────────────
    '/notifications': {
      get: {
        tags: ['Notificaciones'], summary: 'Mis notificaciones in-app',
        parameters: [
          { name: 'read', in: 'query', schema: { type: 'boolean' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['info', 'success', 'warning', 'error'] } }
        ],
        responses: { 200: { description: 'Notificaciones con contador de no leídas' } }
      }
    },
    '/notifications/read-all': {
      patch: { tags: ['Notificaciones'], summary: 'Marcar todas como leídas', responses: { 200: { description: 'Contador de notificaciones marcadas' } } }
    },

    // ── UTILS ─────────────────────────────────────────────
    '/utils/rates': {
      get: {
        tags: ['Utilidades'], summary: 'Tipos de cambio', security: [],
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', example: 'EUR' } },
          { name: 'to', in: 'query', schema: { type: 'string', example: 'XAF' } }
        ],
        responses: { 200: { description: 'Tasas BCEAO + mercado' } }
      }
    },
    '/utils/convert': {
      get: {
        tags: ['Utilidades'], summary: 'Calculadora de conversión', security: [],
        parameters: [
          { name: 'amount', in: 'query', schema: { type: 'number', default: 100 } },
          { name: 'from', in: 'query', schema: { type: 'string', default: 'EUR' } },
          { name: 'to', in: 'query', schema: { type: 'string', default: 'XAF' } }
        ],
        responses: { 200: { description: 'Importe con comisión 2% desglosada' } }
      }
    },
    '/utils/health': {
      get: {
        tags: ['Utilidades'], summary: 'Health check', security: [],
        responses: { 200: { description: 'Estado de todos los servicios' } }
      }
    },

    // ── ADMIN ─────────────────────────────────────────────
    '/admin/stats': {
      get: { tags: ['Admin'], summary: 'Estadísticas globales (admin)', responses: { 200: { description: 'Usuarios, transacciones, pedidos, riders' } } }
    },
    '/admin/users': {
      get: { tags: ['Admin'], summary: 'Listar usuarios (admin)', responses: { 200: { description: 'Usuarios con filtros' } } }
    },
    '/admin/transactions': {
      get: { tags: ['Admin'], summary: 'Últimas transacciones (admin)', responses: { 200: { description: 'Transacciones recientes del sistema' } } }
    }
  }
};

module.exports = swaggerSpec;
