// src/middleware/security.js
// Headers de seguranca basicos aplicados a todas as respostas (estaticas e API).

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
  });
  next();
}

module.exports = { securityHeaders };
