// src/routes/producoes.js
// Producao: listagem com itens da venda vinculada, numeracao automatica,
// CRUD padrao e mudanca de situacao (com efeitos em vendas/financeiro).

const express = require('express');
const db = require('../db');
const { SETOR_LABEL } = require('../constants');
const { auth, requireRole } = require('../middleware/auth');
const { makeCrud } = require('./crud');
const { calcularProximoNumero } = require('../services/configuracoes');
const { log } = require('../utils/audit');
const { h } = require('../utils/http');

const router = express.Router();

async function enrichProducao(p) {
  const venda = p.venda_id ? await db.get('vendas', p.venda_id) : null;
  let itens = [];
  if (venda) {
    const itensVenda = await db.all('itens_venda', it => it.venda_id === venda.id);
    itens = await Promise.all(itensVenda.map(async it => ({ ...it, produto: await db.get('produtos', it.produto_id) })));
  }
  return { ...p, venda_numero: venda ? venda.numero : null, itens };
}

router.get('/', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const producoes = await db.all('producoes');
  res.json(await Promise.all(producoes.map(enrichProducao)));
}));

router.get('/:id', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const p = await db.get('producoes', req.params.id);
  if (!p) return res.status(404).json({ error: 'Não encontrado.' });
  res.json(await enrichProducao(p));
}));

router.post('/', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const numero = await calcularProximoNumero('producoes', 'proximo_numero_producao', 100);
  const row = await db.insert('producoes', { ...req.body, numero });
  log(req, 'CRIAR', 'producoes', row.id, req.body);
  res.status(201).json(row);
}));

// PUT /:id/situacao precisa ser registrado ANTES do CRUD generico para que a
// rota mais especifica seja casada primeiro (mesmo comportamento do codigo original).
router.put('/:id/situacao', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const row = await db.update('producoes', req.params.id, { situacao: req.body.situacao });
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'ALTERAR_SITUACAO', 'producoes', row.id, { situacao: req.body.situacao });

  if (req.body.situacao === 'CONCLUIDA' && row.venda_id) {
    const venda = await db.get('vendas', row.venda_id);
    if (venda && venda.situacao !== 'ENTREGUE_PAGO' && venda.situacao !== 'CANCELADA') {
      await db.update('vendas', venda.id, { situacao: 'PRONTO_ENTREGA' });
    }
  }

  if (req.body.situacao === 'CONCLUIDA' && !row.financeiro_gerado && !row.venda_id && Number(row.valor) > 0) {
    await db.insert('financeiro', {
      tipo: 'RECEBER',
      descricao: `Produção #${row.numero} (${SETOR_LABEL[row.setor] || row.setor}) - ${row.descricao || ''}`.trim(),
      valor: row.valor,
      valor_pago: 0,
      pagamentos: [],
      vencimento: new Date().toISOString().slice(0, 10),
      situacao: 'PENDENTE'
    });
    await db.update('producoes', row.id, { financeiro_gerado: true });
  }

  res.json(await db.get('producoes', row.id));
}));

router.use('/', makeCrud('producoes', { readRoles: ['admin', 'vendedor', 'financeiro'], createRoles: ['admin', 'vendedor'] }));

module.exports = router;
