// src/routes/orcamentos.js
// Orcamentos: listagem detalhada, criacao com numeracao automatica,
// edicao (com substitricao de itens), exclusao e aprovacao (gera venda).

const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { calcularProximoNumero } = require('../services/configuracoes');
const { sincronizarFinanceiroVenda, sincronizarProducaoVenda } = require('../services/vendas');
const { log } = require('../utils/audit');
const { h } = require('../utils/http');

const router = express.Router();

async function enrichOrcamento(o) {
  const itensRaw = await db.all('itens_orcamento', it => it.orcamento_id === o.id);
  const itens = await Promise.all(itensRaw.map(async it => ({ ...it, produto: await db.get('produtos', it.produto_id) })));
  return {
    ...o,
    cliente: await db.get('clientes', o.cliente_id),
    venda_numero: o.venda_id ? (await db.get('vendas', o.venda_id) || {}).numero : null,
    itens
  };
}

router.get('/', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const orcamentos = await db.all('orcamentos');
  res.json(await Promise.all(orcamentos.map(enrichOrcamento)));
}));

router.get('/:id', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const o = await db.get('orcamentos', req.params.id);
  if (!o) return res.status(404).json({ error: 'Não encontrado.' });
  res.json(await enrichOrcamento(o));
}));

router.post('/', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const { cliente_id, data, validade, situacao, segmento, itens = [] } = req.body;
  const proximoNumero = await calcularProximoNumero('orcamentos', 'proximo_numero_orcamento', 5000);
  const valor = itens.reduce((sum, it) => sum + (Number(it.quantidade) * Number(it.preco_unit)), 0);
  const orc = await db.insert('orcamentos', { numero: proximoNumero, cliente_id, data, validade, situacao: situacao || 'ENVIADO', segmento, valor });
  log(req, 'CRIAR', 'orcamentos', orc.id, { numero: proximoNumero, cliente_id, segmento, valor });
  for (const it of itens) {
    await db.insert('itens_orcamento', { orcamento_id: orc.id, produto_id: it.produto_id, quantidade: it.quantidade, preco_unit: it.preco_unit });
  }
  res.status(201).json(await db.get('orcamentos', orc.id));
}));

// PUT /:id/situacao registrado antes de PUT /:id para que a rota mais
// especifica seja casada primeiro (mesmo comportamento do codigo original).
router.put('/:id/situacao', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const row = await db.update('orcamentos', req.params.id, { situacao: req.body.situacao });
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'ALTERAR_SITUACAO', 'orcamentos', row.id, { situacao: req.body.situacao });

  if (req.body.situacao === 'APROVADO' && !row.venda_id) {
    const itens = await db.all('itens_orcamento', it => it.orcamento_id === row.id);
    const proximoNumero = await calcularProximoNumero('vendas', 'proximo_numero_venda', 12000);
    const venda = await db.insert('vendas', {
      numero: proximoNumero,
      cliente_id: row.cliente_id,
      data: new Date().toISOString().slice(0, 10),
      situacao: 'EM_PRODUCAO',
      segmento: row.segmento,
      valor: row.valor,
      orcamento_id: row.id
    });
    for (const it of itens) {
      await db.insert('itens_venda', { venda_id: venda.id, produto_id: it.produto_id, quantidade: it.quantidade, preco_unit: it.preco_unit });
      const produto = await db.get('produtos', it.produto_id);
      if (produto) await db.update('produtos', produto.id, { estoque: (produto.estoque || 0) - Number(it.quantidade) });
    }
    await db.update('orcamentos', row.id, { venda_id: venda.id });
    await sincronizarFinanceiroVenda(venda.id);
    await sincronizarProducaoVenda(venda.id);
    log(req, 'APROVAR_ORCAMENTO_GEROU_VENDA', 'vendas', venda.id, { orcamento_id: row.id, numero: venda.numero });
  }

  res.json(await db.get('orcamentos', row.id));
}));

router.put('/:id', auth, requireRole('admin'), h(async (req, res) => {
  const { cliente_id, data, validade, segmento, itens } = req.body;
  const patch = {};
  if (cliente_id !== undefined) patch.cliente_id = cliente_id;
  if (data !== undefined) patch.data = data;
  if (validade !== undefined) patch.validade = validade;
  if (segmento !== undefined) patch.segmento = segmento;
  if (Array.isArray(itens)) {
    const antigos = await db.all('itens_orcamento', it => it.orcamento_id === Number(req.params.id));
    for (const it of antigos) await db.remove('itens_orcamento', it.id);
    for (const it of itens) {
      await db.insert('itens_orcamento', { orcamento_id: Number(req.params.id), produto_id: it.produto_id, quantidade: it.quantidade, preco_unit: it.preco_unit });
    }
    patch.valor = itens.reduce((s, it) => s + Number(it.quantidade) * Number(it.preco_unit), 0);
  }
  const row = await db.update('orcamentos', req.params.id, patch);
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EDITAR', 'orcamentos', row.id, patch);
  res.json(await db.get('orcamentos', row.id));
}));

router.delete('/:id', auth, requireRole('admin'), h(async (req, res) => {
  const itensOrc = await db.all('itens_orcamento', it => it.orcamento_id === Number(req.params.id));
  for (const it of itensOrc) await db.remove('itens_orcamento', it.id);
  const ok = await db.remove('orcamentos', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EXCLUIR', 'orcamentos', Number(req.params.id), {});
  res.status(204).end();
}));

module.exports = router;
