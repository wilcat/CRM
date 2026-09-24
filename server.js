// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('\n❌ Falha na inicialização: JWT_SECRET não está definido ou é curto demais.');
  console.error('   Defina uma string longa e aleatória no .env (mín. 32 caracteres).');
  console.error('   Para gerar: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
  process.exit(1);
}
const PORT = process.env.PORT || 3000;
const SETOR_LABEL = { RAPIDA: 'Gráfica Rápida', DIGITAL: 'Gráfica Digital', OFFSET: 'Gráfica Offset' };
// URL base usada para montar o link de rastreio dentro do QR Code do cupom.
// Em producao, defina PUBLIC_URL no .env com o endereço real do servidor
// (ex: http://192.168.0.15:3000), senao o link so funciona na propria maquina.
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;

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

// ---------- Headers de segurança básicos ----------
// Registrado ANTES do express.static para que arquivos estáticos e API
// recebam igualmente os headers de segurança.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders: (res) => res.set('Cache-Control', 'no-store'),
}));

// ---------- Rate limiting no login (força bruta) ----------
// Contador simples em memória por endereço real do cliente. O Cloudflare
// Tunnel adiciona o header CF-Connecting-IP; caso contrário usamos req.ip
// (resolvido pelo trust proxy). Limita tentativas de login por janela para
// dificultar ataques de força bruta contra usuários.
const loginAttempts = new Map(); // ip -> { count, resetAt }
const LOGIN_LIMIT = 20;          // tentativas por janela
const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf && /^[\d.]+$/.test(cf)) return cf;
  return req.ip || req.socket.remoteAddress || 'desconhecido';
}

function rateLimitLogin(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(ip, entry);
  }
  entry.count += 1;
  if (entry.count > LOGIN_LIMIT) {
    const restante = Math.ceil((entry.resetAt - now) / 1000);
    return res.status(429).json({ error: `Muitas tentativas de login. Tente novamente em ${restante}s.` });
  }
  next();
}

// Limpa o contador quando um login tem sucesso (se o usuário acertou, não punir)
function resetLoginAttempts(req) {
  const ip = clientIp(req);
  loginAttempts.delete(ip);
}
// Proteção contra crescimento infinito do Map: limpa entradas expiradas periodicamente
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (entry.resetAt <= now) loginAttempts.delete(ip);
  }
}, LOGIN_WINDOW_MS);

// ---------- Auth / permissoes ----------
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user.papel === 'admin' || roles.includes(req.user.papel)) return next();
    return res.status(403).json({ error: 'Você não tem permissão para acessar este recurso.' });
  };
}

// ---------- Auditoria (logs) ----------
// Registra quem acessou o sistema e o que fez, com data/hora. Usado apenas
// pelo admin para auditoria. Detalhes sensiveis (ex: senha) sao removidos
// antes de gravar. Falhas de log nunca quebram a operacao principal.
function log(req, acao, entidade, entidadeId, detalhes) {
  try {
    const safe = { ...(detalhes || {}) };
    delete safe.senha; delete safe.senha_hash; delete safe.password;
    const user = req && (req.user || (req.body && req.body.email ? { nome: req.body.email } : null));
    db.insert('logs', {
      usuario_id: req && req.user ? req.user.id : null,
      usuario_nome: user ? user.nome : null,
      papel: req && req.user ? req.user.papel : 'publico',
      acao,
      entidade: entidade || null,
      entidade_id: entidadeId != null ? entidadeId : null,
      detalhes: Object.keys(safe).length ? safe : null,
      ip: clientIp(req) || null,
    }).catch(() => {});
  } catch (e) { /* nunca quebra o fluxo por causa de log */ }
}

// Envolve um handler async, repassando qualquer erro pro Express (sem isso,
// uma excecao dentro de um handler "async" some silenciosamente).
function h(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// Remove o hash de senha antes de mandar dados de usuario em qualquer
// resposta (ex: nome de quem fechou a venda) — nunca expor senha_hash.
function sanitizeUser(u) {
  if (!u) return null;
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel };
}

