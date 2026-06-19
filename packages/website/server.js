// Simple static file server for the marketing site
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.WEBSITE_PORT || '3200', 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

const server = createServer((req, res) => {
  let pathname = req.url?.split('?')[0] || '/';

  // Default to index.html
  if (pathname === '/') pathname = '/index.html';

  // Remove leading slash and resolve file
  const filePath = join(__dirname, pathname);

  // Serve dashboard page at /dashboard
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard?')) {
    const dashPath = join(__dirname, 'dashboard.html');
    const content = readFileSync(dashPath);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
    return;
  }

  if (!existsSync(filePath)) {
    // SPA fallback: serve index.html for non-file routes
    const indexPath = join(__dirname, 'index.html');
    const content = readFileSync(indexPath);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
    return;
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  }
});

server.listen(PORT, () => {
  console.log(`Mergenote website running at http://localhost:${PORT}`);
});
