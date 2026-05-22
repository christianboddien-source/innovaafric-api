'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

// Calcula el descuento aplicado a un pedido
function applyDiscount(coupon, total_eur, total_xaf) {
  if (coupon.discount_type === 'percentage') {
    const disc_eur = Math.round(total_eur * coupon.discount_value / 100 * 100) / 100;
    const disc_xaf = Math.round(total_xaf * coupon.discount_value / 100);
    return { disc_eur, disc_xaf, final_eur: total_eur - disc_eur, final_xaf: total_xaf - disc_xaf };
  }
  if (coupon.discount_type === 'fixed_eur') {
    const disc_eur = Math.min(coupon.discount_value, total_eur);
    return { disc_eur, disc_xaf: 0, final_eur: total_eur - disc_eur, final_xaf: total_xaf };
  }
  if (coupon.discount_type === 'fixed_xaf') {
    const disc_xaf = Math.min(coupon.discount_value, total_xaf);
    return { disc_eur: 0, disc_xaf, final_eur: total_eur, final_xaf: total_xaf - disc_xaf };
  }
  return { disc_eur: 0, disc_xaf: 0, final_eur: total_eur, final_xaf: total_xaf };
}

// GET /v1/coupons/validate/:code — Validar cupón
router.get('/validate/:code', requireAuth, (req, res) => {
  const coupon = DB.coupons.find(c => c.code === req.params.code.toUpperCase());
  if (!coupon) return error(res, 'Cupón no encontrado', 404);
  if (!coupon.active) return error(res, 'Este cupón ya no está activo', 400);
  if (new Date(coupon.expires_at) < new Date()) return error(res, 'Cupón expirado', 400);
  if (coupon.uses >= coupon.max_uses) return error(res, 'Cupón agotado', 400);

  return success(res, {
    code: coupon.code,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    description: coupon.description,
    min_order_eur: coupon.min_order_eur || null,
    min_order_xaf: coupon.min_order_xaf || null,
    expires_at: coupon.expires_at,
    uses_remaining: coupon.max_uses - coupon.uses,
    valid: true
  });
});

// POST /v1/coupons/preview — Ver descuento antes de confirmar pedido
router.post('/preview', requireAuth, (req, res) => {
  const { code, total_eur, total_xaf } = req.body;
  if (!code || !total_eur) return error(res, 'Campos requeridos: code, total_eur', 400);

  const coupon = DB.coupons.find(c => c.code === code.toUpperCase());
  if (!coupon || !coupon.active) return error(res, 'Cupón inválido o inactivo', 404);
  if (new Date(coupon.expires_at) < new Date()) return error(res, 'Cupón expirado', 400);
  if (coupon.uses >= coupon.max_uses) return error(res, 'Cupón agotado', 400);

  if (coupon.min_order_eur && total_eur < coupon.min_order_eur) {
    return error(res, `Pedido mínimo: ${coupon.min_order_eur}€`, 422);
  }
  if (coupon.min_order_xaf && total_xaf < coupon.min_order_xaf) {
    return error(res, `Pedido mínimo: ${coupon.min_order_xaf} XAF`, 422);
  }

  const discount = applyDiscount(coupon, total_eur, total_xaf || 0);
  return success(res, {
    code: coupon.code,
    description: coupon.description,
    original_total_eur: total_eur,
    discount_eur: discount.disc_eur,
    discount_xaf: discount.disc_xaf,
    final_total_eur: discount.final_eur,
    final_total_xaf: discount.final_xaf
  });
});

// GET /v1/coupons — Listar cupones activos (admin)
router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  return success(res, {
    coupons: DB.coupons,
    total: DB.coupons.length,
    active: DB.coupons.filter(c => c.active).length
  });
});

// POST /v1/coupons — Crear cupón (admin)
router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const { code, discount_type, discount_value, min_order_eur, min_order_xaf, max_uses, expires_at, description } = req.body;
  if (!code || !discount_type || !discount_value || !max_uses || !expires_at) {
    return error(res, 'Campos requeridos: code, discount_type, discount_value, max_uses, expires_at', 400);
  }

  const validTypes = ['percentage', 'fixed_eur', 'fixed_xaf'];
  if (!validTypes.includes(discount_type)) return error(res, `discount_type no válido: ${validTypes.join(', ')}`, 400);
  if (DB.coupons.find(c => c.code === code.toUpperCase())) return error(res, 'Ya existe un cupón con ese código', 409);

  const coupon = {
    id: `coup_${uuidv4().slice(0, 8)}`,
    code: code.toUpperCase(),
    discount_type, discount_value,
    min_order_eur: min_order_eur || null,
    min_order_xaf: min_order_xaf || null,
    max_uses, uses: 0,
    active: true,
    expires_at,
    description: description || null,
    created_at: new Date().toISOString()
  };
  DB.coupons.push(coupon);
  return success(res, coupon, 201);
});

// PATCH /v1/coupons/:id/deactivate — Desactivar cupón (admin)
router.patch('/:id/deactivate', requireAuth, requireRole('admin'), (req, res) => {
  const coupon = DB.coupons.find(c => c.id === req.params.id);
  if (!coupon) return error(res, 'Cupón no encontrado', 404);
  coupon.active = false;
  return success(res, { id: coupon.id, code: coupon.code, active: false });
});

module.exports = router;
module.exports.applyDiscount = applyDiscount;
