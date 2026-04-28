const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const URL_HARRY = 'https://www.ticketmaster.com.br/event/venda-geral-harry-styles';

async function sendTelegram(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        await axios.post(url, { chat_id: CHAT_ID, text: message });
        console.log("✅ Notificação enviada ao Telegram!");
    } catch (err) {
        console.error("❌ Erro ao enviar Telegram:", err.response?.data || err.message);
    }
}

async function checkHarryTickets() {
    console.log(`\n--- Varredura Harry Styles: ${new Date().toLocaleString('pt-BR')} ---`);
    
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
        await page.goto(URL_HARRY, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('a.show', { timeout: 30000 });

        const availableDatesInfo = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a.show'));
            return links
                .filter(l => !l.innerText.toUpperCase().includes('ESGOTADO'))
                .map(l => ({ id: l.id, dataTexto: l.innerText.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || l.id }));
        });

        for (const dateObj of availableDatesInfo) {
            console.log(`Verificando Data: ${dateObj.dataTexto}`);
            await page.evaluate((id) => document.getElementById(id).click(), dateObj.id);
            await page.waitForSelector('#buyButton', { timeout: 15000 });
            await page.evaluate(() => document.getElementById('buyButton').click());
            await page.waitForSelector('.sectorOption', { timeout: 30000 });

            const sectors = ['Pit Circle', 'Pit Disco'];
            for (const s of sectors) {
                const clicked = await page.evaluate((name) => {
                    const target = Array.from(document.querySelectorAll('.sectorOption')).find(opt => opt.innerText.toUpperCase().includes(name.toUpperCase()));
                    if (target) { target.click(); return true; }
                    return false;
                }, s);

                if (clicked) {
                    await page.waitForFunction(() => document.querySelectorAll('#rates .item.item-rate').length > 0);
                    const available = await page.evaluate(() => {
                        return Array.from(document.querySelectorAll('#rates .item.item-rate'))
                            .filter(t => !t.querySelector('.sold-out') && !t.innerText.toUpperCase().includes('PCD') && !t.innerText.toUpperCase().includes('IDOSO'))
                            .map(t => t.querySelector('h5')?.innerText.trim().split('\n')[0]);
                    });

                    if (available.length > 0) {
                        await sendTelegram(`🚨 HARRY - ${s} DISPONÍVEL!\nData: ${dateObj.dataTexto}\nLink: ${URL_HARRY}`);
                    }
                }
                await page.evaluate(() => document.getElementById('clean_selection')?.click());
            }
            await page.goto(URL_HARRY, { waitUntil: 'domcontentloaded' });
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await browser.close();
        process.exit(0); // Essencial para o PM2 Cron
    }
}

checkHarryTickets();