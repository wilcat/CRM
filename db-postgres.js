// db-postgres.js
// Driver PostgreSQL. Mantem a MESMA interface do db-json.js (all/get/insert/
// update/remove/reset), so o resto do sistema (server.js, seed.js) nao
// precisa saber qual banco esta rodando por baixo — so muda o db.js.
//
// Configuracao via variavel de ambiente DATABASE_URL, ex:
//   postgres://usuario:senha@localhost:5432/fluxo_erp
// Se DATABASE_URL nao for definida, o driver 'pg' tenta usar as variaveis
// padrao do Postgres (PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT).

const { Pool, types } = require('pg');

// NUMERIC do Postgres volta como string por padrao (pra nao perder precisao).
// Convertemos para number aqui, uma vez so, pra nao precisar mexer em cada
// calculo espalhado pelo server.js (que ja assume numeros).
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val))); // numeric
// DATE volta como Date por padrao — mantemos como string 'YYYY-MM-DD' pura,
// que é o formato usado em todo o sistema (evita bug de fuso horario).
types.setTypeParser(1082, (val) => val); // date

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : undefined // usa PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT do ambiente
);

const COLLECTIONS = [
  'users', 'clientes', 'produtos', 'vendas', 'itens_venda',
  'estoque_movimentos', 'orcamentos', 'itens_orcamento',
  'ordens_servico', 'financeiro', 'producoes', 'configuracoes', 'funcionarios',
  'logs'
];

function assertCollection(name) {
  if (!COLLECTIONS.includes(name)) throw new Error(`Tabela desconhecida: "${name}"`);
}

// Nomes de coluna sao usados como identificadores no SQL gerado dinamicamente
// (ex: `UPDATE tabela SET "chave" = $1`). Para impedir injecao de SQL por
// identificador (quando um body malicioso tenta injetar no nome da coluna),
// aceitamos apenas nomes "seguros": letras minusculas, digitos e underscore.
function assertSafeKeys(keys) {
  for (const k of keys) {
    if (typeof k !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(k)) {
      throw new Error(`Campo inválido: "${k}"`);
    }
  }
}

// O driver "pg" trata Array do JS como array nativo do Postgres (ex: '{1,2}'),
// nao como JSON — entao campos jsonb (como financeiro.pagamentos) precisam
// ser serializados manualmente antes de virar parametro da query.
function toParam(val) {
  if (Array.isArray(val) || (val !== null && typeof val === 'object' && !(val instanceof Date))) {
    return JSON.stringify(val);
  }
  return val;
}

// Tabelas que possuem a coluna atualizado_em (as tabelas de "itens" e
// estoque_movimentos nao tem essa coluna — o UPDATE nao pode referenciar
// uma coluna inexistente, senao o PostgreSQL retorna erro).
const TABELAS_COM_ATUALIZADO_EM = new Set([
  'users', 'clientes', 'produtos', 'vendas', 'orcamentos',
  'ordens_servico', 'financeiro', 'producoes', 'configuracoes',
  'funcionarios', 'logs'
]);

const db = {
  async all(collection, filterFn) {
    assertCollection(collection);
    const { rows } = await pool.query(`SELECT * FROM ${collection} ORDER BY id`);
    return filterFn ? rows.filter(filterFn) : rows;
  },

  async get(collection, id) {
    assertCollection(collection);
    if (id === null || id === undefined) return null;
    const { rows } = await pool.query(`SELECT * FROM ${collection} WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async insert(collection, obj) {
    assertCollection(collection);
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined);
    assertSafeKeys(keys);
    if (keys.length === 0) {
      const { rows } = await pool.query(`INSERT INTO ${collection} DEFAULT VALUES RETURNING *`);
      return rows[0];
    }
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const values = keys.map(k => toParam(obj[k]));
    const { rows } = await pool.query(
      `INSERT INTO ${collection} (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return rows[0];
  },

  async update(collection, id, patch) {
    assertCollection(collection);
    const keys = Object.keys(patch).filter(k => patch[k] !== undefined);
    assertSafeKeys(keys);
    if (keys.length === 0) return this.get(collection, id);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`);
    if (TABELAS_COM_ATUALIZADO_EM.has(collection)) {
      sets.push(`atualizado_em = now()`);
    }
    const values = keys.map(k => toParam(patch[k]));
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE ${collection} SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async remove(collection, id) {
    assertCollection(collection);
    const { rowCount } = await pool.query(`DELETE FROM ${collection} WHERE id = $1`, [id]);
    return rowCount > 0;
  },

  // Apaga TUDO e roda a funcao de seed passada (usado no `npm run seed` e
  // na primeira inicializacao, quando o banco esta vazio).
  async reset(seedFn) {
    await pool.query(`TRUNCATE TABLE ${COLLECTIONS.join(', ')} RESTART IDENTITY CASCADE`);
    if (seedFn) await seedFn(db);
  },

  async close() {
    await pool.end();
  }
};

module.exports = db;
