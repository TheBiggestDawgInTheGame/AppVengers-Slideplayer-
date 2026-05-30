// db.js — SQL Server connection pool (mssql)
const sql = require('mssql');

const config = {
  server:   process.env.DB_SERVER   || 'DESKTOP-734DTIS',
  database: process.env.DB_NAME     || 'SLIDEPLAYDB',
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt:                false,   // set true if using Azure
    trustServerCertificate: true,    // for local/self-signed certs
    enableArithAbort:       true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    console.log('✅ Connected to SLIDEPLAYDB');
  }
  return pool;
}

// Convenience query helper
async function query(text, params = {}) {
  const p = await getPool();
  const request = p.request();
  Object.entries(params).forEach(([key, val]) => request.input(key, val));
  return request.query(text);
}

module.exports = { getPool, query, sql };
