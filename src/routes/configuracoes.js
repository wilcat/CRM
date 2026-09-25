// src/routes/configuracoes.js
// Configuracoes (dados da empresa + numeracao) — leitura para qualquer
// usuario logado, edicao somente admin.

const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { getConfiguracoes } = require('../services/configuracoes');
const { log } = require('../utils/audit');
const { h } = require('../utils/http');

const router = express.Router();

// Leitura liberada pra qualquer usuario logado — os dados da empresa
// aparecem nos cupons/recibos impressos por vendedor, financeiro etc.
router.get('/', auth, h(async (req, res) => {
  res.json(await getConfiguracoes());
}));

// Edicao (dados da empresa) — somente admin.
router.put('/', auth, requireRole('admin'), h(async (req, res) => {
  const { empresa_nome, empresa_documento, empresa_telefone, empresa_endereco, empresa_email } = req.body;
  await getConfiguracoes(); // garante que a linha existe
  const row = await db.update('configuracoes', 1, { empresa_nome, empresa_documento, empresa_telefone, empresa_endereco, empresa_email });
  log(req, 'EDITAR', 'configuracoes', 1, { empresa_nome, empresa_documento, empresa_telefone, empresa_endereco, empresa_email });
  res.json(row);
}));

// Redefine o "piso" da numeracao de cada modulo — somente admin. O sistema
// nunca gera um numero menor ou igual a um que ja existe (evita duplicar),
// entao isso so tem efeito pratico se for maior que o maior numero atual,
// ou se os registros antigos ja tiverem sido apagados.
router.post('/resetar-numeros', auth, requireRole('admin'), h(async (req, res) => {
  const { venda, orcamento, producao, os } = req.body;
  const patch = {};
  if (venda !== undefined) patch.proximo_numero_venda = parseInt(venda) || null;
  if (orcamento !== undefined) patch.proximo_numero_orcamento = parseInt(orcamento) || null;
  if (producao !== undefined) patch.proximo_numero_producao = parseInt(producao) || null;
  if (os !== undefined) patch.proximo_numero_os = parseInt(os) || null;
  await getConfiguracoes();
  const row = await db.update('configuracoes', 1, patch);
  log(req, 'EDITAR', 'configuracoes', 1, { numeracao: patch });
  res.json(row);
}));

module.exports = router;
