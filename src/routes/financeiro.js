// src/routes/financeiro.js
// Financeiro: CRUD padrao + registro de pagamento + mudanca de situacao.

const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { makeCrud } = require('./crud');
const { registrarPagamentoFinanceiro } = require('../services/vendas');
const { log } = require('../utils/audit');
const { h } = require('../utils/http');

const router = express.Router();

// POST /:id/pagamento e PUT /:id/situacao registrados ANTES do CRUD generico
// para que as rotas mais especificas sejam casadas primeiro (mesmo
// comportamento do codigo original).
router.post('/:id/pagamento', auth, requireRole('admin', 'financeiro'), h(async (req, res) => {
  const fin = await db.get('financeiro', req.params.id);
  if (!fin) return res.status(404).json({ error: 'Não encontrado.' });
  const valor = Number(req.body.valor);
  const saldo = Math.round((Number(fin.valor) - Number(fin.valor_pago || 0)) * 100) / 100;
  if (!valor || valor <= 0) return res.status(400).json({ error: 'Informe um valor de pagamento válido.' });
  if (valor > saldo + 0.01) return res.status(400).json({ error: `O valor não pode ser maior que o saldo em aberto (${saldo.toFixed(2)}).` });
  const row = await registrarPagamentoFinanceiro(fin.id, valor, req.body.forma_pagamento);
  log(req, 'REGISTRAR_PAGAMENTO', 'financeiro', fin.id, { valor, forma_pagamento: req.body.forma_pagamento });
  res.json(row);
}));

router.put('/:id/situacao', auth, requireRole('admin', 'financeiro'), h(async (req, res) => {
  log(req, 'ALTERAR_SITUACAO', 'financeiro', Number(req.params.id), { situacao: req.body.situacao });
  if (req.body.situacao === 'PAGO') {
    const fin = await db.get('financeiro', req.params.id);
    if (!fin) return res.status(404).json({ error: 'Não encontrado.' });
    const saldo = Number(fin.valor) - Number(fin.valor_pago || 0);
    const row = saldo > 0.01 ? await registrarPagamentoFinanceiro(fin.id, saldo) : fin;
    return res.json(row);
  }
  const row = await db.update('financeiro', req.params.id, { situacao: req.body.situacao });
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  res.json(row);
}));

router.use('/', makeCrud('financeiro', {
  readRoles: ['admin', 'financeiro'],
  createRoles: ['admin', 'financeiro'],
  onCreate: async (row) => {
    if (row.valor_pago === undefined || row.pagamentos === undefined) {
      await db.update('financeiro', row.id, { valor_pago: row.valor_pago || 0, pagamentos: row.pagamentos || [] });
    }
  }
}));

module.exports = router;
