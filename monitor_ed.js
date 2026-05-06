const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

// Configurações via Variáveis de Ambiente na OCI
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const URL_ED = 'https://www.eventim.com.br/event/ed-sheeran-loop-tour-2026-allianz-parque-21522146/';

async function sendTelegram(message) {
    if (!TELEGRAM_TOKEN || !CHAT_ID) return console.log("🔔 [Telegram] Sem config: " + message);
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        await axios.post(url, { chat_id: CHAT_ID, text: message });
    } catch (err) {
        console.error("❌ Erro Telegram:", err.message);
    }
}

async function checkTickets() {
    console.log(`\n--- Varredura Ed Sheeran: ${new Date().toLocaleString('pt-BR')} ---`);

    const browser = await puppeteer.launch({
        headless: "new", // OBRIGATÓRIO PARA OCI[cite: 1]
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--window-size=1920,1080'
        ]
    });

    const page = await browser.newPage();
    
    // User-agent real para evitar detecção[cite: 2]
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    try {
        await page.goto(URL_ED, { waitUntil: 'networkidle2', timeout: 60000 });

        // Seleção de Modalidade
        const promoSelect = 'select[data-qa="promo-selection-box"]';
        await page.waitForSelector(promoSelect, { timeout: 15000 });
        await page.select(promoSelect, '185291'); 
        
        // Aguarda carregamento dos ingressos
        await new Promise(r => setTimeout(r, 5000)); 

        const result = await page.evaluate(() => {
            const sectors = Array.from(document.querySelectorAll('.js-pc-card, .event-list-item-wrapper'));
            let report = [];
            let foundTarget = false;

            sectors.forEach(sector => {
                const title = sector.querySelector('.pc-list-category span')?.innerText.trim() || "Setor Desconhecido";
                const ticketTypes = Array.from(sector.querySelectorAll('.js-ticket-type-item'));
                
                ticketTypes.forEach(tt => {
                    const name = tt.querySelector('[data-tt-name]')?.getAttribute('data-tt-name') || "N/A";
                    const isUnavailable = !!(tt.querySelector('[data-qa="ticket-type-unavailable"]') || 
                                             tt.querySelector('.ticket-type-unavailable-sec'));
                    
                    report.push({ Setor: title, Tipo: name, Status: isUnavailable ? "❌" : "✅" });

                    // Alvo específico: Meia Entrada[cite: 3, 4]
                    if (name === "MEIA ENTRADA" && !isUnavailable) {
                        foundTarget = true;
                        const plusBtn = tt.querySelector('button[data-qa="more-tickets"]');
                        if (plusBtn) { for(let i=0; i<3; i++) plusBtn.click(); }
                    }
                });
            });
            return { foundTarget, report };
        });

        console.table(result.report);

        if (result.foundTarget) {
            console.log("🔥 ALVO ENCONTRADO!");
            await sendTelegram(`🚨 ED SHEERAN: Meia Entrada disponível!\nSetores: ${result.report.filter(r => r.Tipo === "MEIA ENTRADA" && r.Status === "✅").map(r => r.Setor).join(', ')}`);
            // Na OCI, após encontrar, mantemos o processo vivo para você agir
            await new Promise(r => setTimeout(r, 15 * 60 * 1000));
        }

    } catch (error) {
        console.error('❌ Erro no ciclo:', error.message);
        if (error.message.includes('403') || error.message.includes('Access Denied')) {
            await sendTelegram("⚠️ OCI recebeu Access Denied. Aumentando tempo de espera.");
        }
    } finally {
        await browser.close();
    }
}

// Loop de Monitoramento
async function run() {
    await sendTelegram("🚀 Monitor Ed Sheeran iniciado na OCI com sucesso!"); // Mensagem teste
    
    while (true) {
        await checkTickets();
        // Intervalo aleatório entre 45 e 75 segundos para simular humano
        const sleep = Math.floor(Math.random() * (75000 - 45000) + 45000);
        console.log(`Aguardando ${sleep/1000}s para o próximo ciclo...`);
        await new Promise(r => setTimeout(r, sleep));
    }
}

run();