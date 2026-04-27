const http = require('http')
const fs   = require('fs')
const path = require('path')

const PORT = 3000
const ROOT = __dirname

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.woff2':'font/woff2',
}

http.createServer((req, res) => {
  // Decodificar URL y quitar query string
  const url = decodeURIComponent(req.url.split('?')[0])

  // Si es raíz, servir index.html
  if (url === '/') {
    const filePath = path.join(ROOT, 'index.html')
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(data)
    })
    return
  }

  // Normalizar y prevenir path traversal
  const safe = path.normalize(url)
  const filePath = path.join(ROOT, safe)

  // Verificar que la ruta resuelta esté dentro del directorio raíz
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return }
    const ct = MIME[path.extname(filePath)] || 'text/plain'
    res.writeHead(200, { 'Content-Type': ct })
    res.end(data)
  })
}).listen(PORT, () => {
  console.log('SEKUNET servidor activo en http://localhost:' + PORT)
})
