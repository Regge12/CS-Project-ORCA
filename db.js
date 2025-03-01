const Database = require('better-sqlite3');
const db = new Database('chat_auth.db');

// Create Users table if not exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )
`).run();

// exports database so that index.js can access it
module.exports = db;
