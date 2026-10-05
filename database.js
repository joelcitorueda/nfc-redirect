// ============================================================
//  Base de datos — LibSQL (Turso en produccion, SQLite local)
// ============================================================
const { createClient } = require('@libsql/client');

// En local usa un archivo SQLite. En Vercel usa Turso (variables de entorno).
const client = createClient(
  process.env.TURSO_DATABASE_URL
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: 'file:tarjetas.db' }
);

// ── Crear tablas ─────────────────────────────────────────────
async function init() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS cards (
      id            TEXT PRIMARY KEY,
      business_name TEXT DEFAULT '',
      google_url    TEXT DEFAULT '',
      notes         TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now','localtime')),
      updated_at    TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS scans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id    TEXT NOT NULL,
      scanned_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
}

// ── CRUD ─────────────────────────────────────────────────────
async function getAllCards() {
  const r = await client.execute(`
    SELECT c.*,
           COUNT(s.id)    as total_scans,
           MAX(s.scanned_at) as last_scan
    FROM cards c
    LEFT JOIN scans s ON s.card_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `);
  return r.rows;
}

async function getCard(id) {
  const r = await client.execute({ sql: 'SELECT * FROM cards WHERE id = ?', args: [id] });
  return r.rows[0] || null;
}

async function createCard(id, business_name, google_url, notes) {
  await client.execute({
    sql: 'INSERT INTO cards (id, business_name, google_url, notes) VALUES (?, ?, ?, ?)',
    args: [id, business_name, google_url, notes]
  });
}

async function updateCard(id, business_name, google_url, notes) {
  await client.execute({
    sql: `UPDATE cards SET business_name=?, google_url=?, notes=?,
          updated_at=datetime('now','localtime') WHERE id=?`,
    args: [business_name, google_url, notes, id]
  });
}

async function deleteCard(id) {
  await client.execute({ sql: 'DELETE FROM scans WHERE card_id = ?', args: [id] });
  await client.execute({ sql: 'DELETE FROM cards WHERE id = ?', args: [id] });
}

async function registerScan(card_id) {
  await client.execute({ sql: 'INSERT INTO scans (card_id) VALUES (?)', args: [card_id] });
}

async function getStats(card_id) {
  const total  = await client.execute({ sql: 'SELECT COUNT(*) as total FROM scans WHERE card_id = ?', args: [card_id] });
  const recent = await client.execute({ sql: 'SELECT scanned_at FROM scans WHERE card_id = ? ORDER BY scanned_at DESC LIMIT 10', args: [card_id] });
  return { total: total.rows[0]?.total || 0, recent_scans: recent.rows };
}

module.exports = { init, getAllCards, getCard, createCard, updateCard, deleteCard, registerScan, getStats };