function makeCrud(collection, opts = {}) {
  const {
    readRoles = null,
    createRoles = null,
    editDeleteRoles = ['admin'],
    onCreate, onUpdate, onDelete, onBeforeDelete
  } = opts;
  const router = express.Router();

  router.get('/', auth, readRoles ? requireRole(...readRoles) : (req, res, next) => next(), h(async (req, res) => {
    res.json(await db.all(collection));
  }));

  router.get('/:id', auth, readRoles ? requireRole(...readRoles) : (req, res, next) => next(), h(async (req, res) => {
    const row = await db.get(collection, req.params.id);
    if (!row) return res.status(404).json({ error: 'Não encontrado.' });
    res.json(row);
  }));

  router.post('/', auth, createRoles ? requireRole(...createRoles) : (req, res, next) => next(), h(async (req, res) => {
    const row = await db.insert(collection, req.body);
    if (onCreate) await onCreate(row);
    log(req, 'CRIAR', collection, row.id, req.body);
    res.status(201).json(row);
  }));

  router.put('/:id', auth, requireRole(...editDeleteRoles), h(async (req, res) => {
    const row = await db.update(collection, req.params.id, req.body);
    if (!row) return res.status(404).json({ error: 'Não encontrado.' });
    if (onUpdate) await onUpdate(row);
    log(req, 'EDITAR', collection, row.id, req.body);
    res.json(row);
  }));

  router.delete('/:id', auth, requireRole(...editDeleteRoles), h(async (req, res) => {
    if (onBeforeDelete) await onBeforeDelete(req.params.id);
    const ok = await db.remove(collection, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Não encontrado.' });
    if (onDelete) await onDelete(req.params.id);
    log(req, 'EXCLUIR', collection, Number(req.params.id), {});
    res.status(204).end();
  }));

  return router;
}

// ---------- Login ----------
app.post('/api/auth/login', rateLimitLogin, h(async (req, res) => {
  const { email, senha } = req.body;
  const user = (await db.all('users')).find(u => u.email === email);
  if (!user || !bcrypt.compareSync(senha || '', user.senha_hash)) {
    log(req, 'LOGIN_FALHOU', 'users', null, { email });
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }
  resetLoginAttempts(req);
  const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, papel: user.papel }, JWT_SECRET, { expiresIn: '12h' });
  log(req, 'LOGIN', 'users', user.id, { email: user.email, papel: user.papel });
  res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, papel: user.papel } });
}));

app.get('/api/auth/me', auth, (req, res) => res.json(req.user));

// ---------- Configuracoes (dados da empresa + numeracao) ----------
// Linha unica (id=1). Se ainda nao existir (banco antigo sem seed rodado
// de novo), cria com os valores padrao na primeira leitura.
async function getConfiguracoes() {
  let config = await db.get('configuracoes', 1);
  if (!config) config = await db.insert('configuracoes', { empresa_nome: 'Fluxo ERP' });
  return config;
}

// Leitura liberada pra qualquer usuario logado — os dados da empresa
// aparecem nos cupons/recibos impressos por vendedor, financeiro etc.
app.get('/api/configuracoes', auth, h(async (req, res) => {
  res.json(await getConfiguracoes());
}));

// Edicao (dados da empresa) — somente admin.
app.put('/api/configuracoes', auth, requireRole('admin'), h(async (req, res) => {
  const { empresa_nome, empresa_documento, empresa_telefone, empresa_endereco, empresa_email } = req.body;
  await getConfiguracoes(); // garante que a linha existe
  const row = await db.update('configuracoes', 1, { empresa_nome, empresa_documento, empresa_telefone, empresa_endereco, empresa_email });
  log(req, 'EDITAR', 'configuracoes', 1, { empresa_nome, empresa_documento, empresa_telefone, empresa_endereco, empresa_email });
  res.json(row);
}));

// Redefine o "piso" da numeracao de cada modulo — somente admin. O sistema
// nunca gera um numero menor ou igual a um que ja existe (evita duplicar),
// entao isso so tem efeito pratico se for maior que o maior numero atual,
// ou se os registros antigos ja tiverem sido apagados.
app.post('/api/configuracoes/resetar-numeros', auth, requireRole('admin'), h(async (req, res) => {
  const { venda, orcamento, producao, os } = req.body;
  const patch = {};
  if (venda !== undefined) patch.proximo_numero_venda = parseInt(venda) || null;
  if (orcamento !== undefined) patch.proximo_numero_orcamento = parseInt(orcamento) || null;
  if (producao !== undefined) patch.proximo_numero_producao = parseInt(producao) || null;
  if (os !== undefined) patch.proximo_numero_os = parseInt(os) || null;
  await getConfiguracoes();
  const row = await db.update('configuracoes', 1, patch);
  log(req, 'EDITAR', 'configuracoes', 1, { numeracao: patch });
  res.json(row);
}));

// Calcula o proximo numero de um modulo, respeitando o "piso" configurado
// em Configuracoes (se houver) sem nunca colidir com um numero existente.
async function calcularProximoNumero(collection, campoConfig, base) {
  const [existentes, config] = await Promise.all([db.all(collection), getConfiguracoes()]);
  const maxExistente = existentes.length ? Math.max(...existentes.map(r => r.numero || 0)) : 0;
  const piso = config[campoConfig] ? config[campoConfig] - 1 : 0;
  return Math.max(maxExistente, piso, base) + 1;
}

