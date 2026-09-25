// src/db/json.js
// Banco de dados simples baseado em arquivo JSON (sem dependencias nativas).
// Pensado para testes/demo rapidos, sem precisar instalar nada. Para uso em
// producao / rede interna, use o driver PostgreSQL (postgres.js) — veja o
// README para instrucoes de migracao.
//
// Todas as funcoes sao "async" (retornam Promise) so por compatibilidade de
// interface com o driver Postgres — o resto do sistema usa "await db.xxx()"
// e funciona igual não importa qual dos dois drivers esta ativo.

const fs = require('fs');
const path = require('path');
const { COLLECTIONS } = require('../constants');

// Caminho do arquivo: raiz do projeto (/data/database.json), independentemente
// de o processo ter sido iniciado de dentro de src/.
const DB_FILE = path.join(__dirname, '..', '..', 'data', 'database.json');

function emptyState() {
  const state = { _seq: {} };
  COLLECTIONS.forEach(c => { state[c] = []; state._seq[c] = 0; });
  return state;
}

function load() {
  if (!fs.existsSync(DB_FILE)) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(emptyState(), null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function save(state) {
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
}

const db = {
  async all(collection, filterFn) {
    const state = load();
    const rows = state[collection] || [];
    return filterFn ? rows.filter(filterFn) : rows;
  },

  async get(collection, id) {
    const state = load();
    return (state[collection] || []).find(r => r.id === Number(id)) || null;
  },

  async insert(collection, obj) {
    const state = load();
    if (state._seq[collection] === undefined) state._seq[collection] = 0;
    state._seq[collection] = (state._seq[collection] || 0) + 1;
    const row = { id: state._seq[collection], ...obj, criado_em: new Date().toISOString() };
    (state[collection] = state[collection] || []).push(row);
    save(state);
    return row;
  },

  async update(collection, id, patch) {
    const state = load();
    const idx = state[collection].findIndex(r => r.id === Number(id));
    if (idx === -1) return null;
    state[collection][idx] = { ...state[collection][idx], ...patch, atualizado_em: new Date().toISOString() };
    save(state);
    return state[collection][idx];
  },

  async remove(collection, id) {
    const state = load();
    const before = state[collection].length;
    state[collection] = state[collection].filter(r => r.id !== Number(id));
    save(state);
    return state[collection].length < before;
  },

  async reset(seedFn) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const state = emptyState();
    save(state);
    if (seedFn) await seedFn(db);
    return load();
  },

  async close() { /* nada a fazer no driver de arquivo */ }
};

module.exports = db;
