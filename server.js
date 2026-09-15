/**
 * Root Entrypoint for CTF Nexus Server
 * Used by Render, Railway, Heroku, and standard Node.js hosting environments
 */
const app = require('./server/server');

if (require.main === module) {
  if (typeof app.startServer === 'function') {
    app.startServer();
  } else {
    const PORT = process.env.PORT || 3000;
    const HOST = process.env.HOST || '0.0.0.0';
    app.listen(PORT, HOST, () => {
      console.log(`Nexus CTF server active on http://${HOST}:${PORT}`);
    });
  }
}

module.exports = app;
