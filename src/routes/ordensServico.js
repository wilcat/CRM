// src/routes/ordensServico.js
// Ordens de servico: numeracao automatica na criacao + CRUD padrao +
// mudanca de situacao.

const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { makeCrud } = require('./crud');
const { calcularProximoNumero } = require('../services/configuracoes');
const { log } = require('../utils/audit');
const { h } = require('../utils/http');

const router = express.Router();

router.post('/', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const numero = await calcularProximoNumero('ordens_servico', 'proximo_numero_os', 300);
  const row = await db.insert('ordens_servico', { ...req.body, numero });
  log(req, 'CRIAR', 'ordens_servico', row.id, req.body);
  res.status(201).json(row);
}));

router.use('/', makeCrud('ordens_servico', { readRoles: ['admin', 'vendedor', 'financeiro'], createRoles: ['admin', 'vendedor'] }));

router.put('/:id/situacao', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const row = await db.update('ordens_servico', req.params.id, { situacao: req.body.situacao });
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'ALTERAR_SITUACAO', 'ordens_servico', row.id, { situacao: req.body.situacao });
  res.json(row);
}));

module.exports = router;
