'use strict';

require('dotenv').config();
const app  = require('./app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   INNOVAAFRIC API v1.0 — Running           ║
║   http://localhost:${PORT}/v1               ║
║                                            ║
║   POST /v1/auth/token                      ║
║   POST /v1/auth/register                   ║
║   GET  /v1/money/balance                   ║
║   POST /v1/money/send                      ║
║   POST /v1/money/withdraw                  ║
║   POST /v1/money/transfer                  ║
║   POST /v1/money/qr/pay                    ║
║   GET  /v1/shop/products                   ║
║   POST /v1/shop/orders                     ║
║   GET  /v1/bigshop/products                ║
║   POST /v1/bigshop/orders                  ║
║   GET  /v1/delivery/track/:id              ║
║   GET  /v1/utils/rates                     ║
║   GET  /v1/utils/health                    ║
╚════════════════════════════════════════════╝
  `);
});
