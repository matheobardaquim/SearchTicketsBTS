// api/check.js
const puppeteer = require('puppeteer-core');
const chrome = require('@sparticuz/chromium');
const axios = require('axios');

export default async function handler(req, res) {
  // Proteção básica: só permite que o Vercel Cron chame essa URL
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Não autorizado');
  }

  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: chrome.args,
      defaultViewport: chrome.defaultViewport,
      executablePath: await chrome.executablePath(),
      headless: chrome.headless,
    });

    const page = await browser.newPage();
    await page.goto('https://www.ticketmaster.com.br/event/bts-world-tour-arirang', { waitUntil: 'networkidle2' });

    const isAvailable = await page.evaluate(() => {
      const items = document.querySelectorAll('.tmpe-ticket-item');
      let found = false;
      items.forEach(item => {
        const dot = item.querySelector('.tmpe-status-dot');
        const text = item.querySelector('.tmpe-link-details')?.innerText.toUpperCase();
        if (dot && !dot.classList.contains('tmpe-dot-soldout') && text !== 'ESGOTADO') {
          found = true;
        }
      });
      return found;
    });

    if (isAvailable) {
      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: process.env.CHAT_ID,
        text: "🚨 INGRESSO DISPONÍVEL! Corre no site!"
      });
    }

    res.status(200).json({ checked: true, available: isAvailable });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
}