// ---------- Consulta publica de pedido (sem login) ----------
// Usada pela pagina public/rastreio.html — o cliente acessa pelo numero do
// pedido (impresso no cupom) ou pelo QR Code, sem precisar de usuario/senha.
// So expoe o que o cliente precisa ver: nao inclui custo, documento do
// cliente, nem nenhum dado de outros pedidos.
app.get('/api/publico/pedido/:numero', h(async (req, res) => {
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

// ---------- Usuarios (somente admin) ----------
app.get('/api/users', auth, requireRole('admin'), h(async (req, res) => {
  res.json((await db.all('users')).map(u => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel })));
}));

app.post('/api/users', auth, requireRole('admin'), h(async (req, res) => {
  const { nome, email, senha, papel } = req.body;
  if (!nome || !email || !senha || !papel) return res.status(400).json({ error: 'Preencha nome, e-mail, senha e papel.' });
  if ((await db.all('users')).some(u => u.email === email)) return res.status(400).json({ error: 'Já existe um usuário com este e-mail.' });
  const user = await db.insert('users', { nome, email, senha_hash: bcrypt.hashSync(senha, 8), papel });
  log(req, 'CRIAR_USUARIO', 'users', user.id, { nome, email, papel });
  res.status(201).json({ id: user.id, nome: user.nome, email: user.email, papel: user.papel });
}));

app.put('/api/users/:id', auth, requireRole('admin'), h(async (req, res) => {
  const { nome, email, senha, papel } = req.body;
  const patch = { nome, email, papel };
  if (senha) patch.senha_hash = bcrypt.hashSync(senha, 8);
  const user = await db.update('users', req.params.id, patch);
  if (!user) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EDITAR_USUARIO', 'users', user.id, { nome, email, papel });
  res.json({ id: user.id, nome: user.nome, email: user.email, papel: user.papel });
}));

app.delete('/api/users/:id', auth, requireRole('admin'), h(async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário.' });
  const ok = await db.remove('users', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EXCLUIR_USUARIO', 'users', Number(req.params.id), {});
  res.status(204).end();
}));

// ---------- Modulos padrao (CRUD generico com permissoes) ----------
// Ao excluir registros referenciados por outros, desvinculamos as referencias
// antes de apagar (senao o PostgreSQL bloqueia com erro de chave estrangeira).
app.use('/api/clientes', makeCrud('clientes', {
  readRoles: ['admin', 'vendedor', 'financeiro'],
  createRoles: ['admin', 'vendedor'],
  onBeforeDelete: async (id) => {
    const n = Number(id);
    for (const [tabela, coluna] of [['vendas', 'cliente_id'], ['orcamentos', 'cliente_id'], ['ordens_servico', 'cliente_id'], ['producoes', 'cliente_id']]) {
      for (const row of await db.all(tabela, r => Number(r[coluna]) === n)) {
        await db.update(tabela, row.id, { [coluna]: null });
      }
    }
  }
}));
app.use('/api/produtos', makeCrud('produtos', {
  readRoles: ['admin', 'vendedor', 'financeiro'],
  createRoles: ['admin', 'vendedor'],
  onBeforeDelete: async (id) => {
    const n = Number(id);
    for (const [tabela, coluna] of [['itens_venda', 'produto_id'], ['itens_orcamento', 'produto_id'], ['estoque_movimentos', 'produto_id']]) {
      for (const row of await db.all(tabela, r => Number(r[coluna]) === n)) {
        await db.update(tabela, row.id, { [coluna]: null });
      }
    }
  }
}));
app.use('/api/itens_venda', makeCrud('itens_venda', { readRoles: ['admin', 'vendedor', 'financeiro'], createRoles: ['admin', 'vendedor'] }));
app.use('/api/estoque_movimentos', makeCrud('estoque_movimentos', {
  readRoles: ['admin', 'vendedor'],
  createRoles: ['admin', 'vendedor'],
  onCreate: async (mov) => {
    const produto = await db.get('produtos', mov.produto_id);
    if (!produto) return;
    const delta = mov.tipo === 'ENTRADA' ? Number(mov.quantidade) : -Number(mov.quantidade);
    await db.update('produtos', produto.id, { estoque: (produto.estoque || 0) + delta });
  }
}));
app.use('/api/itens_orcamento', makeCrud('itens_orcamento', { readRoles: ['admin', 'vendedor'], createRoles: ['admin', 'vendedor'] }));
app.use('/api/financeiro', makeCrud('financeiro', {
  readRoles: ['admin', 'financeiro'],
  createRoles: ['admin', 'financeiro'],
  onCreate: async (row) => {
    if (row.valor_pago === undefined || row.pagamentos === undefined) {
      await db.update('financeiro', row.id, { valor_pago: row.valor_pago || 0, pagamentos: row.pagamentos || [] });
    }
  }
}));

// ---------- Funcionarios (dados sensiveis de salario — somente admin) ----------
app.use('/api/funcionarios', makeCrud('funcionarios', {
  readRoles: ['admin'],
  createRoles: ['admin'],
  onCreate: async (row) => {
    if (row.vales === undefined) await db.update('funcionarios', row.id, { vales: [] });
  }
}));

// Registra um vale (adiantamento salarial). Body: { valor, descricao }.
app.post('/api/funcionarios/:id/vale', auth, requireRole('admin'), h(async (req, res) => {
  const f = await db.get('funcionarios', req.params.id);
  if (!f) return res.status(404).json({ error: 'Não encontrado.' });
  const valor = Number(req.body.valor);
  if (!valor || valor <= 0) return res.status(400).json({ error: 'Informe um valor de vale válido.' });
  const vales = [...(f.vales || []), { valor, data: new Date().toISOString().slice(0, 10), descricao: req.body.descricao || '' }];
  const row = await db.update('funcionarios', f.id, { vales });
  log(req, 'REGISTRAR_VALE', 'funcionarios', f.id, { valor, descricao: req.body.descricao || '' });
  res.json(row);
}));

// Calcula os dados de referencia pra montar o contracheque de um mes
// (formato "YYYY-MM"): desconto de INSS estimado (tabela progressiva 2024)
// e soma dos vales registrados naquele mes. O valor de INSS e so uma
// SUGESTAO — fica editavel na tela antes de imprimir, e vale confirmar com
// o contador da empresa (a tabela e revisada todo ano).
function calcularINSS(salario) {
  const faixas = [
    { limite: 1412.00, aliquota: 0.075 },
    { limite: 2666.68, aliquota: 0.09 },
    { limite: 4000.03, aliquota: 0.12 },
    { limite: 7786.02, aliquota: 0.14 },
  ];
  let inss = 0;
  let anterior = 0;
  for (const faixa of faixas) {
    if (salario > anterior) {
      const baseFaixa = Math.min(salario, faixa.limite) - anterior;
      inss += baseFaixa * faixa.aliquota;
      anterior = faixa.limite;
    }
  }
  return Math.round(inss * 100) / 100;
}

app.get('/api/funcionarios/:id/contracheque', auth, requireRole('admin'), h(async (req, res) => {
  const f = await db.get('funcionarios', req.params.id);
  if (!f) return res.status(404).json({ error: 'Não encontrado.' });
  const mes = req.query.mes || new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const valesDoMes = (f.vales || []).filter(v => (v.data || '').startsWith(mes));
  const totalVales = Math.round(valesDoMes.reduce((s, v) => s + Number(v.valor || 0), 0) * 100) / 100;
  const inssEstimado = calcularINSS(Number(f.salario || 0));
  res.json({ funcionario: f, mes, valesDoMes, totalVales, inssEstimado });
}));

app.post('/api/ordens_servico', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const numero = await calcularProximoNumero('ordens_servico', 'proximo_numero_os', 300);
  const row = await db.insert('ordens_servico', { ...req.body, numero });
  log(req, 'CRIAR', 'ordens_servico', row.id, req.body);
  res.status(201).json(row);
}));
app.use('/api/ordens_servico', makeCrud('ordens_servico', { readRoles: ['admin', 'vendedor', 'financeiro'], createRoles: ['admin', 'vendedor'] }));

