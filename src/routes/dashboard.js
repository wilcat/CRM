// src/routes/dashboard.js
// Visao geral (resumo) para a tela inicial — admin e financeiro.

const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { h } = require('../utils/http');

const router = express.Router();

router.get('/', auth, requireRole('admin', 'financeiro'), h(async (req, res) => {
  const vendas = await db.all('vendas');
  const financeiro = await db.all('financeiro');
  const produtos = await db.all('produtos');

  const totalVendasMes = vendas.reduce((s, v) => s + Number(v.valor || 0), 0);
  const saldoAberto = f => Number(f.valor) - Number(f.valor_pago || 0);
  const aReceber = financeiro.filter(f => f.tipo === 'RECEBER' && (f.situacao === 'PENDENTE' || f.situacao === 'PARCIAL')).reduce((s, f) => s + saldoAberto(f), 0);
  const aPagar = financeiro.filter(f => f.tipo === 'PAGAR' && (f.situacao === 'PENDENTE' || f.situacao === 'PARCIAL')).reduce((s, f) => s + saldoAberto(f), 0);
  const estoqueBaixo = produtos.filter(p => Number(p.estoque) <= Number(p.estoque_minimo || 0));

  const vendasPorSituacao = {};
  vendas.forEach(v => { vendasPorSituacao[v.situacao] = (vendasPorSituacao[v.situacao] || 0) + 1; });

  const hoje = new Date();
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    dias.push(d.toISOString().slice(0, 10));
  }
  const vendasPorDia = dias.map(dia => ({
    data: dia,
    total: vendas.filter(v => v.data === dia).reduce((s, v) => s + Number(v.valor || 0), 0)
  }));

  const ultimasVendasRaw = vendas.slice(-8).reverse();
  const ultimasVendas = await Promise.all(ultimasVendasRaw.map(async v => ({ ...v, cliente: await db.get('clientes', v.cliente_id) })));

  res.json({
    totalVendasMes,
    qtdVendas: vendas.length,
    aReceber,
    aPagar,
    estoqueBaixo,
    vendasPorSituacao,
    vendasPorDia,
    ultimasVendas
  });
}));

module.exports = router;
