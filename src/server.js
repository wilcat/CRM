// src/server.js
// Ponto de entrada do Fluxo ERP: sobe o Express, aplica middlewares globais,
// monta a API (src/routes) e serve os arquivos estaticos do frontend (public/).
// Toda a logica de negocio esta organizada em src/ — este arquivo cuida apenas
// da inicializacao do servidor.

require('./config/env'); // valida JWT_SECRET / PORT / PUBLIC_URL (precisa vir antes de tudo)

const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { PORT } = require('./config/env');
const { securityHeaders } = require('./middleware/security');
const routes = require('./routes');
const { errorHandler } = require('./utils/http');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // confia nos headers de proxy (ex: Cloudflare Tunnel) para obter o IP real

// CORS restrito: o app roda no MESMO origin (frontend e API servidos juntos),
// então normalmente nem é preciso CORS. Permitimos apenas origens explícitas
// listadas em CORS_ORIGINS (separadas por vírgula no .env) para evitar que
// outros sites façam chamadas autenticadas a partir do navegador do usuário.
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = new Set(corsOrigins);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // req sem Origin (não-browser / mesmo-origin via endereço) deixa passar
    // Sem lista configurada, mantém-se tolerante refletindo a origem (compatibilidade).
    // Se CORS_ORIGINS estiver definido no .env, apenas as origens da lista passam.
    if (allowedOrigins.size === 0 || allowedOrigins.has(origin)) return cb(null, true);
    const err = new Error('ORIGEM_BLOQUEADA');
    err.status = 403;
    return cb(err);
  },
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));

// Headers de seguranca — registrados ANTES do express.static para que
// arquivos estaticos e API recebam igualmente os headers.
app.use(securityHeaders);

app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  setHeaders: (res) => res.set('Cache-Control', 'no-store'),
}));

// API
app.use('/api', routes);

// Handler de erro generico (sempre por ultimo)
app.use(errorHandler);

// ---------- Inicializacao ----------
async function bootstrap() {
  let users;
  try {
    users = await db.all('users');
  } catch (err) {
    console.error('\n❌ Não consegui consultar o banco de dados.');
    console.error(`   Detalhe: ${err.message}`);
    console.error('   Se estiver usando PostgreSQL, confira se o schema já foi criado:');
    console.error('   psql -U <usuario> -d <banco> -f db/schema.sql\n');
    process.exit(1);
  }

  if (users.length === 0) {
    console.log('Nenhum usuário encontrado — populando banco com dados de demonstração...');
    await require('../scripts/seed')();
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Fluxo ERP rodando em http://localhost:${PORT}`);
    console.log(`   Login padrão: admin@fluxoerp.com / admin123\n`);
  });
}

bootstrap();