async function enrichProducao(p) {
  const venda = p.venda_id ? await db.get('vendas', p.venda_id) : null;
  let itens = [];
  if (venda) {
    const itensVenda = await db.all('itens_venda', it => it.venda_id === venda.id);
    itens = await Promise.all(itensVenda.map(async it => ({ ...it, produto: await db.get('produtos', it.produto_id) })));
  }
  return { ...p, venda_numero: venda ? venda.numero : null, itens };
}
app.get('/api/producoes', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const producoes = await db.all('producoes');
  res.json(await Promise.all(producoes.map(enrichProducao)));
}));
app.get('/api/producoes/:id', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const p = await db.get('producoes', req.params.id);
  if (!p) return res.status(404).json({ error: 'Não encontrado.' });
  res.json(await enrichProducao(p));
}));
app.post('/api/producoes', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const numero = await calcularProximoNumero('producoes', 'proximo_numero_producao', 100);
  const row = await db.insert('producoes', { ...req.body, numero });
  log(req, 'CRIAR', 'producoes', row.id, req.body);
  res.status(201).json(row);
}));
app.use('/api/producoes', makeCrud('producoes', { readRoles: ['admin', 'vendedor', 'financeiro'], createRoles: ['admin', 'vendedor'] }));

// ---------- Rotas de mudanca de situacao ----------
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

app.put('/api/vendas/:id/situacao', auth, requireRole('admin'), h(async (req, res) => {
  const row = await db.update('vendas', req.params.id, { situacao: req.body.situacao });
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'ALTERAR_SITUACAO', 'vendas', row.id, { situacao: req.body.situacao });
  await sincronizarFinanceiroVenda(row.id);
  await sincronizarProducaoVenda(row.id);
  res.json(await db.get('vendas', row.id));
}));

