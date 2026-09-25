// scripts/seed.js - popula o banco com dados de demonstracao (assincrono)
const bcrypt = require('bcryptjs');
const db = require('../src/db');

async function run() {
  await db.reset(async (d) => {
    // Usuarios padrao (um de cada papel, para facilitar os testes)
    await d.insert('users', {
      nome: 'Administrador',
      email: 'admin@fluxoerp.com',
      senha_hash: bcrypt.hashSync('admin123', 8),
      papel: 'admin'
    });
    await d.insert('users', {
      nome: 'Vendedor Demo',
      email: 'vendedor@fluxoerp.com',
      senha_hash: bcrypt.hashSync('vendedor123', 8),
      papel: 'vendedor'
    });
    await d.insert('users', {
      nome: 'Financeiro Demo',
      email: 'financeiro@fluxoerp.com',
      senha_hash: bcrypt.hashSync('financeiro123', 8),
      papel: 'financeiro'
    });

    // Clientes
    const c1 = await d.insert('clientes', { nome: 'CONSUMIDOR', documento: '', telefone: '', email: '', tipo: 'PF' });
    const c2 = await d.insert('clientes', { nome: 'POLY COSMETICOS DISTRIBUIDORA', documento: '12.345.678/0001-00', telefone: '(87) 99999-0001', email: 'contato@poly.com', tipo: 'PJ' });
    const c3 = await d.insert('clientes', { nome: 'CASA DAS BALAS LTDA', documento: '23.456.789/0001-00', telefone: '(87) 99999-0002', email: 'financeiro@casadasbalas.com', tipo: 'PJ' });
    const c4 = await d.insert('clientes', { nome: 'PARÓQUIA DO SAGRADO CORAÇÃO DE JESUS', documento: '34.567.890/0001-00', telefone: '(87) 99999-0003', email: '', tipo: 'PJ' });
    const c5 = await d.insert('clientes', { nome: 'MUNICIPIO DE JUCATI', documento: '45.678.901/0001-00', telefone: '(87) 99999-0004', email: 'gabinete@jucati.pe.gov.br', tipo: 'PJ' });

    // Produtos
    const p1 = await d.insert('produtos', { nome: 'Bala de goma sortida 1kg', codigo: 'PRD-001', preco: 20.0, custo: 12.0, estoque: 150, estoque_minimo: 20, categoria: 'Doces' });
    const p2 = await d.insert('produtos', { nome: 'Kit cosmético facial', codigo: 'PRD-002', preco: 80.0, custo: 45.0, estoque: 8, estoque_minimo: 10, categoria: 'Cosméticos' });
    const p3 = await d.insert('produtos', { nome: 'Impressão gráfica A3 (unid)', codigo: 'PRD-003', preco: 4.25, custo: 1.5, estoque: 500, estoque_minimo: 50, categoria: 'Gráfica' });
    const p4 = await d.insert('produtos', { nome: 'Serviço de manutenção mensal', codigo: 'SRV-001', preco: 600.0, custo: 0, estoque: 9999, estoque_minimo: 0, categoria: 'Serviços' });

    // Vendas (refletindo o padrao da tela: numero, cliente, data, situacao, valor)
    const v1 = await d.insert('vendas', { numero: 12273, cliente_id: c1.id, data: '2026-06-30', situacao: 'ENTREGUE_PAGO', segmento: 'RAPIDA', valor: 20.0 });
    await d.insert('itens_venda', { venda_id: v1.id, produto_id: p1.id, quantidade: 1, preco_unit: 20.0 });

    const v2 = await d.insert('vendas', { numero: 12272, cliente_id: c2.id, data: '2026-06-30', situacao: 'CONCRETIZADA', segmento: 'DIGITAL', valor: 160.0 });
    await d.insert('itens_venda', { venda_id: v2.id, produto_id: p2.id, quantidade: 2, preco_unit: 80.0 });

    const v3 = await d.insert('vendas', { numero: 12271, cliente_id: c3.id, data: '2026-06-30', situacao: 'EM_PRODUCAO', segmento: 'OFFSET', valor: 495.0 });
    await d.insert('itens_venda', { venda_id: v3.id, produto_id: p1.id, quantidade: 24, preco_unit: 20.0 });

    const v4 = await d.insert('vendas', { numero: 12270, cliente_id: c4.id, data: '2026-06-30', situacao: 'CONCRETIZADA', segmento: 'RAPIDA', valor: 350.0 });

    const v5 = await d.insert('vendas', { numero: 12268, cliente_id: c5.id, data: '2026-06-30', situacao: 'PRONTO_ENTREGA', segmento: 'OFFSET', valor: 4308.84 });

    // Estoque - movimentos
    await d.insert('estoque_movimentos', { produto_id: p1.id, tipo: 'SAIDA', quantidade: 25, motivo: 'Venda #12273 / #12271', data: '2026-06-30' });
    await d.insert('estoque_movimentos', { produto_id: p2.id, tipo: 'SAIDA', quantidade: 2, motivo: 'Venda #12272', data: '2026-06-30' });
    await d.insert('estoque_movimentos', { produto_id: p3.id, tipo: 'ENTRADA', quantidade: 200, motivo: 'Compra fornecedor', data: '2026-06-28' });

    // Orcamentos
    const o1 = await d.insert('orcamentos', { numero: 5001, cliente_id: c3.id, data: '2026-06-29', validade: '2026-07-15', situacao: 'ENVIADO', segmento: 'RAPIDA', valor: 980.0 });
    await d.insert('itens_orcamento', { orcamento_id: o1.id, produto_id: p1.id, quantidade: 49, preco_unit: 20.0 });

    // Ordens de servico
    await d.insert('ordens_servico', { numero: 301, cliente_id: c4.id, descricao: 'Manutenção preventiva sistema de som', data_abertura: '2026-06-25', situacao: 'EM_ANDAMENTO', valor: 250.0 });
    await d.insert('ordens_servico', { numero: 300, cliente_id: c2.id, descricao: 'Instalação de balcão expositor', data_abertura: '2026-06-20', situacao: 'CONCLUIDA', valor: 400.0 });
    await d.insert('ordens_servico', { numero: 299, cliente_id: c5.id, descricao: 'Orçamento de rede elétrica do gabinete', data_abertura: '2026-06-18', situacao: 'ABERTA', valor: 0 });

    // Financeiro
    await d.insert('financeiro', { tipo: 'RECEBER', descricao: 'Venda #12272 - POLY COSMETICOS', valor: 160.0, valor_pago: 60.0, pagamentos: [{ valor: 60.0, data: '2026-07-01' }], vencimento: '2026-07-10', situacao: 'PARCIAL' });
    await d.insert('financeiro', { tipo: 'RECEBER', descricao: 'Venda #12270 - Paróquia', valor: 350.0, valor_pago: 350.0, pagamentos: [{ valor: 350.0, data: '2026-06-28' }], vencimento: '2026-07-05', situacao: 'PAGO', pago_em: '2026-06-28' });
    await d.insert('financeiro', { tipo: 'PAGAR', descricao: 'Fornecedor de matéria-prima', valor: 1200.0, valor_pago: 0, pagamentos: [], vencimento: '2026-07-08', situacao: 'PENDENTE' });
    await d.insert('financeiro', { tipo: 'PAGAR', descricao: 'Aluguel do galpão', valor: 2200.0, valor_pago: 2200.0, pagamentos: [{ valor: 2200.0, data: '2026-06-27' }], vencimento: '2026-07-05', situacao: 'PAGO', pago_em: '2026-06-27' });

    // Producao grafica (Rapida / Digital / Offset)
    await d.insert('producoes', { numero: 101, setor: 'RAPIDA', cliente_id: c3.id, descricao: '1000 panfletos A5 4x0', data_abertura: '2026-06-29', situacao: 'CONCLUIDA', valor: 180.0, financeiro_gerado: false });
    await d.insert('producoes', { numero: 102, setor: 'DIGITAL', cliente_id: c2.id, descricao: '50 cartões de visita em papel couché', data_abertura: '2026-06-30', situacao: 'EM_ANDAMENTO', valor: 90.0 });
    await d.insert('producoes', { numero: 103, setor: 'OFFSET', cliente_id: c5.id, descricao: '5000 folhetos institucionais 4x4', data_abertura: '2026-06-25', situacao: 'ABERTA', valor: 1450.0 });
  });

  console.log('✔ Banco de dados populado com dados de demonstração.');
  console.log('  admin@fluxoerp.com      | admin123      (acesso total)');
  console.log('  vendedor@fluxoerp.com   | vendedor123   (vendas, produtos, clientes, estoque, orçamentos, OS)');
  console.log('  financeiro@fluxoerp.com | financeiro123 (financeiro e relatórios de caixa)');
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch(err => { console.error('Erro ao popular o banco:', err.message); process.exit(1); });
}
module.exports = run;
