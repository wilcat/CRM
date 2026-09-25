// src/routes/logs.js
// Auditoria: consulta de logs (somente admin).

const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { h } = require('../utils/http');

const router = express.Router();

router.get('/', auth, requireRole('admin'), h(async (req, res) => {
  const { q, acao, inicio, fim, limite } = req.query;
  let logs = await db.all('logs');

  if (q) {
    const termo = String(q).toLowerCase();
    logs = logs.filter(l =>
      (l.usuario_nome || '').toLowerCase().includes(termo) ||
      (l.acao || '').toLowerCase().includes(termo) ||
      (l.entidade || '').toLowerCase().includes(termo)
    );
  }
  if (acao) logs = logs.filter(l => l.acao === acao);
  if (inicio) logs = logs.filter(l => String(l.criado_em).slice(0, 10) >= inicio);
  if (fim) logs = logs.filter(l => String(l.criado_em).slice(0, 10) <= fim);

  logs = logs.slice().reverse();
  if (limite) logs = logs.slice(0, parseInt(limite, 10) || 100);

  // total de eventos por acao (para filtros)
  const todas = await db.all('logs');
  const acoes = {};
  todas.forEach(l => { acoes[l.acao] = (acoes[l.acao] || 0) + 1; });

  res.json({ logs, total: logs.length, acoes });
}));

module.exports = router;
