// src/routes/funcionarios.js
// Funcionarios (dados sensiveis de salario — somente admin): CRUD padrao +
// vale (adiantamento) + contracheque.

const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { makeCrud } = require('./crud');
const { calcularINSS } = require('../services/funcionarios');
const { log } = require('../utils/audit');
const { h } = require('../utils/http');

const router = express.Router();

router.use('/', makeCrud('funcionarios', {
  readRoles: ['admin'],
  createRoles: ['admin'],
  onCreate: async (row) => {
    if (row.vales === undefined) await db.update('funcionarios', row.id, { vales: [] });
  }
}));

// Registra um vale (adiantamento salarial). Body: { valor, descricao }.
router.post('/:id/vale', auth, requireRole('admin'), h(async (req, res) => {
  const f = await db.get('funcionarios', req.params.id);
  if (!f) return res.status(404).json({ error: 'Não encontrado.' });
  const valor = Number(req.body.valor);
  if (!valor || valor <= 0) return res.status(400).json({ error: 'Informe um valor de vale válido.' });
  const vales = [...(f.vales || []), { valor, data: new Date().toISOString().slice(0, 10), descricao: req.body.descricao || '' }];
  const row = await db.update('funcionarios', f.id, { vales });
  log(req, 'REGISTRAR_VALE', 'funcionarios', f.id, { valor, descricao: req.body.descricao || '' });
  res.json(row);
}));

router.get('/:id/contracheque', auth, requireRole('admin'), h(async (req, res) => {
  const f = await db.get('funcionarios', req.params.id);
  if (!f) return res.status(404).json({ error: 'Não encontrado.' });
  const mes = req.query.mes || new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const valesDoMes = (f.vales || []).filter(v => (v.data || '').startsWith(mes));
  const totalVales = Math.round(valesDoMes.reduce((s, v) => s + Number(v.valor || 0), 0) * 100) / 100;
  const inssEstimado = calcularINSS(Number(f.salario || 0));
  res.json({ funcionario: f, mes, valesDoMes, totalVales, inssEstimado });
}));

module.exports = router;
