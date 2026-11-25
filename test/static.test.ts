import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createStaticHandler, parseRange } from '../server/static';

// The static file server: the background track needs the right MIME type and byte ranges (audio elements seek with
// them — that is how a looping clip restarts), without disturbing how the rest of the client is served.

describe('static files', () => {
  let dir: string;
  let server: Server;
  let base: string;
  const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'typedrive-static-'));
    mkdirSync(join(dir, 'music'));
    mkdirSync(join(dir, 'sfx'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
    writeFileSync(join(dir, 'music', 'clip.mp3'), bytes);
    writeFileSync(join(dir, 'sfx', 'cue.wav'), bytes);
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    const handle = createStaticHandler(dir);
    server = createServer((req, res) => void handle(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });

  test('an MP3 is served as audio/mpeg, advertises byte ranges and is revalidated rather than blindly cached', async () => {
    const res = await fetch(`${base}/music/clip.mp3`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/mpeg');
    assert.equal(res.headers.get('accept-ranges'), 'bytes');
    assert.equal(res.headers.get('content-length'), '1000');
    assert.equal(res.headers.get('cache-control'), 'no-cache', 'a replaced track is picked up at once, not a day later');
    assert.match(res.headers.get('last-modified') ?? '', /GMT$/);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);
  });

  test('a WAV cue is served as audio/wav', async () => {
    const res = await fetch(`${base}/sfx/cue.wav`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/wav');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);
  });

  test('revalidation: an unchanged file is a 304, a newer one is sent in full, the hashed bundles stay immutable', async () => {
    const first = await fetch(`${base}/music/clip.mp3`);
    const lastModified = first.headers.get('last-modified')!;
    await first.arrayBuffer();
    const same = await fetch(`${base}/music/clip.mp3`, { headers: { 'If-Modified-Since': lastModified } });
    assert.equal(same.status, 304);
    assert.equal((await same.arrayBuffer()).byteLength, 0);
    assert.equal(same.headers.get('last-modified'), lastModified);
    const older = await fetch(`${base}/music/clip.mp3`, { headers: { 'If-Modified-Since': new Date(Date.parse(lastModified) - 60_000).toUTCString() } });
    assert.equal(older.status, 200, 'the file changed since the cached copy → full response');
    assert.equal((await older.arrayBuffer()).byteLength, 1000);
    const ranged = await fetch(`${base}/music/clip.mp3`, { headers: { 'If-Modified-Since': lastModified, Range: 'bytes=0-9' } });
    assert.equal(ranged.status, 206, 'a ranged request is always answered with the bytes');
    await ranged.arrayBuffer();
    const asset = await fetch(`${base}/assets/app.js`);
    assert.match(asset.headers.get('cache-control') ?? '', /immutable/);
    await asset.arrayBuffer();
  });

  test('byte ranges: a slice, an open-ended range and a suffix range come back as 206 with the right bytes', async () => {
    const cases: [string, number, number][] = [
      ['bytes=0-9', 0, 9],
      ['bytes=100-199', 100, 199],
      ['bytes=990-', 990, 999],
      ['bytes=-5', 995, 999],
      ['bytes=900-5000', 900, 999], // end beyond the file is clamped
    ];
    for (const [range, a, b] of cases) {
      const res = await fetch(`${base}/music/clip.mp3`, { headers: { Range: range } });
      assert.equal(res.status, 206, range);
      assert.equal(res.headers.get('content-range'), `bytes ${a}-${b}/1000`, range);
      assert.equal(res.headers.get('content-length'), String(b - a + 1), range);
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes.subarray(a, b + 1), range);
    }
  });

  test('an unsatisfiable range is a 416, and a malformed one is ignored (whole file)', async () => {
    const bad = await fetch(`${base}/music/clip.mp3`, { headers: { Range: 'bytes=5000-6000' } });
    assert.equal(bad.status, 416);
    assert.equal(bad.headers.get('content-range'), 'bytes */1000');
    await bad.arrayBuffer();
    for (const odd of ['bytes=0-1,5-6', 'items=0-5', 'bytes=abc']) {
      const res = await fetch(`${base}/music/clip.mp3`, { headers: { Range: odd } });
      assert.equal(res.status, 200, odd);
      assert.equal((await res.arrayBuffer()).byteLength, 1000);
    }
  });

  test('HEAD with a range returns headers only', async () => {
    const res = await fetch(`${base}/music/clip.mp3`, { method: 'HEAD', headers: { Range: 'bytes=0-9' } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('content-length'), '10');
    assert.equal((await res.arrayBuffer()).byteLength, 0);
  });

  test('the rest of the client is served exactly as before: gzip for text, long cache for /assets, SPA fallback, 404 for missing files', async () => {
    const js = await fetch(`${base}/assets/app.js`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(js.headers.get('content-encoding'), 'gzip');
    assert.equal(js.headers.get('accept-ranges'), null, 'compressed bodies are not range-served');
    assert.match(js.headers.get('cache-control') ?? '', /immutable/);
    await js.arrayBuffer();
    const spa = await fetch(`${base}/some/client/route`);
    assert.equal(spa.status, 200);
    assert.match(await spa.text(), /<title>x<\/title>/);
    const missing = await fetch(`${base}/music/missing.mp3`);
    assert.equal(missing.status, 404);
    await missing.arrayBuffer();
  });
});

test('parseRange', () => {
  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=10-', 100), { start: 10, end: 99 });
  assert.deepEqual(parseRange('bytes=-30', 100), { start: 70, end: 99 });
  assert.deepEqual(parseRange('bytes=-500', 100), { start: 0, end: 99 });
  assert.equal(parseRange('bytes=100-', 100), 'invalid');
  assert.equal(parseRange('bytes=50-10', 100), 'invalid');
  assert.equal(parseRange('bytes=-0', 100), 'invalid');
  assert.equal(parseRange(undefined, 100), null);
  assert.equal(parseRange('bytes=-', 100), null);
});
