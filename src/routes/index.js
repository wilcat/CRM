// src/routes/index.js
// Agregador das rotas da API. server.js monta tudo com um unico require.

const express = require('express');
const db = require('../db');
const { makeCrud } = require('./crud');

const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/configuracoes', require('./configuracoes'));
router.use('/publico', require('./publico'));
router.use('/users', require('./users'));
router.use('/funcionarios', require('./funcionarios'));
router.use('/ordens_servico', require('./ordensServico'));
router.use('/producoes', require('./producoes'));
router.use('/vendas', require('./vendas'));
router.use('/orcamentos', require('./orcamentos'));
router.use('/financeiro', require('./financeiro'));
router.use('/relatorios', require('./relatorios'));
router.use('/logs', require('./logs'));
router.use('/dashboard', require('./dashboard'));

// ---------- Modulos padrao (CRUD generico com permissoes) ----------
// Ao excluir registros referenciados por outros, desvinculamos as referencias
// antes de apagar (senao o PostgreSQL bloqueia com erro de chave estrangeira).
router.use('/clientes', makeCrud('clientes', {
  readRoles: ['admin', 'vendedor', 'financeiro'],
  createRoles: ['admin', 'vendedor'],
  onBeforeDelete: async (id) => {
    const n = Number(id);
    for (const [tabela, coluna] of [['vendas', 'cliente_id'], ['orcamentos', 'cliente_id'], ['ordens_servico', 'cliente_id'], ['producoes', 'cliente_id']]) {
      for (const row of await db.all(tabela, r => Number(r[coluna]) === n)) {
        await db.update(tabela, row.id, { [coluna]: null });
      }
    }
  }
}));
router.use('/produtos', makeCrud('produtos', {
  readRoles: ['admin', 'vendedor', 'financeiro'],
  createRoles: ['admin', 'vendedor'],
  onBeforeDelete: async (id) => {
    const n = Number(id);
    for (const [tabela, coluna] of [['itens_venda', 'produto_id'], ['itens_orcamento', 'produto_id'], ['estoque_movimentos', 'produto_id']]) {
      for (const row of await db.all(tabela, r => Number(r[coluna]) === n)) {
        await db.update(tabela, row.id, { [coluna]: null });
      }
    }
  }
}));
router.use('/itens_venda', makeCrud('itens_venda', { readRoles: ['admin', 'vendedor', 'financeiro'], createRoles: ['admin', 'vendedor'] }));
router.use('/estoque_movimentos', makeCrud('estoque_movimentos', {
  readRoles: ['admin', 'vendedor'],
  createRoles: ['admin', 'vendedor'],
  onCreate: async (mov) => {
    const produto = await db.get('produtos', mov.produto_id);
    if (!produto) return;
    const delta = mov.tipo === 'ENTRADA' ? Number(mov.quantidade) : -Number(mov.quantidade);
    await db.update('produtos', produto.id, { estoque: (produto.estoque || 0) + delta });
  }
}));
router.use('/itens_orcamento', makeCrud('itens_orcamento', { readRoles: ['admin', 'vendedor'], createRoles: ['admin', 'vendedor'] }));

module.exports = router;
