// src/routes/vendas.js
// Vendas: listagem detalhada, cupom (QR Code), busca por numero,
// criacao/edicao/exclusao com efeitos em estoque/financeiro/producao e
// mudanca de situacao.

const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const { PUBLIC_URL } = require('../config/env');
const { auth, requireRole } = require('../middleware/auth');
const { calcularProximoNumero } = require('../services/configuracoes');
const { sincronizarFinanceiroVenda, sincronizarProducaoVenda } = require('../services/vendas');
const { log } = require('../utils/audit');
const { sanitizeUser } = require('../utils/users');
const { h } = require('../utils/http');

const router = express.Router();

// Monta o registro completo da venda (cliente, vendedor, itens) — mesmo
// formato usado nas rotas GET /, GET /:id e GET /buscar/:numero.
async function enrichVenda(v) {
  const cliente = await db.get('clientes', v.cliente_id);
  const vendedor = v.vendedor_id ? sanitizeUser(await db.get('users', v.vendedor_id)) : null;
  const itensRaw = await db.all('itens_venda', it => it.venda_id === v.id);
  const itens = await Promise.all(itensRaw.map(async it => ({ ...it, produto: await db.get('produtos', it.produto_id) })));
  return { ...v, cliente, vendedor, itens };
}

router.get('/', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const vendas = await db.all('vendas');
  res.json(await Promise.all(vendas.map(enrichVenda)));
}));

// Gera o cupom de acompanhamento (QR Code + link) pra imprimir na venda.
// Usado pelo botao "Emitir cupom" na tela de Vendas.
router.get('/:id/cupom', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const v = await db.get('vendas', req.params.id);
  if (!v) return res.status(404).json({ error: 'Não encontrado.' });
  const trackingUrl = `${PUBLIC_URL}/rastreio.html?numero=${v.numero}`;
  const qrDataUrl = await QRCode.toDataURL(trackingUrl, { margin: 1, width: 220 });
  res.json({ numero: v.numero, trackingUrl, qrDataUrl });
}));

// Busca de pedido pelo numero — usada pela tela "Consultar Pedido" (balcao),
// quando o operador escaneia o codigo de barras OU o QR Code impresso no
// cupom do cliente. Diferente da consulta publica, aqui o retorno e o
// registro completo da venda (mesmo formato de GET /:id), ja que
// e uma tela interna, autenticada, pra equipe.
router.get('/buscar/:numero', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const numero = parseInt(req.params.numero, 10);
  if (!numero) return res.status(400).json({ error: 'Número de pedido inválido.' });
  const v = (await db.all('vendas')).find(x => x.numero === numero);
  if (!v) return res.status(404).json({ error: 'Pedido não encontrado. Confira o número ou o código escaneado.' });

  const producao = v.producao_id ? await db.get('producoes', v.producao_id) : null;
  const financeiro = v.financeiro_id ? await db.get('financeiro', v.financeiro_id) : null;

  res.json({ ...(await enrichVenda(v)), producao, financeiro });
}));

router.get('/:id', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const v = await db.get('vendas', req.params.id);
  if (!v) return res.status(404).json({ error: 'Não encontrado.' });
  res.json(await enrichVenda(v));
}));

router.post('/', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const { cliente_id, data, situacao, segmento, itens = [] } = req.body;
  const proximoNumero = await calcularProximoNumero('vendas', 'proximo_numero_venda', 12000);
  const valor = itens.reduce((sum, it) => sum + (Number(it.quantidade) * Number(it.preco_unit)), 0);

  const venda = await db.insert('vendas', { numero: proximoNumero, cliente_id, data, situacao: situacao || 'EM_PRODUCAO', segmento, valor, vendedor_id: req.user.id });
  log(req, 'CRIAR', 'vendas', venda.id, { numero: proximoNumero, cliente_id, situacao, segmento, valor });

  for (const it of itens) {
    await db.insert('itens_venda', { venda_id: venda.id, produto_id: it.produto_id, quantidade: it.quantidade, preco_unit: it.preco_unit });
    const produto = await db.get('produtos', it.produto_id);
    if (produto) await db.update('produtos', produto.id, { estoque: (produto.estoque || 0) - Number(it.quantidade) });
  }

  await sincronizarFinanceiroVenda(venda.id);
  await sincronizarProducaoVenda(venda.id);
  res.status(201).json(await db.get('vendas', venda.id));
}));

router.put('/:id/situacao', auth, requireRole('admin'), h(async (req, res) => {
  const row = await db.update('vendas', req.params.id, { situacao: req.body.situacao });
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'ALTERAR_SITUACAO', 'vendas', row.id, { situacao: req.body.situacao });
  await sincronizarFinanceiroVenda(row.id);
  await sincronizarProducaoVenda(row.id);
  res.json(await db.get('vendas', row.id));
}));

router.put('/:id', auth, requireRole('admin'), h(async (req, res) => {
  const row = await db.update('vendas', req.params.id, req.body);
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EDITAR', 'vendas', row.id, req.body);
  await sincronizarFinanceiroVenda(row.id);
  await sincronizarProducaoVenda(row.id);
  res.json(await db.get('vendas', row.id));
}));

router.delete('/:id', auth, requireRole('admin'), h(async (req, res) => {
  const venda = await db.get('vendas', req.params.id);
  if (!venda) return res.status(404).json({ error: 'Não encontrado.' });

  // Devolve o estoque dos itens vendidos e apaga os itens
  for (const it of await db.all('itens_venda', it => it.venda_id === venda.id)) {
    const produto = await db.get('produtos', it.produto_id);
    if (produto) await db.update('produtos', produto.id, { estoque: (produto.estoque || 0) + Number(it.quantidade) });
    await db.remove('itens_venda', it.id);
  }

  // Remove o financeiro pendente vinculado
  if (venda.financeiro_id) {
    const fin = await db.get('financeiro', venda.financeiro_id);
    if (fin && fin.situacao === 'PENDENTE') await db.remove('financeiro', fin.id);
  }

  // Desvincula orçamento e produção que apontam para esta venda
  for (const o of await db.all('orcamentos', o => Number(o.venda_id) === venda.id)) {
    await db.update('orcamentos', o.id, { venda_id: null });
  }
  for (const p of await db.all('producoes', p => Number(p.venda_id) === venda.id)) {
    await db.update('producoes', p.id, { venda_id: null });
  }

  const ok = await db.remove('vendas', venda.id);
  if (!ok) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EXCLUIR', 'vendas', Number(req.params.id), {});
  res.status(204).end();
}));

module.exports = router;
