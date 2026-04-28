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
        console.log("Acessando Ticketmaster...");
        await page.goto(URL_HARRY, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('a.show', { timeout: 30000 });

        const availableDatesInfo = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a.show'))
                .filter(l => !l.innerText.toUpperCase().includes('ESGOTADO'))
                .map(l => ({ id: l.id, dataTexto: l.innerText.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || l.id }));
        });

        for (const dateObj of availableDatesInfo) {
            console.log(`\n📅 Analisando Data: ${dateObj.dataTexto}`);
            await page.evaluate((id) => document.getElementById(id).click(), dateObj.id);
            await page.waitForSelector('#buyButton', { timeout: 15000 });
            await page.evaluate(() => document.getElementById('buyButton').click());
            
            // Removido Pit Square: Focando apenas no essencial
            const sectors = ['Pit Circle', 'Pit Disco'];
            for (const s of sectors) {
                console.log(`\n   🎯 ALVO: ${s}`);
                await page.waitForSelector('.sectorOption', { timeout: 10000 }).catch(() => {});

                const clicked = await page.evaluate((name) => {
                    const options = Array.from(document.querySelectorAll('.sectorOption'));
                    const target = options.find(opt => {
                        const h5 = opt.querySelector('h5');
                        const text = h5 ? h5.innerText.trim().toUpperCase() : opt.innerText.toUpperCase();
                        return text.includes(name.toUpperCase());
                    });
                    
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        target.click(); 
                        return true; 
                    }
                    return false;
                }, s);

                if (clicked) {
                    try {
                        await page.waitForFunction(() => 
                            document.querySelectorAll('#rates .item.item-rate').length > 0, 
                            { timeout: 8000 }
                        );
                        
                        const ticketsReport = await page.evaluate(() => {
                            const items = Array.from(document.querySelectorAll('#rates .item.item-rate'));
                            return items.map(t => {
                                const nome = t.querySelector('h5')?.innerText.trim().split('\n')[0];
                                const esgotado = !!t.querySelector('.sold-out');
                                const pcdIdoso = nome.toUpperCase().includes('PCD') || nome.toUpperCase().includes('IDOSO');
                                return { nome, esgotado, pcdIdoso, valido: !esgotado && !pcdIdoso };
                            });
                        });

                        const validos = ticketsReport.filter(t => t.valido);
                        if (validos.length > 0) {
                            const nomesVálidos = validos.map(v => v.nome).join(', ');
                            await sendTelegram(`🚨 HARRY - ${s} DISPONÍVEL!\nData: ${dateObj.dataTexto}\nIngressos: ${nomesVálidos}\nLink: ${URL_HARRY}`);
                            console.log(`   🔥 Alerta enviado para ${s}!`);
                        } else {
                            console.log(`   ❌ Apenas ingressos restritos ou esgotados em ${s}.`);
                        }

                    } catch (e) {
                        console.log(`   ⚠️ Timeout no modal de preços para ${s}.`);
                    }
                }
                
                await page.evaluate(() => {
                    const clean = document.getElementById('clean_selection');
                    if (clean) { clean.click(); clean.click(); }
                });
                await new Promise(r => setTimeout(r, 1500)); 
            }
            await page.goto(URL_HARRY, { waitUntil: 'domcontentloaded' });
        }

    } catch (error) {
        console.error('❌ Erro no Monitor:', error.message);
    } finally {
        await browser.close();
        console.log("\n🏁 Varredura encerrada.");
        process.exit(0); 
    }
}

checkHarryTickets();