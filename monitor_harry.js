const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const URL_HARRY = 'https://www.ticketmaster.com.br/event/venda-geral-harry-styles';

async function sendTelegram(message) {
    if (!TELEGRAM_TOKEN || !CHAT_ID) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        await axios.post(url, { chat_id: CHAT_ID, text: message });
        console.log("✅ Alerta enviado ao Telegram!");
    } catch (err) {
        console.error("❌ Erro ao enviar Telegram:", err.response?.data || err.message);
    }
}

async function mapAllSectors() {
    console.log(`\n===========================================`);
    console.log(`--- Mapeamento Geral de Setores: ${new Date().toLocaleString('pt-BR')} ---`);
    
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
        
        await page.waitForSelector('a.show, #buyButton', { timeout: 30000 });

        let availableDatesInfo = await page.evaluate(() => {
            const dateLinks = Array.from(document.querySelectorAll('a.show'));
            if (dateLinks.length === 0) return [];
            
            return dateLinks
                .filter(l => !l.innerText.toUpperCase().includes('ESGOTADO'))
                .map(l => ({ id: l.id, dataTexto: l.innerText.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || l.id }));
        });

        if (availableDatesInfo.length === 0) {
            console.log("⚠️ Nenhuma aba de múltiplas datas encontrada. Assumindo data única...");
            availableDatesInfo = [{ id: null, dataTexto: 'Única Data Restante' }];
        }

        for (const dateObj of availableDatesInfo) {
            console.log(`\n📅 Mapeando Data: ${dateObj.dataTexto}`);
            
            if (dateObj.id) {
                await page.evaluate((id) => document.getElementById(id).click(), dateObj.id);
            }

            await page.waitForSelector('#buyButton', { timeout: 15000 });
            await page.evaluate(() => document.getElementById('buyButton').click());
            
            // Aguarda os setores carregarem na tela
            await page.waitForSelector('.sectorOption', { timeout: 15000 }).catch(() => {});

            // Captura o nome e status de TODOS os setores exibidos na página
            const allSectors = await page.evaluate(() => {
                const options = Array.from(document.querySelectorAll('.sectorOption'));
                return options.map(opt => {
                    const h5 = opt.querySelector('h5');
                    const nome = h5 ? h5.innerText.trim() : opt.innerText.trim();
                    const esgotado = opt.innerText.toUpperCase().includes('ESGOTADO') || opt.classList.contains('disabled');
                    return { nome, esgotado };
                });
            });

            console.log(`\n📊 Total de Setores Encontrados: ${allSectors.length}`);
            console.log(`-------------------------------------------`);

            for (const sector of allSectors) {
                console.log(`🔍 Setor: "${sector.nome}" | Status: ${sector.esgotado ? '❌ Esgotado' : '✅ Disponível'}`);

                // Se o setor estiver disponível, clica para ver os tipos de ingressos/valores
                if (!sector.esgotado) {
                    const clicked = await page.evaluate((sectorName) => {
                        const options = Array.from(document.querySelectorAll('.sectorOption'));
                        const target = options.find(opt => {
                            const h5 = opt.querySelector('h5');
                            const text = h5 ? h5.innerText.trim() : opt.innerText.trim();
                            return text.toUpperCase() === sectorName.toUpperCase();
                        });
                        if (target) {
                            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            target.click();
                            return true;
                        }
                        return false;
                    }, sector.nome);

                    if (clicked) {
                        try {
                            await page.waitForFunction(() => 
                                document.querySelectorAll('#rates .item.item-rate').length > 0, 
                                { timeout: 6000 }
                            );
                            
                            const tickets = await page.evaluate(() => {
                                const items = Array.from(document.querySelectorAll('#rates .item.item-rate'));
                                return items.map(t => {
                                    const nome = t.querySelector('h5')?.innerText.trim().split('\n')[0];
                                    const esgotado = !!t.querySelector('.sold-out');
                                    return { nome, esgotado };
                                });
                            });

                            console.log(`   🎫 Ingressos no modal:`);
                            tickets.forEach(t => {
                                console.log(`      - ${t.nome}: ${t.esgotado ? 'Esgotado' : 'Disponível'}`);
                            });

                        } catch (e) {
                            console.log(`   ⚠️ Timeout ao carregar modal de ingressos/preços.`);
                        }

                        // Limpa a seleção para poder testar o próximo
                        await page.evaluate(() => {
                            const clean = document.getElementById('clean_selection');
                            if (clean) { clean.click(); clean.click(); }
                        });
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }

            await page.goto(URL_HARRY, { waitUntil: 'domcontentloaded' });
        }

    } catch (error) {
        console.error('❌ Erro durante o mapeamento:', error.message);
    } finally {
        await browser.close();
        console.log("\n🏁 Mapeamento concluído.");
        process.exit(0);
    }
}

mapAllSectors();