app.put('/api/ordens_servico/:id/situacao', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const row = await db.update('ordens_servico', req.params.id, { situacao: req.body.situacao });
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'ALTERAR_SITUACAO', 'ordens_servico', row.id, { situacao: req.body.situacao });
  res.json(row);
}));

app.put('/api/producoes/:id/situacao', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const row = await db.update('producoes', req.params.id, { situacao: req.body.situacao });
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'ALTERAR_SITUACAO', 'producoes', row.id, { situacao: req.body.situacao });

  if (req.body.situacao === 'CONCLUIDA' && row.venda_id) {
    const venda = await db.get('vendas', row.venda_id);
    if (venda && venda.situacao !== 'ENTREGUE_PAGO' && venda.situacao !== 'CANCELADA') {
      await db.update('vendas', venda.id, { situacao: 'PRONTO_ENTREGA' });
    }
  }

  if (req.body.situacao === 'CONCLUIDA' && !row.financeiro_gerado && !row.venda_id && Number(row.valor) > 0) {
    await db.insert('financeiro', {
      tipo: 'RECEBER',
      descricao: `Produção #${row.numero} (${SETOR_LABEL[row.setor] || row.setor}) - ${row.descricao || ''}`.trim(),
      valor: row.valor,
      valor_pago: 0,
      pagamentos: [],
      vencimento: new Date().toISOString().slice(0, 10),
      situacao: 'PENDENTE'
    });
    await db.update('producoes', row.id, { financeiro_gerado: true });
  }

  res.json(await db.get('producoes', row.id));
}));

app.post('/api/financeiro/:id/pagamento', auth, requireRole('admin', 'financeiro'), h(async (req, res) => {
  const fin = await db.get('financeiro', req.params.id);
  if (!fin) return res.status(404).json({ error: 'Não encontrado.' });
  const valor = Number(req.body.valor);
  const saldo = Math.round((Number(fin.valor) - Number(fin.valor_pago || 0)) * 100) / 100;
  if (!valor || valor <= 0) return res.status(400).json({ error: 'Informe um valor de pagamento válido.' });
  if (valor > saldo + 0.01) return res.status(400).json({ error: `O valor não pode ser maior que o saldo em aberto (${saldo.toFixed(2)}).` });
  const row = await registrarPagamentoFinanceiro(fin.id, valor, req.body.forma_pagamento);
  log(req, 'REGISTRAR_PAGAMENTO', 'financeiro', fin.id, { valor, forma_pagamento: req.body.forma_pagamento });
  res.json(row);
}));

app.put('/api/financeiro/:id/situacao', auth, requireRole('admin', 'financeiro'), h(async (req, res) => {
  log(req, 'ALTERAR_SITUACAO', 'financeiro', Number(req.params.id), { situacao: req.body.situacao });
  if (req.body.situacao === 'PAGO') {
    const fin = await db.get('financeiro', req.params.id);
    if (!fin) return res.status(404).json({ error: 'Não encontrado.' });
    const saldo = Number(fin.valor) - Number(fin.valor_pago || 0);
    const row = saldo > 0.01 ? await registrarPagamentoFinanceiro(fin.id, saldo) : fin;
    return res.json(row);
  }
  const row = await db.update('financeiro', req.params.id, { situacao: req.body.situacao });
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  res.json(row);
}));

// ---------- Vendas ----------
app.get('/api/vendas', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const vendas = await db.all('vendas');
  const enriched = await Promise.all(vendas.map(async v => {
    const cliente = await db.get('clientes', v.cliente_id);
    const vendedor = v.vendedor_id ? sanitizeUser(await db.get('users', v.vendedor_id)) : null;
    const itensRaw = await db.all('itens_venda', it => it.venda_id === v.id);
    const itens = await Promise.all(itensRaw.map(async it => ({ ...it, produto: await db.get('produtos', it.produto_id) })));
    return { ...v, cliente, vendedor, itens };
  }));
  res.json(enriched);
}));

app.get('/api/vendas/:id', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const v = await db.get('vendas', req.params.id);
  if (!v) return res.status(404).json({ error: 'Não encontrado.' });
  const cliente = await db.get('clientes', v.cliente_id);
  const vendedor = v.vendedor_id ? sanitizeUser(await db.get('users', v.vendedor_id)) : null;
  const itensRaw = await db.all('itens_venda', it => it.venda_id === v.id);
  const itens = await Promise.all(itensRaw.map(async it => ({ ...it, produto: await db.get('produtos', it.produto_id) })));
  res.json({ ...v, cliente, vendedor, itens });
}));

// Gera o cupom de acompanhamento (QR Code + link) pra imprimir na venda.
// Usado pelo botao "Emitir cupom" na tela de Vendas.
app.get('/api/vendas/:id/cupom', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const v = await db.get('vendas', req.params.id);
  if (!v) return res.status(404).json({ error: 'Não encontrado.' });
  const trackingUrl = `${PUBLIC_URL}/rastreio.html?numero=${v.numero}`;
  const qrDataUrl = await QRCode.toDataURL(trackingUrl, { margin: 1, width: 220 });
  res.json({ numero: v.numero, trackingUrl, qrDataUrl });
}));

