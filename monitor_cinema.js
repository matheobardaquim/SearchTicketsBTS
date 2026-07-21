const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const URL_CINEMA = 'https://checkout.ingresso.com/assentos?sessionId=85452676&partnership=home';

// CONFIGURAÇÃO DE TEMPO (Em minutos)
const INTERVALO_BASE_MINUTOS = 5; 

async function sendTelegram(message) {
    if (!TELEGRAM_TOKEN || !CHAT_ID) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        await axios.post(url, { chat_id: CHAT_ID, text: message });
        console.log("✅ Alerta crítico enviado ao Telegram!");
    } catch (err) {
        console.error("❌ Erro ao enviar Telegram:", err.response?.data || err.message);
    }
}

async function extrairAssentosLivres(page) {
    return page.evaluate(() => {
        const linhasElementos = Array.from(document.querySelectorAll('.sc-3912aed0-2.cOVDFC'));
        const resultado = [];

        linhasElementos.forEach(linhaContainer => {
            // Pega a letra da fileira na lateral esquerda (ex: "A", "B")
            const labelEl = linhaContainer.querySelector('.sc-3912aed0-10.jbunxn');
            let rowName = labelEl ? labelEl.innerText.trim().toUpperCase() : null;
            if (!rowName) return;

            // 🛑 NOVA REGRA: Ignora as fileiras muito próximas à tela (A até E)
            if (['A', 'B', 'C', 'D', 'E'].includes(rowName)) {
                return; 
            }

            const blocosFilhos = Array.from(linhaContainer.children);
            let numeroCadeira = 1; // Inicia a contagem da fileira no 1

            blocosFilhos.forEach(filho => {
                // Se o bloco possui o atributo [status], é uma cadeira física real
                const areaAssento = filho.querySelector('[status]');
                
                if (areaAssento) {
                    const status = areaAssento.getAttribute('status');
                    
                    if (status === 'Available') {
                        const tipo = areaAssento.getAttribute('type') || '';
                        const isPreferencial = tipo === 'Companion' || tipo === 'ReducedMobility' || tipo.toLowerCase().includes('preferencial');

                        resultado.push({
                            rowName,
                            numeroReal: numeroCadeira,
                            isPreferencial
                        });
                    }
                    
                    // Incrementa a numeração para a próxima cadeira, ignorando corredores!
                    numeroCadeira++;
                }
            });
        });

        return resultado.sort((a, b) => {
            if (b.rowName !== a.rowName) return b.rowName.localeCompare(a.rowName);
            return a.numeroReal - b.numeroReal;
        });
    });
}

async function checkCinema() {
    console.log(`\n--- Varredura Cinema Odisseia: ${new Date().toLocaleString('pt-BR')} ---`);
    
    const browser = await puppeteer.launch({
        headless: 'new',
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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    try {
        console.log('Acessando Ingresso.com...');
        await page.goto(URL_CINEMA, { waitUntil: 'networkidle2', timeout: 60000 });
        
        await page.waitForSelector('[seatmapsize="large"]', { timeout: 30000 });
        
        console.log('⏳ Aguardando renderização completa dos status dos assentos...');
        await page.waitForSelector('[status]', { timeout: 15000 }).catch(() => {});

        const delayHumano = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
        await new Promise(r => setTimeout(r, delayHumano));

        const assentosLivres = await extrairAssentosLivres(page);
        
        if (!assentosLivres.length) {
            console.log('❌ Nenhum assento livre encontrado nas fileiras desejadas (F para trás).');
            return;
        }

        // =================================================================
        // 📊 LOG DE DIAGNÓSTICO DOS ASSENTOS LIVRES REAIS
        // =================================================================
        console.log('\n📊 [DIAGNÓSTICO DOS ASSENTOS LIVRES REAIS]');
        const agrupadoPorLinha = {};
        assentosLivres.forEach(a => {
            if (!agrupadoPorLinha[a.rowName]) agrupadoPorLinha[a.rowName] = [];
            agrupadoPorLinha[a.rowName].push(a.numeroReal + (a.isPreferencial ? '(P)' : ''));
        });

        Object.keys(agrupadoPorLinha).forEach(linha => {
            console.log(`   Fileira ${linha}: Assentos livres -> [${agrupadoPorLinha[linha].join(', ')}]`);
        });
        console.log('───────────────────────────────────────────────────\n');
        // =================================================================

        let encontrou = false;

        // Passa por cada assento individualmente
        for (const assento of assentosLivres) {
            
            // Ignora assentos PCD/Acompanhantes
            if (assento.isPreferencial) continue;

            encontrou = true;
            
            const message = `🚨 CINEMA ODISSEIA - Ingresso Disponível!\nFileira: ${assento.rowName}\nAssento: ${assento.numeroReal}\nLink: ${URL_CINEMA}`;
            console.log(`🔥 ASSENTO LIVRE ENCONTRADO: Fileira ${assento.rowName} [Cadeira ${assento.numeroReal}]`);
            await sendTelegram(message);
        }

        if (!encontrou) {
            console.log('❌ Varredura completa: Nenhum assento vago padrão encontrado nas fileiras do fundo.');
        }
    } catch (error) {
        console.error('❌ Erro no Monitor de Cinema:', error.message);
    } finally {
        await browser.close();
    }
}

async function iniciarMonitoramento() {
    console.log('🎬 Monitor de Cinema com Antidetecção Iniciado!');
    
    while (true) {
        await checkCinema();
        
        const variacaoSegundos = Math.floor(Math.random() * (45 - (-45) + 1)) + (-45);
        const tempoEsperaMs = (INTERVALO_BASE_MINUTOS * 60 * 1000) + (variacaoSegundos * 1000);
        
        console.log(`🔄 Próxima varredura em aproximadamente ${((tempoEsperaMs / 1000) / 60).toFixed(2)} minutos...`);
        await new Promise(resolve => setTimeout(resolve, tempoEsperaMs));
    }
}

iniciarMonitoramento();