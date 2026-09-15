const path = require('path');
const express = require('express');
const session = require('express-session');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const { initDatabase, saveDatabase, getDb } = require('./db');
const { getPdfBuffer, getFlagContent } = require('./embedded_data');

const app = express();

// ─── Middleware ───
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session config
app.use(session({
  secret: 'nexus-ctf-secret-key-2026-ultraclassified',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 60 * 1000, // 30 minutes
    httpOnly: true
  }
}));

// Rate limiting — generous for CTF but prevents total abuse
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Rate limit exceeded. Slow down, operator.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Async DB Initialization ───
let db = null;
const dbReady = initDatabase().then(d => { db = d; return d; }).catch(e => {
  console.error('[DB] Failed to initialize database:', e);
  throw e;
});

// Middleware to ensure DB is ready before handling any request
app.use(async (req, res, next) => {
  try {
    if (!db) db = await dbReady;
    next();
  } catch (err) {
    console.error('DB Init Error:', err);
    res.status(500).send('500 - Internal Server Error (Database Initialization Failed)');
  }
});

// ─── Auth Middleware ───
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.redirect('/?error=Access denied. Authentication required.');
}

// ─── Helper: query sql.js and return rows as objects ───
function queryAll(sql) {
  try {
    const results = db.exec(sql);
    if (!results || results.length === 0) return [];
    const { columns, values } = results[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } catch (e) {
    throw e;
  }
}

function queryOne(sql) {
  const rows = queryAll(sql);
  return rows.length > 0 ? rows[0] : null;
}

function queryScalar(sql) {
  try {
    const results = db.exec(sql);
    if (!results || results.length === 0) return 0;
    return results[0].values[0][0];
  } catch (e) {
    return 0;
  }
}

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

// ─── GET / — Login Page ───
app.get('/', (req, res) => {
  const error = req.query.error || null;
  const success = req.query.success || null;
  res.render('login', { error, success });
});

// ─── POST /login — VULNERABLE TO SQL INJECTION ───
app.post('/login', (req, res) => {
  const { username, password, access_code } = req.body;

  if (!username || !password) {
    return res.render('login', {
      error: 'All fields are required, operator.',
      success: null
    });
  }

  try {
    // ╔══════════════════════════════════════════════════╗
    // ║  ⚠️  INTENTIONALLY VULNERABLE TO SQL INJECTION  ║
    // ║  Raw string concatenation — NO parameterized    ║
    // ║  queries. This is the CTF challenge!            ║
    // ╚══════════════════════════════════════════════════╝
    const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;

    // Log the attempt (safely, ironically)
    try {
      db.run(
        'INSERT INTO session_logs (username, action, details) VALUES (?, ?, ?)',
        [String(username).substring(0, 50), 'LOGIN_ATTEMPT', `Access code: ${String(access_code || 'none').substring(0, 50)}`]
      );
      saveDatabase(db);
    } catch (e) { /* silent */ }

    const user = queryOne(query);

    if (user) {
      // Successful login (or successful SQLi!)
      req.session.authenticated = true;
      req.session.user = {
        id: user.id || 0,
        username: user.username || 'UNKNOWN',
        role: user.role || 'intruder',
        clearance_level: user.clearance_level || 0
      };

      // Update last login
      try {
        db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
        saveDatabase(db);
      } catch (e) { /* silent */ }

      return res.redirect('/dashboard');
    } else {
      return res.render('login', {
        error: `Authentication failed for user: ${username}. Invalid credentials.`,
        success: null
      });
    }
  } catch (err) {
    // SQL errors might leak info — intentional for CTF
    return res.render('login', {
      error: `Database error: ${err.message}`,
      success: null
    });
  }
});

// ─── GET /dashboard — Main Dashboard ───
app.get('/dashboard', requireAuth, (req, res) => {
  const user = req.session.user;

  // Get some stats
  const userCount = queryScalar('SELECT COUNT(*) FROM users');
  const logCount = queryScalar('SELECT COUNT(*) FROM terminal_logs');

  res.render('dashboard', {
    user,
    stats: {
      userCount,
      logCount,
      uptime: Math.floor(process.uptime()),
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      workers: 1
    }
  });
});

// ─── GET /terminal — Terminal Page (XSS Target) ───
app.get('/terminal', requireAuth, (req, res) => {
  let logs = [];
  try {
    logs = queryAll('SELECT * FROM terminal_logs ORDER BY timestamp DESC LIMIT 50');
  } catch (e) { /* silent */ }

  res.render('terminal', {
    user: req.session.user,
    logs,
    message: req.query.message || null
  });
});

// ─── POST /terminal — Submit Command (XSS Injection Point) ───
app.post('/terminal', requireAuth, (req, res) => {
  const { command } = req.body;
  const user = req.session.user;

  if (!command || command.trim() === '') {
    return res.redirect('/terminal?message=Empty command rejected.');
  }

  try {
    // Store the command WITHOUT any sanitization — intentional XSS vulnerability
    db.run(
      'INSERT INTO terminal_logs (username, command, ip_address) VALUES (?, ?, ?)',
      [user.username, command, req.ip]
    );
    saveDatabase(db);
  } catch (e) {
    console.error('[TERMINAL] Error storing command:', e.message);
  }

  return res.redirect('/terminal');
});

// ─── GET /documents/classified — Serve Knowledge.pdf ───
app.get('/documents/classified', requireAuth, (req, res) => {
  try {
    const pdfData = getPdfBuffer();
    if (!pdfData || pdfData.length === 0) {
      return res.status(404).send('Document not found in the archive.');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Knowledge.pdf"');
    res.setHeader('Content-Length', pdfData.length);
    return res.send(pdfData);
  } catch (err) {
    console.error('[ARCHIVE] Error serving PDF:', err.message);
    return res.status(500).send('Archive retrieval failed.');
  }
});

// ─── GET /api/flag — Returns flag.txt content ───
// This endpoint is "hidden" — discoverable via XSS
app.get('/api/flag', (req, res) => {
  res.json({
    status: 'CLASSIFIED',
    flag_content: getFlagContent(),
    message: 'Congratulations! You have successfully exploited the XSS vulnerability.',
    timestamp: new Date().toISOString()
  });
});

// ─── GET /logout ───
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/?success=Session terminated. Stay vigilant.');
});

// ─── 404 handler ───
app.use((req, res) => {
  res.status(404).render('login', {
    error: '404 — Route not found in the Nexus network.',
    success: null
  });
});

// ═══════════════════════════════════════════════════════
// EXPORT FOR VERCEL & LOCAL DEVELOPMENT
// ═══════════════════════════════════════════════════════

// Export the app for Vercel serverless functions
module.exports = app;

// ─── Local Development: Cluster Mode ───
if (require.main === module) {
  const cluster = require('cluster');
  const os = require('os');
  const NUM_WORKERS = Math.max(2, os.cpus().length);

  if (cluster.isPrimary) {
    console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║          NEXUS CTF CHALLENGE SERVER                  ║
  ║          ══════════════════════════                   ║
  ║   Primary process ${process.pid} is running              ║
  ║   Forking ${NUM_WORKERS} workers for max concurrency...            ║
  ╚══════════════════════════════════════════════════════╝
  `);

    for (let i = 0; i < NUM_WORKERS; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      console.log(`[CLUSTER] Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
      cluster.fork();
    });
  } else {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`[WORKER ${process.pid}] Nexus CTF server active on port ${PORT}`);
    });
  }
}
