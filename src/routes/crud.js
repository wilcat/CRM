// src/routes/crud.js
// CRUD generico com permissoes — fabrica de routers reutilizada pelos
// modulos padrao da API (clientes, produtos, financeiro, etc.).
//
// Ao excluir registros referenciados por outros, desvinculamos as
// referencias antes de apagar (senao o PostgreSQL bloqueia com erro de
// chave estrangeira) — use a opcao `onBeforeDelete` para isso.

const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { log } = require('../utils/audit');
const { h } = require('../utils/http');

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

module.exports = { makeCrud };
