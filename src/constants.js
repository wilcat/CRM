// src/constants.js
// Constantes compartilhadas entre os modulos da API.

// Rotulo exibido para cada setor/segmento de grafica (producao).
const SETOR_LABEL = { RAPIDA: 'Gráfica Rápida', DIGITAL: 'Gráfica Digital', OFFSET: 'Gráfica Offset' };

// Colecoes/tabelas conhecidas pelo sistema — usado pelos drivers de banco
// (src/db/json.js e src/db/postgres.js) para validar nomes de tabela.
const COLLECTIONS = [
  'users', 'clientes', 'produtos', 'vendas', 'itens_venda',
  'estoque_movimentos', 'orcamentos', 'itens_orcamento',
  'ordens_servico', 'financeiro', 'producoes', 'configuracoes', 'funcionarios',
  'logs'
];

module.exports = { SETOR_LABEL, COLLECTIONS };
