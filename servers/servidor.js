// Servidor local em Node.js puro (sem dependencias / sem npm install)
// Serve a pasta atual em http://localhost:8000 e abre o navegador.
// Uso:  node servidor.js
// Parar: Ctrl+C
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8000;
const ARQUIVO = 'index.html';
const ROOT = require('path').join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.vtt':  'text/vtt; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  if (!rel) rel = ARQUIVO;
  const filePath = path.join(ROOT, rel);

  // impede sair da pasta (path traversal)
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('403 - acesso negado'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end('404 - nao encontrado: ' + rel);
      console.log('  > 404 ' + rel);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
    console.log('  > 200 ' + rel);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/${ARQUIVO}`;
  console.log('========================================================');
  console.log(`  Servidor rodando em http://localhost:${PORT}`);
  console.log(`  Aplicacao: ${url}`);
  console.log('  Para parar: feche esta janela ou pressione Ctrl+C');
  console.log('========================================================');
  // abre o navegador (Windows: start / Mac: open / Linux: xdg-open)
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
            : process.platform === 'darwin' ? `open "${url}"`
            : `xdg-open "${url}"`;
  exec(cmd, () => {});
});
