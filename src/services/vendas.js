// src/services/vendas.js
// Regras de sincronizacao entre Vendas x Financeiro x Producao.
// Chamadas quando uma venda e criada ou tem sua situacao alterada.

const db = require('../db');
const { calcularProximoNumero } = require('./configuracoes');

async function sincronizarFinanceiroVenda(vendaId) {
  const venda = await db.get('vendas', vendaId);
  if (!venda) return;

  if (!venda.financeiro_id) {
    if (venda.situacao === 'CANCELADA') return;
    const cliente = await db.get('clientes', venda.cliente_id);
    const jaPago = venda.situacao === 'ENTREGUE_PAGO';
    const patch = {
      tipo: 'RECEBER',
      descricao: `Venda #${venda.numero}${cliente ? ' - ' + cliente.nome : ''}`,
      valor: venda.valor,
      valor_pago: jaPago ? venda.valor : 0,
      pagamentos: jaPago ? [{ valor: venda.valor, data: new Date().toISOString().slice(0, 10) }] : [],
      vencimento: venda.data || new Date().toISOString().slice(0, 10),
      situacao: jaPago ? 'PAGO' : 'PENDENTE'
    };
    if (jaPago) patch.pago_em = new Date().toISOString().slice(0, 10);
    const fin = await db.insert('financeiro', patch);
    await db.update('vendas', venda.id, { financeiro_id: fin.id });
  } else {
    const fin = await db.get('financeiro', venda.financeiro_id);
    if (fin) {
      if (venda.situacao === 'ENTREGUE_PAGO' && fin.situacao !== 'PAGO') {
        await registrarPagamentoFinanceiro(fin.id, Number(fin.valor) - Number(fin.valor_pago || 0));
      } else if (venda.situacao === 'CANCELADA' && Number(fin.valor_pago || 0) === 0) {
        await db.remove('financeiro', fin.id);
        await db.update('vendas', venda.id, { financeiro_id: null });
      }
    }
  }
}

async function registrarPagamentoFinanceiro(financeiroId, valorPagamento, formaPagamento) {
  const fin = await db.get('financeiro', financeiroId);
  if (!fin) return null;
  const valor = Math.round(Number(valorPagamento) * 100) / 100;
  if (!valor || valor <= 0) return fin;

  const pagamentos = [...(fin.pagamentos || []), { valor, data: new Date().toISOString().slice(0, 10), forma_pagamento: formaPagamento || null }];
  const valorPago = Math.round((Number(fin.valor_pago || 0) + valor) * 100) / 100;
  const quitado = valorPago >= Number(fin.valor) - 0.01;
  const patch = { pagamentos, valor_pago: valorPago, situacao: quitado ? 'PAGO' : 'PARCIAL' };
  if (quitado) patch.pago_em = new Date().toISOString().slice(0, 10);
  return await db.update('financeiro', fin.id, patch);
}

async function sincronizarProducaoVenda(vendaId) {
  const venda = await db.get('vendas', vendaId);
  if (!venda) return;

  if (!venda.producao_id) {
    if (venda.situacao === 'CANCELADA') return;
    const numero = await calcularProximoNumero('producoes', 'proximo_numero_producao', 100);
    const prod = await db.insert('producoes', {
      numero,
      setor: venda.segmento || 'DIGITAL',
      cliente_id: venda.cliente_id,
      descricao: `Referente à venda #${venda.numero}`,
      data_abertura: new Date().toISOString().slice(0, 10),
      situacao: 'ABERTA',
      valor: venda.valor,
      venda_id: venda.id
    });
    await db.update('vendas', venda.id, { producao_id: prod.id });
  } else {
    const prod = await db.get('producoes', venda.producao_id);
    if (!prod) return;
    if (venda.situacao === 'CANCELADA' && prod.situacao !== 'CONCLUIDA' && prod.situacao !== 'CANCELADA') {
      await db.update('producoes', prod.id, { situacao: 'CANCELADA' });
    } else if (venda.segmento && prod.setor !== venda.segmento) {
      await db.update('producoes', prod.id, { setor: venda.segmento });
    }
  }
}

module.exports = { sincronizarFinanceiroVenda, sincronizarProducaoVenda, registrarPagamentoFinanceiro };
