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
        console.log("✅ Alerta crítico enviado ao Telegram!");
    } catch (err) {
        console.error("❌ Erro ao enviar Telegram:", err.response?.data || err.message);
    }
}

async function checkHarryTickets() {
    console.log(`\n===========================================`);
    console.log(`--- Varredura Harry Styles: ${new Date().toLocaleString('pt-BR')} ---`);
    
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
            console.log(`\n📅 Analisando Data: ${dateObj.dataTexto}`);
            await page.evaluate((id) => document.getElementById(id).click(), dateObj.id);
            await page.waitForSelector('#buyButton', { timeout: 15000 });
            await page.evaluate(() => document.getElementById('buyButton').click());
            await page.waitForSelector('.sectorOption', { timeout: 30000 });

            // DEBUG: Lê todos os setores que o mapa renderizou no DOM
            const setoresNaTela = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('.sectorOption'))
                    .map(opt => opt.innerText.trim().replace(/\n/g, ' '));
            });
            console.log(`   🗺️ Setores renderizados no DOM: ${setoresNaTela.join(' | ')}`);

            const sectors = ['Pit Circle', 'Pit Disco'];
            for (const s of sectors) {
                console.log(`   📍 Inspecionando setor: ${s}...`);
                
                // LÓGICA DE CLIQUE CORRIGIDA (Corte no \n)
                const clicked = await page.evaluate((name) => {
                    const options = Array.from(document.querySelectorAll('.sectorOption'));
                    
                    const target = options.find(opt => {
                        // Pega o texto bruto e quebra no \n
                        const linhas = opt.innerText.split('\n');
                        // Pega só a primeira linha, tira os espaços em branco das pontas e compara
                        const nomeReal = linhas[0].trim().toUpperCase();
                        
                        return nomeReal === name.toUpperCase();
                    });
                    
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        target.click(); 
                        return true; 
                    }
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
                        console.log(`   🚨 INGRESSOS ENCONTRADOS EM ${s}! Notificando...`);
                        await sendTelegram(`🚨 HARRY - ${s} DISPONÍVEL!\nData: ${dateObj.dataTexto}\nLink: ${URL_HARRY}`);
                    } else {
                         console.log(`   ❌ Nada disponível para público geral em ${s}.`);
                    }
                } else {
                    console.log(`   ⚠️ Setor ${s} indisponível para clique no mapa.`);
                }
                
                // Limpa a seleção e aguarda o DOM reagir antes do próximo loop
                await page.evaluate(() => document.getElementById('clean_selection')?.click());
                await new Promise(resolve => setTimeout(resolve, 1500)); 
            }
            await page.goto(URL_HARRY, { waitUntil: 'domcontentloaded' });
        }

    } catch (error) {
        console.error('❌ Erro durante a varredura:', error.message);
    } finally {
        await browser.close();
        console.log("🏁 Processo encerrado de forma limpa.");
        process.exit(0); 
    }
}

checkHarryTickets();