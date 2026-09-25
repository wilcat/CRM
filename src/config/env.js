// src/config/env.js
// Carrega e valida as variaveis de ambiente do sistema em um unico lugar.
// Deve ser o PRIMEIRO require do app (server.js), pois outros modulos
// (ex: src/db) dependem de DATABASE_URL ja estar definida no processo.

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('\n❌ Falha na inicialização: JWT_SECRET não está definido ou é curto demais.');
  console.error('   Defina uma string longa e aleatória no .env (mín. 32 caracteres).');
  console.error('   Para gerar: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3000;

// URL base usada para montar o link de rastreio dentro do QR Code do cupom.
// Em producao, defina PUBLIC_URL no .env com o endereco real do servidor
// (ex: http://192.168.0.15:3000), senao o link so funciona na propria maquina.
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

module.exports = { JWT_SECRET, PORT, PUBLIC_URL };
