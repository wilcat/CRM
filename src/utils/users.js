// src/utils/users.js
// Utilitarios para dados de usuario expostos em respostas da API.

// Remove o hash de senha antes de mandar dados de usuario em qualquer
// resposta (ex: nome de quem fechou a venda) — nunca expor senha_hash.
function sanitizeUser(u) {
  if (!u) return null;
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel };
}

module.exports = { sanitizeUser };
