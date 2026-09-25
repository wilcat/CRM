// src/utils/http.js
// Helpers pequenos usados pelas rotas da API.

// Envolve um handler async, repassando qualquer erro pro Express (sem isso,
// uma excecao dentro de um handler "async" some silenciosamente).
function h(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// Handler de erro generico do Express (registrado por ultimo em server.js).
function errorHandler(err, req, res, next) {
  if (err && err.message === 'ORIGEM_BLOQUEADA') {
    return res.status(err.status || 403).json({ error: 'Origem não permitida.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload muito grande.' });
  }
  console.error('Erro na API:', err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
}

module.exports = { h, errorHandler };
