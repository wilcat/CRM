// src/routes/relatorios.js
// Relatorios: vendas por periodo e caixa (entradas/saidas com saldo acumulado).

const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { h } = require('../utils/http');

const router = express.Router();

router.get('/vendas', auth, requireRole('admin', 'financeiro'), h(async (req, res) => {
  const { inicio, fim } = req.query;
  let vendas = await db.all('vendas');
  if (inicio) vendas = vendas.filter(v => v.data >= inicio);
  if (fim) vendas = vendas.filter(v => v.data <= fim);
  vendas = await Promise.all(vendas.map(async v => ({ ...v, cliente: await db.get('clientes', v.cliente_id) })));
  const total = vendas.reduce((s, v) => s + Number(v.valor || 0), 0);
  res.json({ vendas, total, quantidade: vendas.length });
}));

router.get('/caixa', auth, requireRole('admin', 'financeiro'), h(async (req, res) => {
  const { inicio, fim } = req.query;

  let eventos = [];
  (await db.all('financeiro')).forEach(f => {
    (f.pagamentos || []).forEach((p, idx) => {
      eventos.push({
        data: p.data,
        tipo: f.tipo,
        descricao: f.descricao + (f.pagamentos.length > 1 ? ` (pagamento ${idx + 1}/${f.pagamentos.length})` : ''),
        valor: p.valor,
        forma_pagamento: p.forma_pagamento || null
      });
    });
  });

  if (inicio) eventos = eventos.filter(e => e.data >= inicio);
  if (fim) eventos = eventos.filter(e => e.data <= fim);
  eventos.sort((a, b) => a.data.localeCompare(b.data));

  let saldo = 0;
  const linhas = eventos.map(e => {
    saldo += e.tipo === 'RECEBER' ? Number(e.valor) : -Number(e.valor);
    return { ...e, pago_em: e.data, saldo_acumulado: Math.round(saldo * 100) / 100 };
  });
  const totalEntradas = eventos.filter(e => e.tipo === 'RECEBER').reduce((s, e) => s + Number(e.valor), 0);
  const totalSaidas = eventos.filter(e => e.tipo === 'PAGAR').reduce((s, e) => s + Number(e.valor), 0);

  res.json({ linhas, totalEntradas, totalSaidas, saldo: Math.round((totalEntradas - totalSaidas) * 100) / 100 });
}));

module.exports = router;
