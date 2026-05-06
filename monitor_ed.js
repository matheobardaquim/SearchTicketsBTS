const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const URL_ED = 'https://www.eventim.com.br/event/ed-sheeran-loop-tour-2026-allianz-parque-21522146/';

async function sendTelegram(message) {
    if (!TELEGRAM_TOKEN || !CHAT_ID) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try { await axios.post(url, { chat_id: CHAT_ID, text: message }); } catch (err) {}
}

async function checkEdSheeran() {
    console.log(`\n--- Varredura Ed Sheeran: ${new Date().toLocaleString('pt-BR')} ---`);
    
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', // Herdado do BTS
            '--disable-gpu',                   // Herdado do BTS
            '--no-first-run',
            '--no-zygote',                     // Herdado do BTS
            '--single-process'                 // Herdado do BTS
        ] 
    });

    const page = await browser.newPage();
    // Cabeçalhos herdados do monitor do Harry Styles para maior realismo
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    try {
        await page.goto(URL_ED, { waitUntil: 'networkidle2', timeout: 60000 });

        const promoSelect = 'select[data-qa="promo-selection-box"]';
        await page.waitForSelector(promoSelect, { timeout: 30000 });
        await page.select(promoSelect, '185291'); 
        
        await new Promise(r => setTimeout(r, 6000)); 

        const result = await page.evaluate(() => {
            const sectors = Array.from(document.querySelectorAll('.js-pc-card, .event-list-item-wrapper'));
            let report = [];
            let foundTarget = false;

            sectors.forEach(sector => {
                const title = sector.querySelector('.pc-list-category span')?.innerText.trim() || "Setor Desconhecido";
                const ticketTypes = Array.from(sector.querySelectorAll('.js-ticket-type-item'));
                
                ticketTypes.forEach(tt => {
                    const name = tt.querySelector('[data-tt-name]')?.getAttribute('data-tt-name') || "";
                    const isUnavailable = !!(tt.querySelector('[data-qa="ticket-type-unavailable"]') || 
                                             tt.querySelector('.ticket-type-unavailable-sec'));
                    
                    if (name === "MEIA ENTRADA" && !isUnavailable) {
                        foundTarget = true;
                        report.push(title);
                    }
                });
            });
            return { foundTarget, sectors: report };
        });

        if (result.foundTarget) {
            await sendTelegram(`🚨 ED SHEERAN: Meia Entrada disponível em ${result.sectors.join(', ')}!\nLink: ${URL_ED}`);
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        // Gera o print se houver erro para diagnóstico na OCI
        await page.screenshot({ path: '/opt/SearchTicketsBTS/erro_eventim.png' }).catch(() => {});
    } finally {
        await browser.close();
        process.exit(0); // Garante o encerramento limpo para o próximo ciclo do CRON
    }
}

checkEdSheeran();