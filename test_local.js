const puppeteer = require('puppeteer');
const axios = require('axios');

// Seus dados que você enviou
const TELEGRAM_TOKEN = '***REMOVED***';
const CHAT_ID = '5801730158';
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
    console.log(`\n--- Iniciando verificação: ${new Date().toLocaleTimeString()} ---`);
    
    // Launch com headless: false permite que você veja o navegador abrindo (legal para testar)
    const browser = await puppeteer.launch({ headless: false }); 
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
                
                // Lógica: Se NÃO tem a classe soldout E o texto NÃO é ESGOTADO
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

        if (result.anyAvailable) {
            console.log(`🚨 INGRESSO ENCONTRADO para: ${result.dates.join(', ')}`);
            await sendTelegram(`🚨 CORRE! Ingressos detectados para: ${result.dates.join(', ')}!\nLink: ${URL_BTS}`);
        } else {
            console.log("😔 Tudo continua esgotado.");
            // Opcional: descomente a linha abaixo se quiser receber um "OK" no Telegram só pra testar
            // await sendTelegram("Check realizado: Ainda esgotado.");
        }

    } catch (error) {
        console.error('❌ Erro no processo:', error.message);
    } finally {
        // Vamos deixar o navegador aberto por 5 segundos para você ver antes de fechar
        setTimeout(async () => {
            await browser.close();
            console.log("Navegador fechado. Próxima verificação em 5 minutos...");
        }, 5000);
    }
}

// Executa agora e depois a cada 5 minutos
checkTickets();
setInterval(checkTickets, 300000);