const puppeteer = require('puppeteer');
const axios = require('axios');

// Puxa os dados das Secrets do GitHub Actions para segurança
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const URL_BTS = 'https://www.ticketmaster.com.br/event/bts-world-tour-arirang';

async function sendTelegram(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        await axios.post(url, { chat_id: CHAT_ID, text: message });
        console.log("✅ Notificação enviada ao Telegram!");
    } catch (err) {
        console.error("❌ Erro ao enviar Telegram:", err.response?.data || err.message);
    }
}

async function checkTickets() {
    console.log(`\n--- Iniciando verificação: ${new Date().toLocaleString('pt-BR')} ---`);
    
    // Configurações obrigatórias para rodar no GitHub Actions (Linux)
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    }); 
    const page = await browser.newPage();

    try {
        console.log("Acessando o site da Ticketmaster...");
        await page.goto(URL_BTS, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log("Analisando a disponibilidade...");
        const result = await page.evaluate(() => {
            const items = document.querySelectorAll('.tmpe-ticket-item');
            let availableDates = [];

            items.forEach(item => {
                const dateTitle = item.querySelector('.tmpe-ticket-title')?.innerText.trim();
                const dot = item.querySelector('.tmpe-status-dot');
                const linkElement = item.querySelector('.tmpe-link-details');
                const linkText = linkElement?.innerText.toUpperCase();
                
                // Lógica robusta: Se NÃO tem a classe soldout E o texto NÃO é ESGOTADO
                const isSoldOut = dot && dot.classList.contains('tmpe-dot-soldout');
                const isAvailable = !isSoldOut && linkText !== 'ESGOTADO';

                if (isAvailable) {
                    availableDates.push(dateTitle);
                }
            });

            return {
                anyAvailable: availableDates.length > 0,
                dates: availableDates
            };
        });

        // Mude para (true) apenas se quiser testar o Telegram no primeiro push
        if (result.anyAvailable) {
            console.log(`🚨 INGRESSO ENCONTRADO para: ${result.dates.join(', ')}`);
            await sendTelegram(`🚨 CORRE! Ingressos detectados para o show no MorumBIS: ${result.dates.join(', ')}!\nLink: ${URL_BTS}`);
        } else {
            console.log("😔 Tudo continua esgotado.");
        }

    } catch (error) {
        console.error('❌ Erro no processo:', error.message);
    } finally {
        await browser.close();
        console.log("Navegador fechado.");
    }
}

// Executa a função
checkTickets();