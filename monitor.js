const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const URL_BTS = 'https://www.ticketmaster.com.br/event/bts-world-tour-arirang';

async function sendTelegram(message) {
    if (!TELEGRAM_TOKEN || !CHAT_ID) {
        console.log("⚠️ TELEGRAM_TOKEN ou CHAT_ID não configurados!");
        return;
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        await axios.post(url, { chat_id: CHAT_ID, text: message, parse_mode: 'HTML' });
        console.log("✅ Alerta enviado ao Telegram!");
    } catch (err) {
        console.error("❌ Erro ao enviar Telegram:", err.response?.data || err.message);
    }
}

async function checkTickets() {
    console.log(`\n===========================================`);
    console.log(`--- Varredura BTS: ${new Date().toLocaleString('pt-BR')} ---`);
    
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ] 
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });

    try {
        console.log("📍 Acessando portal Ticketmaster...");
        await page.goto(URL_BTS, { waitUntil: 'networkidle2', timeout: 60000 });

        const result = await page.evaluate(() => {
            const items = document.querySelectorAll('.tmpe-ticket-item');
            let availableDates = [];
            items.forEach(item => {
                const dateTitle = item.querySelector('.tmpe-ticket-title')?.innerText.trim();
                const dot = item.querySelector('.tmpe-status-dot');
                const linkText = item.querySelector('.tmpe-link-details')?.innerText.toUpperCase();
                const isSoldOut = dot && dot.classList.contains('tmpe-dot-soldout');
                if (!isSoldOut && linkText !== 'ESGOTADO') availableDates.push(dateTitle);
            });
            return { anyAvailable: availableDates.length > 0, dates: availableDates };
        });

        if (result.anyAvailable) {
            console.log(`🚨 INGRESSOS ENCONTRADOS! Notificando...`);
            const msg = `🚨 <b>BTS DISPONÍVEL!</b>\n\n📅 <b>Datas:</b> ${result.dates.join(', ')}\n\n🔗 <a href="${URL_BTS}">Garanta na Ticketmaster</a>`;
            await sendTelegram(msg);
        } else {
            console.log("❌ Tudo continua esgotado para o BTS.");
        }

    } catch (error) {
        console.error('❌ Erro durante a varredura:', error.message);
    } finally {
        await browser.close();
        console.log("🏁 Varredura encerrada.");
    }
}

// Loop contínuo a cada 5 minutos (300.000 ms)
async function startMonitor() {
    await checkTickets();
    console.log("⏱️ Aguardando 5 minutos para a próxima varredura...");
    setTimeout(startMonitor, 300000);
}

startMonitor();