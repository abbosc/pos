import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from '../config.js';
import { AppError } from './errors.js';

const COOKIE = 'pos_session';
const SESSION_DAYS = 180;

function sign(value: string) {
  return createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Session token = "<expiresAtMs>.<signature>". Changing SESSION_SECRET or the password logs everyone out. */
function makeToken(expiresAt: number) {
  const payload = String(expiresAt);
  return `${payload}.${sign(`${payload}:${config.adminPassword}`)}`;
}

function verifyToken(token: string | undefined) {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  if (!safeEqual(sig, sign(`${payload}:${config.adminPassword}`))) return false;
  return Number(payload) > Date.now();
}

// Simple in-memory brute-force protection.
const attempts = new Map<string, { count: number; until: number }>();

function clientKey(c: Context) {
  return c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() || 'local';
}

export function login(c: Context, password: string) {
  const key = clientKey(c);
  const a = attempts.get(key);
  if (a && a.count >= 5 && a.until > Date.now()) {
    throw new AppError(429, 'Juda koʻp urinish. 10 daqiqadan keyin qayta urinib koʻring.');
  }
  // Compare hashes so the comparison is constant-time regardless of length.
  if (!safeEqual(sign(password), sign(config.adminPassword))) {
    if (attempts.size > 1000) {
      for (const [k, v] of attempts) if (v.until < Date.now()) attempts.delete(k);
    }
    const next = { count: (a && a.until > Date.now() ? a.count : 0) + 1, until: Date.now() + 10 * 60_000 };
    attempts.set(key, next);
    throw new AppError(401, 'Parol notoʻgʻri');
  }
  attempts.delete(key);
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 3600_000;
  setCookie(c, COOKIE, makeToken(expiresAt), {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export function logout(c: Context) {
  deleteCookie(c, COOKIE, { path: '/' });
}

export function isLoggedIn(c: Context) {
  return verifyToken(getCookie(c, COOKIE));
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!isLoggedIn(c)) throw new AppError(401, 'Tizimga kiring');
  await next();
};
