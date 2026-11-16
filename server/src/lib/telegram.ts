import { config } from '../config.js';
import { bus } from './events.js';

/**
 * Optional Telegram notifications. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable.
 * A full bot (commands, buttons) can later be added next to this file and subscribe to the same events.
 */
const som = (v: number) => `${new Intl.NumberFormat('ru-RU').format(v).replace(/ /g, ' ')} soʻm`;

export async function sendTelegram(text: string) {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) return;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) console.error('[telegram] sendMessage failed', res.status, await res.text());
}

export function registerTelegramNotifications() {
  if (!config.telegram.botToken || !config.telegram.chatId) return;
  bus.on('cash.closed', (s) => {
    const diff = s.difference === 0 ? '✅ 0' : s.difference > 0 ? `➕ ${som(s.difference)}` : `❗️ ${som(s.difference)}`;
    return sendTelegram(
      [
        '<b>☕️ Kassa yopildi</b>',
        `Ichimliklar: ${som(s.drinkSales)}`,
        `Sneklar: ${som(s.snackSales)}`,
        `Xarajatlar (kassadan): ${som(s.cashExpenses)}`,
        s.withdrawals ? `Olingan pul: ${som(s.withdrawals)}` : '',
        `Kutilgan: ${som(s.expected)}`,
        `Sanalgan: ${som(s.counted)}`,
        `Farq: ${diff}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  });
  bus.on('stock.low', (items) =>
    sendTelegram(
      ['<b>⚠️ Kam qolgan mahsulotlar</b>', ...items.map((i) => `${i.name}: vitrinada ${i.standQty}, omborda ${i.warehouseQty}`)].join(
        '\n',
      ),
    ),
  );
}
