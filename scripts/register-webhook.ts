import 'dotenv/config';

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const base = process.env.BASE_URL;
  if (!token || !base) throw new Error('TELEGRAM_BOT_TOKEN and BASE_URL required');

  const url = `${base}/api/telegram`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  console.log(await res.json());
}
main();
