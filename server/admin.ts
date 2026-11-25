// The one admin: the only person who can create rooms, host them and run the games. Everyone else joins as a player.
//
// Credentials come from admin.json next to package.json (written by `npm run admin`; it holds a scrypt hash of the
// password, never the password) or, for cloud hosts, from the ADMIN_USERNAME / ADMIN_PASSWORD environment variables.
// A successful login returns a signed token (HMAC, 30 days) that the browser keeps and sends when it creates or rejoins a
// room; changing the password (running `npm run admin` again) signs every old token out.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AdminCredentials {
  username: string;
  /** hex */
  salt: string;
  /** scrypt(password, salt), hex */
  hash: string;
  /** signs login tokens, hex */
  secret: string;
}

export interface AdminAuth {
  readonly username: string;
  /** A token for the right username and password, otherwise null. */
  login(username: string, password: string): string | null;
  verify(token: string | undefined | null): boolean;
}

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const KEY_LEN = 64;

const normUser = (u: string) => u.trim().toLowerCase();
const scrypt = (password: string, saltHex: string) => scryptSync(password, Buffer.from(saltHex, 'hex'), KEY_LEN).toString('hex');
const sameHex = (a: string, b: string) => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

export function makeCredentials(username: string, password: string, salt = randomBytes(16).toString('hex'), secret = randomBytes(32).toString('hex')): AdminCredentials {
  const user = username.trim();
  if (!user) throw new Error('The admin username cannot be empty.');
  if (password.length < 8) throw new Error('The admin password must be at least 8 characters.');
  return { username: user, salt, hash: scrypt(password, salt), secret };
}

export function createAdminAuth(creds: AdminCredentials, now: () => number = Date.now): AdminAuth {
  const sign = (payload: string) => createHmac('sha256', Buffer.from(creds.secret, 'hex')).update(payload).digest('hex');
  return {
    username: creds.username,
    login(username, password) {
      // always hash, so a wrong username takes as long as a wrong password
      const hashOk = sameHex(scrypt(String(password), creds.salt), creds.hash);
      const userOk = normUser(String(username)) === normUser(creds.username);
      if (!hashOk || !userOk) return null;
      const exp = now() + TOKEN_TTL_MS;
      return `${exp}.${sign(`admin|${normUser(creds.username)}|${exp}`)}`;
    },
    verify(token) {
      if (typeof token !== 'string') return false;
      const dot = token.indexOf('.');
      if (dot < 1) return false;
      const exp = Number(token.slice(0, dot));
      if (!Number.isFinite(exp) || exp <= now()) return false;
      return sameHex(token.slice(dot + 1), sign(`admin|${normUser(creds.username)}|${exp}`));
    },
  };
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Where `npm run admin` writes the credentials. Kept out of git. */
export const ADMIN_FILE = process.env.ADMIN_FILE ?? join(root, 'admin.json');

function isCredentials(v: unknown): v is AdminCredentials {
  const o = v as Record<string, unknown> | null;
  return !!o && ['username', 'salt', 'hash', 'secret'].every((k) => typeof o[k] === 'string' && (o[k] as string).length > 0);
}

/** The admin's credentials: the environment variables if both are set, else admin.json, else null (not set up yet). */
export function loadAdminCredentials(env: NodeJS.ProcessEnv = process.env, file = ADMIN_FILE): AdminCredentials | null {
  const user = env.ADMIN_USERNAME?.trim();
  const pass = env.ADMIN_PASSWORD;
  if (user && pass) {
    // deterministic salt and secret, so tokens survive a restart; ADMIN_SECRET lets a host rotate them
    const salt = createHash('sha256').update(`typedrive-admin-salt|${normUser(user)}`).digest('hex').slice(0, 32);
    const secret = env.ADMIN_SECRET?.trim() || createHash('sha256').update(`typedrive-admin-secret|${normUser(user)}|${pass}`).digest('hex');
    return makeCredentials(user, pass, salt, Buffer.from(secret).toString('hex'));
  }
  if (!existsSync(file)) return null;
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isCredentials(parsed)) throw new Error(`${file} is not a valid admin file — run \`npm run admin\` again.`);
  return parsed;
}

/** Login attempts per client address: at most `max` failures per `windowMs`. */
export function createLoginLimiter(max = 8, windowMs = 5 * 60_000, now: () => number = Date.now) {
  const seen = new Map<string, { failures: number; resetAt: number }>();
  return {
    blocked(key: string): boolean {
      const e = seen.get(key);
      if (!e) return false;
      if (now() >= e.resetAt) {
        seen.delete(key);
        return false;
      }
      return e.failures >= max;
    },
    failed(key: string): void {
      const e = seen.get(key);
      if (!e || now() >= e.resetAt) seen.set(key, { failures: 1, resetAt: now() + windowMs });
      else e.failures++;
      if (seen.size > 5000) seen.clear(); // never grows without bound
    },
    succeeded(key: string): void {
      seen.delete(key);
    },
  };
}
