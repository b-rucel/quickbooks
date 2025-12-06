#!/usr/bin/env node

require('dotenv').config();
const http = require('http');
const url = require('url');

const PORT = 3000;

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  if (pathname === '/callback') {
    // Handle OAuth callback
    const code = query.code;
    const state = query.state;
    const realmId = query.realmId;

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`
        <h1>Error</h1>
        <p>No authorization code received.</p>
        <p>Error: ${query.error || 'Unknown'}</p>
        <p>Error Description: ${query.error_description || 'None'}</p>
      `);
      return;
    }

    try {
      console.log('\n[Callback] Received authorization code');
      console.log(`[Callback] Code: ${code}`);
      console.log(`[Callback] Realm ID: ${realmId}`);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head>
            <title>Authorization Successful</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; background: #f9f9f9; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
              .success { color: #28a745; font-size: 24px; }
              .info { background: #f0f0f0; padding: 15px; margin: 15px 0; border-left: 4px solid #28a745; }
              code { background: #f5f5f5; padding: 2px 6px; font-family: monospace; }
              .copy-box { background: #e8f5e9; border: 2px solid #28a745; padding: 15px; border-radius: 4px; margin: 15px 0; }
              .copy-box code { display: block; padding: 10px; background: white; border: 1px solid #ddd; border-radius: 4px; word-break: break-all; margin: 10px 0; }
              .copy-btn { background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 10px; }
              .copy-btn:hover { background: #218838; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 class="success">✓ Authorization Successful!</h1>
              <p>Your QuickBooks authorization has been completed. Use the information below in your terminal.</p>

              <div class="copy-box">
                <strong>Authorization Code (copy this):</strong><br>
                <code id="authCode">${code}</code>
                <button class="copy-btn" onclick="copyToClipboard('authCode')">Copy Code</button>
              </div>

              <div class="info">
                <strong>Realm ID (Company ID):</strong><br>
                <code id="realmCode">${realmId}</code>
                <button class="copy-btn" onclick="copyToClipboard('realmCode')">Copy Realm ID</button>
              </div>

              <div class="info">
                <strong>Next Steps:</strong>
                <ol>
                  <li>Copy the Authorization Code above</li>
                  <li>Return to your terminal running the main script</li>
                  <li>Paste the code when prompted</li>
                  <li>Paste the Realm ID when prompted</li>
                </ol>
              </div>

              <p style="color: #666; font-size: 12px;">This window will close automatically in 10 seconds...</p>
            </div>

            <script>
              function copyToClipboard(elementId) {
                const element = document.getElementById(elementId);
                navigator.clipboard.writeText(element.textContent).then(() => {
                  alert('Copied to clipboard!');
                }).catch(() => {
                  // Fallback for older browsers
                  element.select();
                  document.execCommand('copy');
                });
              }
            </script>
          </body>
        </html>
      `);

      console.log('[Callback] Authorization code and Realm ID captured\n');
      console.log('[Server] Waiting for exchange in main script...\n');

      // // Keep server running for a bit in case there are any issues
      // setTimeout(() => {
      //   console.log('[Server] Closing callback server...');
      //   server.close();
      // }, 30000);

    } catch (error) {
      console.error('[Callback Error]', error.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`
        <h1>Error</h1>
        <p>An error occurred while processing your request.</p>
        <p>Error: ${error.message}</p>
      `);
    }

  } else {
    // Root path - show status
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head>
          <title>QuickBooks OAuth Callback Server</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
          </style>
        </head>
        <body>
          <h1>QuickBooks OAuth Callback Server</h1>
          <p>Waiting for authorization callback...</p>
          <p>This server is listening for the redirect from QuickBooks.</p>
        </body>
      </html>
    `);
  }
});

server.listen(PORT, () => {
  console.log(`\n[Server] OAuth callback server listening on http://localhost:${PORT}`);
  console.log('[Server] Waiting for authorization callback...\n');
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n[Error] Port ${PORT} is already in use`);
    console.error('Make sure no other process is running on this port');
    process.exit(1);
  } else {
    console.error('[Error]', error);
    process.exit(1);
  }
});
