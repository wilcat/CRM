// src/db/index.js
// Seletor de banco de dados. Escolhe entre PostgreSQL (recomendado para
// producao / rede interna) ou arquivo JSON local (rapido para testes, sem
// precisar instalar nada) — conforme a variavel de ambiente DATABASE_URL.
//
//   - DATABASE_URL definida  -> usa PostgreSQL (postgres.js)
//   - DATABASE_URL ausente   -> usa arquivo JSON (json.js)
//
// O resto do sistema (src/server.js, scripts/seed.js) so conhece este
// arquivo e usa sempre a mesma interface (all/get/insert/update/remove/
// reset), entao a troca de banco nao exige nenhuma mudanca em outro lugar
// do codigo.

require('../config/env'); // garante que o .env foi carregado antes de escolher o driver

if (process.env.DATABASE_URL) {
  console.log('🗄️  Banco de dados: PostgreSQL');
  module.exports = require('./postgres');
} else {
  console.log('🗄️  Banco de dados: arquivo local (data/database.json) — defina DATABASE_URL para usar PostgreSQL.');
  module.exports = require('./json');
}
