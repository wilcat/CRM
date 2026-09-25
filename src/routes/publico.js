// src/routes/publico.js
// Consulta publica de pedido (sem login) — usada pela pagina
// public/rastreio.html. O cliente acessa pelo numero do pedido (impresso
// no cupom) ou pelo QR Code, sem precisar de usuario/senha.
// So expoe o que o cliente precisa ver: nao inclui custo, documento do
// cliente, nem nenhum dado de outros pedidos.

const express = require('express');
const db = require('../db');
const { h } = require('../utils/http');

const router = express.Router();

router.get('/pedido/:numero', h(async (req, res) => {
  const numero = parseInt(req.params.numero, 10);
  if (!numero) return res.status(400).json({ error: 'Número de pedido inválido.' });

  const venda = (await db.all('vendas')).find(v => v.numero === numero);
  if (!venda) return res.status(404).json({ error: 'Pedido não encontrado. Confira o número.' });

  const cliente = await db.get('clientes', venda.cliente_id);
  const itensRaw = await db.all('itens_venda', it => it.venda_id === venda.id);
  const itens = await Promise.all(itensRaw.map(async it => {
    const produto = await db.get('produtos', it.produto_id);
    return { produto: produto ? produto.nome : 'Item', quantidade: it.quantidade };
  }));

  const producao = venda.producao_id ? await db.get('producoes', venda.producao_id) : null;
  const financeiro = venda.financeiro_id ? await db.get('financeiro', venda.financeiro_id) : null;

  res.json({
    numero: venda.numero,
    data: venda.data,
    cliente_nome: cliente ? cliente.nome : null,
    segmento: venda.segmento,
    situacao_venda: venda.situacao,
    situacao_producao: producao ? producao.situacao : null,
    itens,
    valor: venda.valor,
    valor_pago: financeiro ? Number(financeiro.valor_pago || 0) : (venda.situacao === 'ENTREGUE_PAGO' ? venda.valor : 0),
    pago: financeiro ? financeiro.situacao === 'PAGO' : venda.situacao === 'ENTREGUE_PAGO'
  });
}));

module.exports = router;
