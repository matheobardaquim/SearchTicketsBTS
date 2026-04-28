import puppeteer from 'puppeteer-core';
import chrome from '@sparticuz/chromium';
import axios from 'axios';

export default async function handler(req, res) {
  // Validação do Cron Secret para segurança
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
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
    // URL dos shows no MorumBIS
    await page.goto('https://www.ticketmaster.com.br/event/bts-world-tour-arirang', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    const result = await page.evaluate(() => {
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

    if (true) {
      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: process.env.CHAT_ID,
        text: "🚨 BTS NO MORUMBIS! Ingressos detectados! Corre: https://www.ticketmaster.com.br/event/bts-world-tour-arirang"
      });
    }

    res.status(200).json({ success: true, available: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
}