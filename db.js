// db.js
// Seletor de banco de dados. Escolhe entre PostgreSQL (recomendado para
// producao / rede interna) ou arquivo JSON local (rapido para testes, sem
// precisar instalar nada) — conforme a variavel de ambiente DATABASE_URL.
//
//   - DATABASE_URL definida  -> usa PostgreSQL (db-postgres.js)
//   - DATABASE_URL ausente   -> usa arquivo JSON (db-json.js)
//
// O resto do sistema (server.js, seed.js) so conhece este arquivo e usa
// sempre a mesma interface (all/get/insert/update/remove/reset), entao a
// troca de banco nao exige nenhuma mudanca em outro lugar do codigo.

if (process.env.DATABASE_URL) {
  console.log('🗄️  Banco de dados: PostgreSQL');
  module.exports = require('./db-postgres');
} else {
  console.log('🗄️  Banco de dados: arquivo local (data/database.json) — defina DATABASE_URL para usar PostgreSQL.');
  module.exports = require('./db-json');
}