// Busca de pedido pelo numero — usada pela tela "Consultar Pedido" (balcao),
// quando o operador escaneia o codigo de barras OU o QR Code impresso no
// cupom do cliente. Diferente da consulta publica, aqui o retorno e o
// registro completo da venda (mesmo formato de GET /api/vendas/:id), ja que
// e uma tela interna, autenticada, pra equipe.
app.get('/api/vendas/buscar/:numero', auth, requireRole('admin', 'vendedor', 'financeiro'), h(async (req, res) => {
  const numero = parseInt(req.params.numero, 10);
  if (!numero) return res.status(400).json({ error: 'Número de pedido inválido.' });
  const v = (await db.all('vendas')).find(x => x.numero === numero);
  if (!v) return res.status(404).json({ error: 'Pedido não encontrado. Confira o número ou o código escaneado.' });

  const cliente = await db.get('clientes', v.cliente_id);
  const vendedor = v.vendedor_id ? sanitizeUser(await db.get('users', v.vendedor_id)) : null;
  const itensRaw = await db.all('itens_venda', it => it.venda_id === v.id);
  const itens = await Promise.all(itensRaw.map(async it => ({ ...it, produto: await db.get('produtos', it.produto_id) })));
  const producao = v.producao_id ? await db.get('producoes', v.producao_id) : null;
  const financeiro = v.financeiro_id ? await db.get('financeiro', v.financeiro_id) : null;

  res.json({ ...v, cliente, vendedor, itens, producao, financeiro });
}));

app.post('/api/vendas', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const { cliente_id, data, situacao, segmento, itens = [] } = req.body;
  const proximoNumero = await calcularProximoNumero('vendas', 'proximo_numero_venda', 12000);
  const valor = itens.reduce((sum, it) => sum + (Number(it.quantidade) * Number(it.preco_unit)), 0);

  const venda = await db.insert('vendas', { numero: proximoNumero, cliente_id, data, situacao: situacao || 'EM_PRODUCAO', segmento, valor, vendedor_id: req.user.id });
  log(req, 'CRIAR', 'vendas', venda.id, { numero: proximoNumero, cliente_id, situacao, segmento, valor });

  for (const it of itens) {
    await db.insert('itens_venda', { venda_id: venda.id, produto_id: it.produto_id, quantidade: it.quantidade, preco_unit: it.preco_unit });
    const produto = await db.get('produtos', it.produto_id);
    if (produto) await db.update('produtos', produto.id, { estoque: (produto.estoque || 0) - Number(it.quantidade) });
  }

  await sincronizarFinanceiroVenda(venda.id);
  await sincronizarProducaoVenda(venda.id);
  res.status(201).json(await db.get('vendas', venda.id));
}));

app.put('/api/vendas/:id', auth, requireRole('admin'), h(async (req, res) => {
  const row = await db.update('vendas', req.params.id, req.body);
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EDITAR', 'vendas', row.id, req.body);
  await sincronizarFinanceiroVenda(row.id);
  await sincronizarProducaoVenda(row.id);
  res.json(await db.get('vendas', row.id));
}));

app.delete('/api/vendas/:id', auth, requireRole('admin'), h(async (req, res) => {
  const venda = await db.get('vendas', req.params.id);
  if (!venda) return res.status(404).json({ error: 'Não encontrado.' });

  // Devolve o estoque dos itens vendidos e apaga os itens
  for (const it of await db.all('itens_venda', it => it.venda_id === venda.id)) {
    const produto = await db.get('produtos', it.produto_id);
    if (produto) await db.update('produtos', produto.id, { estoque: (produto.estoque || 0) + Number(it.quantidade) });
    await db.remove('itens_venda', it.id);
  }

  // Remove o financeiro pendente vinculado
  if (venda.financeiro_id) {
    const fin = await db.get('financeiro', venda.financeiro_id);
    if (fin && fin.situacao === 'PENDENTE') await db.remove('financeiro', fin.id);
  }

  // Desvincula orçamento e produção que apontam para esta venda
  for (const o of await db.all('orcamentos', o => Number(o.venda_id) === venda.id)) {
    await db.update('orcamentos', o.id, { venda_id: null });
  }
  for (const p of await db.all('producoes', p => Number(p.venda_id) === venda.id)) {
    await db.update('producoes', p.id, { venda_id: null });
  }

  const ok = await db.remove('vendas', venda.id);
  if (!ok) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EXCLUIR', 'vendas', Number(req.params.id), {});
  res.status(204).end();
}));

