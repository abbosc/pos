import path from 'node:path';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing environment variable ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL', isProd ? undefined : 'postgres://postgres@localhost:5432/pos'),
  /** Password for the single admin account. */
  adminPassword: required('ADMIN_PASSWORD', isProd ? undefined : 'admin'),
  /** Secret used to sign the session cookie. */
  sessionSecret: required('SESSION_SECRET', isProd ? undefined : 'dev-secret-change-me'),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
  /** Built web app to serve in production. */
  webDir: path.resolve(process.env.WEB_DIR ?? '../web/dist'),
  timezone: 'Asia/Tashkent',
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    chatId: process.env.TELEGRAM_CHAT_ID ?? '',
  },
};
