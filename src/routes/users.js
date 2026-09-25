// src/routes/users.js
// Gestao de usuarios (somente admin).

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { log } = require('../utils/audit');
const { sanitizeUser } = require('../utils/users');
const { h } = require('../utils/http');

const router = express.Router();
router.use(auth, requireRole('admin'));

router.get('/', h(async (req, res) => {
  res.json((await db.all('users')).map(sanitizeUser));
}));

router.post('/', h(async (req, res) => {
  const { nome, email, senha, papel } = req.body;
  if (!nome || !email || !senha || !papel) return res.status(400).json({ error: 'Preencha nome, e-mail, senha e papel.' });
  if ((await db.all('users')).some(u => u.email === email)) return res.status(400).json({ error: 'Já existe um usuário com este e-mail.' });
  const user = await db.insert('users', { nome, email, senha_hash: bcrypt.hashSync(senha, 8), papel });
  log(req, 'CRIAR_USUARIO', 'users', user.id, { nome, email, papel });
  res.status(201).json(sanitizeUser(user));
}));

router.put('/:id', h(async (req, res) => {
  const { nome, email, senha, papel } = req.body;
  const patch = { nome, email, papel };
  if (senha) patch.senha_hash = bcrypt.hashSync(senha, 8);
  const user = await db.update('users', req.params.id, patch);
  if (!user) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EDITAR_USUARIO', 'users', user.id, { nome, email, papel });
  res.json(sanitizeUser(user));
}));

router.delete('/:id', h(async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário.' });
  const ok = await db.remove('users', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Não encontrado.' });
  log(req, 'EXCLUIR_USUARIO', 'users', Number(req.params.id), {});
  res.status(204).end();
}));

module.exports = router;
