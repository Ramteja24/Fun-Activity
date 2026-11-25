import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest']);

/** Serves the built client (dist/client) with SPA fallback. Returns a request handler. */
export function createStaticHandler(root: string) {
  // Compressed bodies are cached per file but invalidated when the file changes (rebuilds while running).
  const gzipCache = new Map<string, { mtimeMs: number; body: Buffer }>();

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname = '/';
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = normalize(join(root, pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end(); // path traversal
      return;
    }
    let isFile = existsSync(file) && statSync(file).isFile();
    if (!isFile) {
      // Missing asset → 404; anything else is a client-side route → index.html
      if (extname(pathname) && pathname !== '/') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      file = join(root, 'index.html');
      isFile = existsSync(file);
    }
    if (!isFile) {
      res
        .writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end('Client not built yet. Run "npm run build" (or use "npm run dev").');
      return;
    }

    const ext = extname(file).toLowerCase();
    const headers: Record<string, string | number> = {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // Hashed bundles never change. Everything else (the page, /music/, /sfx/) is revalidated on every load: a file
      // replaced in place is picked up at once, and an unchanged one costs a 304 instead of a re-download.
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    };

    const stat = statSync(file);
    headers['Last-Modified'] = stat.mtime.toUTCString();
    const since = Date.parse(String(req.headers['if-modified-since'] ?? ''));
    if (!req.headers.range && Number.isFinite(since) && Math.floor(stat.mtimeMs / 1000) * 1000 <= since) {
      res.writeHead(304, { 'Cache-Control': headers['Cache-Control'] as string, 'Last-Modified': headers['Last-Modified'], Vary: 'Accept-Encoding' }).end();
      return;
    }
    const wantsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    if (wantsGzip && COMPRESSIBLE.has(ext)) {
      let entry = gzipCache.get(file);
      if (!entry || entry.mtimeMs !== stat.mtimeMs) {
        entry = { mtimeMs: stat.mtimeMs, body: gzipSync(await readFile(file)) };
        gzipCache.set(file, entry);
      }
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      headers['Content-Length'] = entry.body.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : entry.body);
      return;
    }
    // Uncompressed files accept byte ranges: audio elements seek with them (that is how a looping track restarts).
    headers['Accept-Ranges'] = 'bytes';
    const range = parseRange(req.headers.range, stat.size);
    if (range === 'invalid') {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
      return;
    }
    if (range) {
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
      headers['Content-Length'] = range.end - range.start + 1;
      res.writeHead(206, headers);
      if (req.method === 'HEAD') res.end();
      else createReadStream(file, { start: range.start, end: range.end }).pipe(res);
      return;
    }
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  };
}

/** A single `bytes=a-b`, `bytes=a-` or `bytes=-n` range. `null` = no (or unsupported) range header → serve the whole file. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const n = Number(m[2]); // the last n bytes
    if (n === 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}
