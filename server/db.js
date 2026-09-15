const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Vercel has a read-only filesystem — use /tmp there
const DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'ctf_nexus.db')
  : path.join(__dirname, 'ctf_nexus.db');

let dbInstance = null;

async function initDatabase() {
  const sqlJsDir = path.dirname(require.resolve('sql.js'));
  const SQL = await initSqlJs({
    locateFile: file => path.join(sqlJsDir, file)
  });

  // Load existing DB or create new
  let db;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database');
  }

  // Create users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      access_code TEXT NOT NULL,
      role TEXT DEFAULT 'operator',
      clearance_level INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

  // Create terminal_logs table (for XSS challenge)
  db.run(`
    CREATE TABLE IF NOT EXISTS terminal_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      command TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT
    )
  `);

  // Create session_logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS session_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      action TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed users if table is empty
  const countResult = db.exec('SELECT COUNT(*) as cnt FROM users');
  const count = countResult[0].values[0][0];

  if (count === 0) {
    const seedUsers = [
      ['admin', 'N3xus_Adm1n_2026!', 'ALPHA-7X-CLASSIFIED', 'administrator', 5],
      ['operator_kane', 'K4n3_Op5_S3cur3', 'BRAVO-3K-RESTRICTED', 'operator', 3],
      ['analyst_nova', 'N0v4_4n4lyst_X', 'CHARLIE-9N-CONFIDENTIAL', 'analyst', 2],
      ['ghost', 'Gh0st_Pr0t0c0l_99', 'DELTA-1G-PHANTOM', 'phantom', 4],
      ['sentinel', 'S3nt1n3l_W4tch_77', 'ECHO-5S-GUARDIAN', 'sentinel', 3]
    ];

    for (const [username, password, access_code, role, clearance_level] of seedUsers) {
      db.run(
        'INSERT INTO users (username, password, access_code, role, clearance_level) VALUES (?, ?, ?, ?, ?)',
        [username, password, access_code, role, clearance_level]
      );
    }
    console.log('[DB] Seeded', seedUsers.length, 'users');
  }

  // Seed terminal logs if empty
  const logCountResult = db.exec('SELECT COUNT(*) as cnt FROM terminal_logs');
  const logCount = logCountResult[0].values[0][0];

  if (logCount === 0) {
    const seedLogs = [
      ['admin', 'systemctl status nexus-core', '10.0.0.1'],
      ['operator_kane', 'nmap -sV 192.168.1.0/24', '10.0.0.45'],
      ['analyst_nova', 'tail -f /var/log/intrusion.log', '10.0.0.78'],
      ['ghost', 'ping -c 4 darknet.nexus.local', '10.0.0.99'],
      ['sentinel', 'iptables -L -n --line-numbers', '10.0.0.12'],
      ['admin', 'cat /etc/shadow | grep root', '10.0.0.1'],
      ['operator_kane', 'ss -tulpn', '10.0.0.45'],
      ['ghost', 'whoami && id', '10.0.0.99'],
    ];

    for (const [username, command, ip] of seedLogs) {
      db.run(
        'INSERT INTO terminal_logs (username, command, ip_address) VALUES (?, ?, ?)',
        [username, command, ip]
      );
    }
    console.log('[DB] Seeded terminal logs');
  }

  // Save to disk
  saveDatabase(db);

  dbInstance = db;
  return db;
}

function saveDatabase(db) {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error('[DB] Error saving:', e.message);
  }
}

function getDb() {
  return dbInstance;
}

module.exports = { initDatabase, saveDatabase, getDb };