// ---------- Orcamentos ----------
app.get('/api/orcamentos', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const orcamentos = await db.all('orcamentos');
  const enriched = await Promise.all(orcamentos.map(async o => {
    const itensRaw = await db.all('itens_orcamento', it => it.orcamento_id === o.id);
    const itens = await Promise.all(itensRaw.map(async it => ({ ...it, produto: await db.get('produtos', it.produto_id) })));
    return {
      ...o,
      cliente: await db.get('clientes', o.cliente_id),
      venda_numero: o.venda_id ? (await db.get('vendas', o.venda_id) || {}).numero : null,
      itens
    };
  }));
  res.json(enriched);
}));

app.get('/api/orcamentos/:id', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const o = await db.get('orcamentos', req.params.id);
  if (!o) return res.status(404).json({ error: 'Não encontrado.' });
  const itensRaw = await db.all('itens_orcamento', it => it.orcamento_id === o.id);
  const itens = await Promise.all(itensRaw.map(async it => ({ ...it, produto: await db.get('produtos', it.produto_id) })));
  res.json({
    ...o,
    cliente: await db.get('clientes', o.cliente_id),
    venda_numero: o.venda_id ? (await db.get('vendas', o.venda_id) || {}).numero : null,
    itens
  });
}));

app.post('/api/orcamentos', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const { cliente_id, data, validade, situacao, segmento, itens = [] } = req.body;
  const proximoNumero = await calcularProximoNumero('orcamentos', 'proximo_numero_orcamento', 5000);
  const valor = itens.reduce((sum, it) => sum + (Number(it.quantidade) * Number(it.preco_unit)), 0);
  const orc = await db.insert('orcamentos', { numero: proximoNumero, cliente_id, data, validade, situacao: situacao || 'ENVIADO', segmento, valor });
  log(req, 'CRIAR', 'orcamentos', orc.id, { numero: proximoNumero, cliente_id, segmento, valor });
  for (const it of itens) {
    await db.insert('itens_orcamento', { orcamento_id: orc.id, produto_id: it.produto_id, quantidade: it.quantidade, preco_unit: it.preco_unit });
  }
  res.status(201).json(await db.get('orcamentos', orc.id));
}));

app.put('/api/orcamentos/:id', auth, requireRole('admin'), h(async (req, res) => {
  const { cliente_id, data, validade, segmento, itens } = req.body;
  const patch = {};
  if (cliente_id !== undefined) patch.cliente_id = cliente_id;
  if (data !== undefined) patch.data = data;
  if (validade !== undefined) patch.validade = validade;
  if (segmento !== undefined) patch.segmento = segmento;
  if (Array.isArray(itens)) {
    const antigos = await db.all('itens_orcamento', it => it.orcamento_id === Number(req.params.id));
    for (const it of antigos) await db.remove('itens_orcamento', it.id);
    for (const it of itens) {
      await db.insert('itens_orcamento', { orcamento_id: Number(req.params.id), produto_id: it.produto_id, quantidade: it.quantidade, preco_unit: it.preco_unit });
    }
    patch.valor = itens.reduce((s, it) => s + Number(it.quantidade) * Number(it.preco_unit), 0);
  }
  const row = await db.update('orcamentos', req.params.id, patch);
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EDITAR', 'orcamentos', row.id, patch);
  res.json(await db.get('orcamentos', row.id));
}));

app.delete('/api/orcamentos/:id', auth, requireRole('admin'), h(async (req, res) => {
  const itensOrc = await db.all('itens_orcamento', it => it.orcamento_id === Number(req.params.id));
  for (const it of itensOrc) await db.remove('itens_orcamento', it.id);
  const ok = await db.remove('orcamentos', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EXCLUIR', 'orcamentos', Number(req.params.id), {});
  res.status(204).end();
}));

app.put('/api/orcamentos/:id/situacao', auth, requireRole('admin', 'vendedor'), h(async (req, res) => {
  const row = await db.update('orcamentos', req.params.id, { situacao: req.body.situacao });
  if (!row) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'ALTERAR_SITUACAO', 'orcamentos', row.id, { situacao: req.body.situacao });

  if (req.body.situacao === 'APROVADO' && !row.venda_id) {
    const itens = await db.all('itens_orcamento', it => it.orcamento_id === row.id);
    const proximoNumero = await calcularProximoNumero('vendas', 'proximo_numero_venda', 12000);
    const venda = await db.insert('vendas', {
      numero: proximoNumero,
      cliente_id: row.cliente_id,
      data: new Date().toISOString().slice(0, 10),
      situacao: 'EM_PRODUCAO',
      segmento: row.segmento,
      valor: row.valor,
      orcamento_id: row.id
    });
    for (const it of itens) {
      await db.insert('itens_venda', { venda_id: venda.id, produto_id: it.produto_id, quantidade: it.quantidade, preco_unit: it.preco_unit });
      const produto = await db.get('produtos', it.produto_id);
      if (produto) await db.update('produtos', produto.id, { estoque: (produto.estoque || 0) - Number(it.quantidade) });
    }
    await db.update('orcamentos', row.id, { venda_id: venda.id });
    await sincronizarFinanceiroVenda(venda.id);
    await sincronizarProducaoVenda(venda.id);
    log(req, 'APROVAR_ORCAMENTO_GEROU_VENDA', 'vendas', venda.id, { orcamento_id: row.id, numero: venda.numero });
  }

  res.json(await db.get('orcamentos', row.id));
}));

