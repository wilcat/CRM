// src/middleware/auth.js
// Autenticacao (JWT) e autorizacao por papel de usuario.

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user.papel === 'admin' || roles.includes(req.user.papel)) return next();
    return res.status(403).json({ error: 'Você não tem permissão para acessar este recurso.' });
  };
}

module.exports = { auth, requireRole };
