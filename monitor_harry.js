const puppeteer = require('puppeteer');
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
    console.log(`\n--- Iniciando Varredura Harry Styles: ${new Date().toLocaleString('pt-BR')} ---`);
    
    const browser = await puppeteer.launch({ 
        executablePath: '/usr/bin/google-chrome', // Essencial para o Linux do GitHub Actions
        headless: "new",                          // Volta a ficar oculto
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        console.log("1. Acessando a página principal...");
        await page.goto(URL_HARRY, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log("Aguardando lista de datas renderizar no DOM...");
        await page.waitForSelector('a.show', { timeout: 30000 });

        const availableDatesInfo = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a.show'));
            return links
                .filter(l => !l.innerText.toUpperCase().includes('AGOTADO') && !l.innerText.toUpperCase().includes('ESGOTADO'))
                .map(l => {
                    const dateMatch = l.innerText.match(/\d{2}\/\d{2}\/\d{4}/);
                    const dataFormatada = dateMatch ? dateMatch[0] : l.id;
                    return { id: l.id, dataTexto: dataFormatada };
                });
        });

        if (availableDatesInfo.length === 0) {
            console.log("😔 Todas as datas principais na home estão esgotadas.");
            return;
        }

        console.log(`Encontradas ${availableDatesInfo.length} datas para verificar. Iniciando loop...`);

        for (const dateObj of availableDatesInfo) {
            console.log(`\n===========================================`);
            console.log(`--- Verificando Data: ${dateObj.dataTexto} ---`);
            
            const seletorData = `a[id="${dateObj.id}"]`;
            await page.waitForSelector(seletorData);
            
            await page.evaluate((id) => { document.getElementById(id).click(); }, dateObj.id);
            
            await page.waitForSelector('#buyButton', { timeout: 15000 });
            await page.evaluate(() => document.getElementById('buyButton').click());
            
            console.log("Aguardando mapa do estádio...");
            await page.waitForSelector('.sectorOption', { timeout: 30000 });

            // REMOVIDO: Pit Square. Focando apenas em Circle e Disco
            const sectorsToChoices = ['Pit Circle', 'Pit Disco'];

            for (const sectorName of sectorsToChoices) {
                try {
                    console.log(`\nChecando ${sectorName}...`);
                    
                    const clicked = await page.evaluate((name) => {
                        const options = Array.from(document.querySelectorAll('.sectorOption'));
                        const target = options.find(opt => opt.querySelector('h5')?.innerText.trim().toUpperCase().includes(name.toUpperCase()));
                        if (target) {
                            target.click();
                            return true;
                        }
                        return false;
                    }, sectorName);

                    if (!clicked) {
                        console.log(`   ⚠️ Setor ${sectorName} não encontrado neste mapa.`);
                        continue;
                    }

                    await page.waitForFunction(
                        () => document.querySelectorAll('#rates .item.item-rate').length > 0,
                        { timeout: 10000 }
                    );

                    const ticketsData = await page.evaluate(() => {
                        const items = Array.from(document.querySelectorAll('#rates .item.item-rate'));
                        return items.map(item => {
                            const name = item.querySelector('h5')?.innerText.trim().split('\n')[0] || 'Ingresso';
                            const isSoldOut = !!item.querySelector('.sold-out');
                            return { name, isSoldOut };
                        });
                    });

                    console.log(`   Lidos ${ticketsData.length} tipos de ingresso:`);
                    const available = [];
                    
                    ticketsData.forEach(t => {
                        console.log(`   - ${t.name}: ${t.isSoldOut ? '❌ Esgotado' : '✅ DISPONÍVEL'}`);
                        
                        // FILTRO DE IGNORADOS: Barra "Idoso" e "PCD"
                        const nomeUpper = t.name.toUpperCase();
                        const isIgnored = nomeUpper.includes('IDOSO') || nomeUpper.includes('PCD');
                        
                        // Só adiciona na lista do Telegram se NÃO estiver esgotado E NÃO for ignorado
                        if (!t.isSoldOut && !isIgnored) {
                            available.push(t.name);
                        }
                    });

                    if (available.length > 0) {
                        const msg = `🚨 HARRY STYLES - ${sectorName} DISPONÍVEL!\nData: ${dateObj.dataTexto}\nTipos: ${available.join(', ')}\nLink: ${URL_HARRY}`;
                        await sendTelegram(msg);
                        console.log(`   🔥 ALERTA ENVIADO AO TELEGRAM!`);
                    } else {
                        // Isso vai cobrir o caso em que achou PCD/Idoso, mas não Inteira/Meia padrão
                        const temDisponivel = ticketsData.some(t => !t.isSoldOut);
                        if (temDisponivel) {
                            console.log(`   ⛔ Ingressos disponíveis ignorados (Apenas PCD/Idoso).`);
                        }
                    }

                    await page.evaluate(() => {
                        const clean = document.getElementById('clean_selection');
                        if (clean) { clean.click(); clean.click(); }
                    });
                    await new Promise(r => setTimeout(r, 1000));

                } catch (e) {
                    console.log(`   ⚠️ O modal demorou muito para responder.`);
                }
            }

            console.log("\nRecarregando home para a próxima data...");
            await page.goto(URL_HARRY, { waitUntil: 'networkidle2' });
            await page.waitForSelector('a.show', { timeout: 20000 });
        }

    } catch (error) {
        console.error('❌ Erro no Ciclo:', error.message);
    } finally {
        await browser.close();
        console.log("\nProcesso encerrado.");
    }
}

checkHarryTickets();