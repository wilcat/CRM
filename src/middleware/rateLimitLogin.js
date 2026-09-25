// src/middleware/rateLimitLogin.js
// Rate limiting no login (forca bruta).
// Contador simples em memoria por endereco real do cliente. O Cloudflare
// Tunnel adiciona o header CF-Connecting-IP; caso contrario usamos req.ip
// (resolvido pelo trust proxy). Limita tentativas de login por janela para
// dificultar ataques de forca bruta contra usuarios.

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

// Limpa o contador quando um login tem sucesso (se o usuario acertou, nao punir)
function resetLoginAttempts(req) {
  const ip = clientIp(req);
  loginAttempts.delete(ip);
}

// Protecao contra crescimento infinito do Map: limpa entradas expiradas periodicamente
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (entry.resetAt <= now) loginAttempts.delete(ip);
  }
}, LOGIN_WINDOW_MS).unref();

module.exports = { rateLimitLogin, resetLoginAttempts, clientIp };
