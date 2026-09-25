// src/services/configuracoes.js
// Configuracoes do sistema (dados da empresa + numeracao).
// Linha unica (id=1). Se ainda nao existir (banco antigo sem seed rodado
// de novo), cria com os valores padrao na primeira leitura.

const db = require('../db');

async function getConfiguracoes() {
  let config = await db.get('configuracoes', 1);
  if (!config) config = await db.insert('configuracoes', { empresa_nome: 'Fluxo ERP' });
  return config;
}

// Calcula o proximo numero de um modulo, respeitando o "piso" configurado
// em Configuracoes (se houver) sem nunca colidir com um numero existente.
async function calcularProximoNumero(collection, campoConfig, base) {
  const [existentes, config] = await Promise.all([db.all(collection), getConfiguracoes()]);
  const maxExistente = existentes.length ? Math.max(...existentes.map(r => r.numero || 0)) : 0;
  const piso = config[campoConfig] ? config[campoConfig] - 1 : 0;
  return Math.max(maxExistente, piso, base) + 1;
}

module.exports = { getConfiguracoes, calcularProximoNumero };
