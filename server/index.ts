import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_FILE, createAdminAuth, loadAdminCredentials } from './admin';
import { createApp, lanUrls } from './app';
import type { RoomConfig } from './config';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

// When bundled (dist/server.mjs) the client sits next to it in dist/client; in dev it may not exist yet.
const here = dirname(fileURLToPath(import.meta.url));
const candidates = [join(here, 'client'), join(here, '..', 'dist', 'client')];
const staticDir = candidates.find((d) => existsSync(join(d, 'index.html'))) ?? null;

// Optional tuning (all have sensible defaults — see README "Configuration").
const positive = (name: string): number | undefined => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const MAX_PLAYERS_LIMIT = 100; // every racer receives every racer's position 10×/s: cost grows with the square of the room size
const config: Partial<RoomConfig> = {};
const cap = positive('RACE_MAX_SECONDS');
const idle = positive('IDLE_DNF_SECONDS');
const offline = positive('OFFLINE_DNF_SECONDS');
const keys = positive('MAX_KEYS_PER_SECOND');
const players = positive('MAX_PLAYERS');
if (cap) config.raceMaxMs = cap * 1000;
if (idle) config.idleDnfMs = idle * 1000;
if (offline) config.racerOfflineMs = offline * 1000;
if (keys) config.maxKeysPerSecond = keys;
if (players) {
  config.maxPlayers = Math.min(MAX_PLAYERS_LIMIT, Math.floor(players));
  if (players > MAX_PLAYERS_LIMIT) console.warn(`MAX_PLAYERS=${players} is above the supported maximum; using ${MAX_PLAYERS_LIMIT}.`);
}
if (process.env.FINISH_GRACE_SECONDS) {
  console.warn('FINISH_GRACE_SECONDS is no longer used: a win no longer ends the race for others. See IDLE_DNF_SECONDS / RACE_MAX_SECONDS.');
}

// The admin (the only person who can create and host rooms). Without one the game cannot be run, so say how to set it up.
const credentials = loadAdminCredentials();
if (!credentials) {
  console.error('');
  console.error('  No admin is set up yet. Create the admin login first:');
  console.error('');
  console.error('      npm run admin');
  console.error('');
  console.error(`  (it asks for a username and password and saves them, hashed, to ${ADMIN_FILE}).`);
  console.error('  On a cloud host, set the ADMIN_USERNAME and ADMIN_PASSWORD environment variables instead.');
  console.error('');
  process.exit(1);
}

const stamp = () => new Date().toISOString().slice(11, 19);
const app = createApp({ staticDir, config, admin: createAdminAuth(credentials), log: (line) => console.log(`[${stamp()}] ${line}`) });

app.listen(port, host).then((p) => {
  console.log('');
  console.log('  TYPEDRIVE race server is running');
  console.log(`  Admin:    ${credentials.username}   (log in with "Admin login" at the top right)`);
  console.log(`  Local:    http://localhost:${p}`);
  for (const url of lanUrls(p)) console.log(`  Network:  ${url}   <- teammates on the same Wi-Fi/LAN can open this`);
  if (!staticDir) console.log('  (client not built — use `npm run dev` and open http://localhost:5173, or run `npm run build`)');
  console.log('');
});

const shutdown = () => {
  console.log('Shutting down…');
  app.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
