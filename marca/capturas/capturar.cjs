// Tira as fotos do app (interface real + banco falso) para o site e o Instagram.
// 1) npx vite --config marca/capturas/vite.config.ts      (deixa rodando)
// 2) npm i --no-save playwright-core && node marca/capturas/capturar.cjs
// Usa o Microsoft Edge instalado. As imagens vão para site/img/.
const path = require('node:path');
const { chromium } = require('playwright-core');

const URL = 'http://localhost:5175';
const SAIDA = path.join(__dirname, '..', '..', 'site', 'img');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const espera = (p, ms = 1500) => p.waitForTimeout(ms);
const foto = (p, nome) => p.screenshot({ path: path.join(SAIDA, `${nome}.jpg`), type: 'jpeg', quality: 84 });

// Rola até o elemento ficar a "folga" px do topo
async function rolarAte(p, alvo, folga = 16) {
  await alvo.first().evaluate((el, f) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - f), folga);
  await espera(p, 500);
}

// Recorte de um trecho da página: do topo de "de" (menos a margem) até "altura" px abaixo, entre x e x + largura
async function recorte(p, nome, de, altura, x, largura, margem = 16) {
  const caixa = await de.first().boundingBox();
  const rolagem = await p.evaluate(() => window.scrollY);
  await p.screenshot({
    path: path.join(SAIDA, `${nome}.jpg`), type: 'jpeg', quality: 86, fullPage: true,
    clip: { x, y: caixa.y + rolagem - margem, width: largura, height: altura },
  });
}

// Telas extras para o Instagram: formulários de bem-estar e peso e a tela de instalação do iPhone
async function extras(b) {
  const a = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await a.goto(`${URL}/?demo=atleta&pendente`, { waitUntil: 'networkidle' });
  await espera(a, 2000);
  await a.evaluate(() => document.querySelectorAll('header h1').forEach((h) => (h.textContent = 'Carga')));
  await a.getByTitle('Agora não').first().click().catch(() => undefined);
  await espera(a);
  await a.getByRole('button', { name: 'Responder', exact: true }).first().click();
  await espera(a);
  await a.evaluate(() => window.scrollTo(0, 0));
  await espera(a, 400);
  await foto(a, 'atleta-psr');
  await a.goBack();
  await espera(a);
  await a.getByRole('button', { name: 'Registrar', exact: true }).first().click();
  await espera(a);
  await a.evaluate(() => window.scrollTo(0, 0));
  await espera(a, 400);
  await foto(a, 'atleta-peso');

  // iPhone abrindo o link no Safari: o app pede para instalar
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  });
  const i = await ctx.newPage();
  await i.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await espera(i, 1500);
  await foto(i, 'atleta-instalar');
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE });
  if (process.argv.includes('--extras')) {
    await extras(b);
    await b.close();
    console.log('Fotos extras salvas em', SAIDA);
    return;
  }

  // ---------- Atleta (celular) ----------
  const a = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await a.goto(`${URL}/?demo=atleta`, { waitUntil: 'networkidle' });
  await espera(a, 2000);
  // No celular o cabeçalho mostra a sigla do clube; aqui, o nome inteiro (como no computador)
  await a.evaluate(() => document.querySelectorAll('header h1').forEach((h) => (h.textContent = 'Carga')));
  await a.getByTitle('Agora não').first().click().catch(() => undefined); // aviso de lembretes
  await espera(a);

  await foto(a, 'atleta-inicio');
  await rolarAte(a, a.getByText(/dias seguidos/), 380);
  await foto(a, 'atleta-hoje');
  await recorte(a, 'passo-responder', a.getByText(/^Para hoje/i), 272, 0, 390, 12);

  // Formulário da PSE do treino de hoje
  await a.getByRole('button', { name: 'PSE', exact: true }).first().click();
  await espera(a);
  await a.getByRole('button', { name: '7', exact: true }).first().click().catch(() => undefined);
  await espera(a, 600);
  await rolarAte(a, a.getByText(/Duração do treino/), 230);
  await foto(a, 'atleta-pse');
  await a.goBack();
  await espera(a);

  for (const [aba, nome, ancora, folga] of [
    ['Agenda', 'atleta-agenda', /ESTA SEMANA/i, 12],
    ['PRs', 'atleta-prs', /Meu progresso/, 12],
    ['Histórico', 'atleta-conquistas', null, 0],
  ]) {
    await a.getByRole('button', { name: aba, exact: true }).last().click();
    await espera(a, 1800);
    if (ancora) await rolarAte(a, a.getByText(ancora), folga);
    else await a.evaluate(() => window.scrollTo(0, 0));
    await foto(a, nome);
  }

  // ---------- Comissão técnica (computador) ----------
  const c = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  await c.goto(`${URL}/?demo=treinador`, { waitUntil: 'networkidle' });
  await c.getByRole('button', { name: /Treinador/ }).first().click();
  await espera(c, 3000);
  await rolarAte(c, c.getByText('Painel da Comissão Técnica'), 140);
  await foto(c, 'treinador-hoje');
  await recorte(c, 'passo-comparar', c.getByText('Acompanhamento individual'), 330, 160, 700, 26);

  await c.getByRole('button', { name: 'Análises' }).first().click();
  await espera(c, 2500);
  await rolarAte(c, c.getByText(/Média de PSE do grupo/), 260);
  await foto(c, 'treinador-periodo');

  await c.getByText('Carga interna', { exact: true }).first().click();
  await espera(c, 3000);
  await rolarAte(c, c.getByText('Carga interna', { exact: true }), 110);
  await foto(c, 'treinador-carga');

  await c.getByRole('button', { name: 'Planejamento' }).first().click();
  await espera(c, 2500);
  await rolarAte(c, c.getByText(/^esta semana$/i), 120);
  await foto(c, 'treinador-agenda');
  await recorte(c, 'passo-planejar', c.getByText(/^esta semana$/i), 470, 160, 640, 30);

  await b.close();
  console.log('Fotos salvas em', SAIDA);
})();
