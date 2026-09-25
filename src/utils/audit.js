// src/utils/audit.js
// Auditoria (logs). Registra quem acessou o sistema e o que fez, com
// data/hora. Usado apenas pelo admin para auditoria. Detalhes sensiveis
// (ex: senha) sao removidos antes de gravar. Falhas de log nunca quebram
// a operacao principal.

const db = require('../db');
const { clientIp } = require('../middleware/rateLimitLogin');

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

module.exports = { log };
