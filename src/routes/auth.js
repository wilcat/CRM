// src/routes/auth.js
// Login (com rate limiting contra forca bruta) e sessao atual.

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { JWT_SECRET } = require('../config/env');
const { auth } = require('../middleware/auth');
const { rateLimitLogin, resetLoginAttempts } = require('../middleware/rateLimitLogin');
const { log } = require('../utils/audit');
const { h } = require('../utils/http');

const router = express.Router();

router.post('/login', rateLimitLogin, h(async (req, res) => {
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

router.get('/me', auth, (req, res) => res.json(req.user));

module.exports = router;
