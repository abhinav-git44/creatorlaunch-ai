// Local dev server that mimics Vercel: serves /public with clean URLs, applies the rewrites
// from vercel.json and runs /api/*.js handlers. Zero dependencies.
//   npm run dev   ->  http://localhost:3000
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const config = JSON.parse(await fs.readFile(path.join(ROOT, 'vercel.json'), 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function matchRewrite(pathname) {
  for (const r of config.rewrites || []) {
    const names = [];
    const re = new RegExp('^' + r.source.replace(/:([a-zA-Z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
    const m = pathname.match(re);
    if (m) {
      let dest = r.destination;
      names.forEach((n, i) => { dest = dest.replace(`:${n}`, encodeURIComponent(decodeURIComponent(m[i + 1]))); });
      return dest;
    }
  }
  return null;
}

async function serveStatic(pathname, res) {
  const candidates = pathname.endsWith('/')
    ? [path.join(PUBLIC, pathname, 'index.html')]
    : [path.join(PUBLIC, pathname), path.join(PUBLIC, `${pathname}.html`)];
  for (const file of candidates) {
    if (!file.startsWith(PUBLIC)) break;
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
      return true;
    } catch { /* try next */ }
  }
  return false;
}

// Apply vercel.json "headers" so local runs (and tests) see the same security headers as production.
const headerRules = (config.headers || []).map((h) => ({ re: new RegExp(`^${h.source}$`), headers: h.headers }));
function applyHeaders(pathname, res) {
  for (const rule of headerRules) if (rule.re.test(pathname)) for (const { key, value } of rule.headers) res.setHeader(key, value);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    const original = new URL(req.url, `http://localhost:${PORT}`);
    applyHeaders(original.pathname, res);
    const rewritten = matchRewrite(original.pathname);
    const target = new URL(rewritten || original.pathname, original);
    for (const [k, v] of original.searchParams) if (!target.searchParams.has(k)) target.searchParams.set(k, v);

    if (target.pathname.startsWith('/api/')) {
      const name = target.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
      const file = path.join(ROOT, 'api', `${name}.js`);
      let mod;
      try {
        mod = await import(pathToFileURL(file).href);
      } catch (err) {
        if (err.code !== 'ERR_MODULE_NOT_FOUND') console.error(err);
        res.writeHead(404, { 'content-type': 'application/json' });
        return res.end('{"error":{"message":"Not found"}}');
      }
      req.query = Object.fromEntries(target.searchParams.entries());
      await mod.default(req, res);
    } else if (!(await serveStatic(target.pathname, res))) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  } finally {
    if (process.env.DEV_LOG !== '0') console.log(`${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started}ms)`);
  }
});

server.listen(PORT, () => {
  console.log(`Sell Sphere running at http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) console.log('!  GEMINI_API_KEY is not set: generation will return "AI not configured".');
  if (!process.env.SUPABASE_URL) console.log('i  SUPABASE_URL not set: using local file storage in .data/ (dev only).');
});