// ---------- Relatorios ----------
app.get('/api/relatorios/vendas', auth, requireRole('admin', 'financeiro'), h(async (req, res) => {
  const { inicio, fim } = req.query;
  let vendas = await db.all('vendas');
  if (inicio) vendas = vendas.filter(v => v.data >= inicio);
  if (fim) vendas = vendas.filter(v => v.data <= fim);
  vendas = await Promise.all(vendas.map(async v => ({ ...v, cliente: await db.get('clientes', v.cliente_id) })));
  const total = vendas.reduce((s, v) => s + Number(v.valor || 0), 0);
  res.json({ vendas, total, quantidade: vendas.length });
}));

app.get('/api/relatorios/caixa', auth, requireRole('admin', 'financeiro'), h(async (req, res) => {
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

// ---------- Auditoria: consulta de logs (somente admin) ----------
app.get('/api/logs', auth, requireRole('admin'), h(async (req, res) => {
  const { q, acao, inicio, fim, limite } = req.query;
  let logs = await db.all('logs');

  if (q) {
    const termo = String(q).toLowerCase();
    logs = logs.filter(l =>
      (l.usuario_nome || '').toLowerCase().includes(termo) ||
      (l.acao || '').toLowerCase().includes(termo) ||
      (l.entidade || '').toLowerCase().includes(termo)
    );
  }
  if (acao) logs = logs.filter(l => l.acao === acao);
  if (inicio) logs = logs.filter(l => String(l.criado_em).slice(0, 10) >= inicio);
  if (fim) logs = logs.filter(l => String(l.criado_em).slice(0, 10) <= fim);

  logs = logs.slice().reverse();
  if (limite) logs = logs.slice(0, parseInt(limite, 10) || 100);

  // total de eventos por acao (para filtros)
  const todas = await db.all('logs');
  const acoes = {};
  todas.forEach(l => { acoes[l.acao] = (acoes[l.acao] || 0) + 1; });

  res.json({ logs, total: logs.length, acoes });
}));

// ---------- Dashboard ----------
app.get('/api/dashboard', auth, requireRole('admin', 'financeiro'), h(async (req, res) => {
  const vendas = await db.all('vendas');
  const financeiro = await db.all('financeiro');
  const produtos = await db.all('produtos');

  const totalVendasMes = vendas.reduce((s, v) => s + Number(v.valor || 0), 0);
  const saldoAberto = f => Number(f.valor) - Number(f.valor_pago || 0);
  const aReceber = financeiro.filter(f => f.tipo === 'RECEBER' && (f.situacao === 'PENDENTE' || f.situacao === 'PARCIAL')).reduce((s, f) => s + saldoAberto(f), 0);
  const aPagar = financeiro.filter(f => f.tipo === 'PAGAR' && (f.situacao === 'PENDENTE' || f.situacao === 'PARCIAL')).reduce((s, f) => s + saldoAberto(f), 0);
  const estoqueBaixo = produtos.filter(p => Number(p.estoque) <= Number(p.estoque_minimo || 0));

  const vendasPorSituacao = {};
  vendas.forEach(v => { vendasPorSituacao[v.situacao] = (vendasPorSituacao[v.situacao] || 0) + 1; });

  const hoje = new Date();
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    dias.push(d.toISOString().slice(0, 10));
  }
  const vendasPorDia = dias.map(dia => ({
    data: dia,
    total: vendas.filter(v => v.data === dia).reduce((s, v) => s + Number(v.valor || 0), 0)
  }));

  const ultimasVendasRaw = vendas.slice(-8).reverse();
  const ultimasVendas = await Promise.all(ultimasVendasRaw.map(async v => ({ ...v, cliente: await db.get('clientes', v.cliente_id) })));

  res.json({
    totalVendasMes,
    qtdVendas: vendas.length,
    aReceber,
    aPagar,
    estoqueBaixo,
    vendasPorSituacao,
    vendasPorDia,
    ultimasVendas
  });
}));

// Handler de erro generico
app.use((err, req, res, next) => {
  if (err && err.message === 'ORIGEM_BLOQUEADA') {
    return res.status(err.status || 403).json({ error: 'Origem não permitida.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload muito grande.' });
  }
  console.error('Erro na API:', err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

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
    await require('./seed')();
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Fluxo ERP rodando em http://localhost:${PORT}`);
    console.log(`   Login padrão: admin@fluxoerp.com / admin123\n`);
  });
}

bootstrap();
