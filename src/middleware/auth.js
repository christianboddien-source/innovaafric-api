'use strict';

const jwt    = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { error } = require('../helpers/response');

const JWT_SECRET = process.env.JWT_SECRET || 'innovaafric_secret_2026';

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return error(res, 'Token requerido', 401);
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return error(res, 'Token inválido o expirado', 401);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return error(res, 'Permisos insuficientes', 403);
    next();
  };
}

function requireKYC(req, res, next) {
  prisma.user.findUnique({ where: { id: req.user.sub } })
    .then(user => {
      if (!user || user.kycStatus !== 'verified') {
        return error(res, 'KYC no verificado. Complete la verificación de identidad.', 403);
      }
      next();
    })
    .catch(() => error(res, 'Error verificando KYC', 500));
}

module.exports = { requireAuth, requireRole, requireKYC };
