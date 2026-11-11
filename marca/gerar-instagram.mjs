// Gera o kit do Instagram do Carga (PNG) com o logo real do app e telas reais (site/img).
// As telas vêm de marca/capturas (app de verdade com atletas fictícios).
// Rodar: node marca/gerar-instagram.mjs   (precisa de internet para baixar as fontes do Google)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const saida = join(base, 'instagram');
const telas = join(base, '..', 'site', 'img');
const tmp = join(tmpdir(), 'carga-instagram');
mkdirSync(saida, { recursive: true });
mkdirSync(tmp, { recursive: true });

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HANDLE = '@carga.app';
const tela = (nome) => pathToFileURL(join(telas, `${nome}.jpg`)).href;

// Ícone real do app (public/icons/icon.svg)
const PULSO = 'M104 268h70l38-104 64 196 46-128 26 36h60';
const ICONE = `<svg viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0b1426"/><rect x="24" y="24" width="464" height="464" rx="96" fill="none" stroke="#0ea5e9" stroke-opacity=".35" stroke-width="8"/><path d="${PULSO}" fill="none" stroke="#38bdf8" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const LOGO = `<div class="logo">${ICONE}<span>Carga</span></div>`;

const css = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Martian+Mono:wdth,wght@75..112.5,100..800&display=swap');
:root { --noite:#050B18; --profundo:#0B1426; --linha:#1B2A44; --gelo:#EAF2FA; --texto:#C7D5E6; --nevoa:#8DA2BF; --azul:#38BDF8;
  --p4:#A3E635; --p6:#FACC15; --p8:#FB923C; --p10:#F43F5E; }
* { box-sizing:border-box; margin:0 }
html,body { width:100%; height:100%; background:var(--noite); color:var(--gelo); font-family:Archivo, 'Segoe UI', sans-serif; overflow:hidden }
.peca { position:relative; width:100%; height:100%; overflow:hidden; padding:80px; display:flex; flex-direction:column; gap:34px;
  background:
    radial-gradient(ellipse 70% 45% at 50% 85%, #0F2A4D 0%, transparent 70%),
    linear-gradient(var(--noite), transparent 30%),
    repeating-linear-gradient(0deg, #ffffff06 0 2px, transparent 2px 90px),
    repeating-linear-gradient(90deg, #ffffff06 0 2px, transparent 2px 90px), var(--noite) }
.topo { display:flex; justify-content:space-between; align-items:center; position:relative; z-index:3 }
.logo { display:flex; align-items:center; gap:18px }
.logo svg { width:68px; height:68px }
.logo span { font-family:system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-weight:900; font-size:42px; letter-spacing:.04em; color:var(--gelo) }
.mono { font-family:'Martian Mono', Consolas, monospace; font-stretch:87.5%; letter-spacing:.06em; text-transform:uppercase; font-size:24px; color:var(--nevoa) }
.texto { display:grid; gap:22px; position:relative; z-index:3 }
h1 { font-weight:900; font-stretch:125%; font-size:86px; line-height:.95; letter-spacing:-.025em; text-wrap:balance }
h1 em { font-style:normal; color:var(--azul) }
.sub { font-size:34px; line-height:1.32; color:var(--texto); max-width:900px }
.selo { justify-self:start; display:inline-flex; gap:14px; align-items:center; padding:18px 30px; border-radius:999px; background:var(--azul); color:var(--noite); font-weight:800; font-size:32px }

/* celular com a tela real */
.celular { position:absolute; z-index:2; width:450px; height:1120px; border-radius:68px; padding:14px;
  background:linear-gradient(160deg,#2A3D60,#0B1426 40%,#1A2A46); box-shadow:0 50px 140px -30px rgba(56,189,248,.45), inset 0 0 0 2px #2F4268 }
.celular .tela { position:relative; height:100%; border-radius:54px; overflow:hidden; background:var(--noite) }
.celular .tela::before { content:""; position:absolute; z-index:2; top:14px; left:50%; width:124px; height:36px; border-radius:99px; background:#000; transform:translateX(-50%) }
.celular .status { height:58px; display:flex; justify-content:space-between; align-items:center; padding:6px 44px 0; font:700 21px system-ui, 'Segoe UI', sans-serif; color:var(--gelo) }
.celular .status i { display:inline-block; width:30px; height:14px; border-radius:4px; box-shadow:inset 0 0 0 2px var(--gelo); position:relative }
.celular .status i::after { content:""; position:absolute; inset:3px 8px 3px 3px; border-radius:2px; background:var(--gelo) }
.celular .rolagem { height:calc(100% - 58px); overflow:hidden }
.celular img { display:block; width:100% }

/* janela de navegador com a tela real da comissão */
.navegador { position:absolute; z-index:2; width:1240px; border-radius:26px; overflow:hidden; background:var(--profundo);
  box-shadow:0 50px 140px -30px rgba(56,189,248,.35), 0 0 0 2px var(--linha) }
.navegador .barra { height:56px; display:flex; align-items:center; gap:12px; padding:0 22px; border-bottom:2px solid var(--linha) }
.navegador .barra i { width:15px; height:15px; border-radius:50%; background:var(--linha) }
.navegador .barra span { margin-left:14px; font:500 19px 'Martian Mono', monospace; color:var(--nevoa); background:var(--noite); border-radius:10px; padding:7px 18px }
.navegador img { display:block; width:100% }

.cartao { background:var(--profundo); border:2px solid var(--linha); border-radius:34px; padding:34px 38px }
.conta { display:flex; gap:22px; align-items:baseline; font-family:'Martian Mono'; font-weight:700 }
.nota { position:absolute; z-index:3; right:40px; bottom:36px; font:500 17px 'Martian Mono', monospace; color:var(--nevoa); letter-spacing:.04em;
  background:rgba(5,11,24,.85); padding:8px 14px; border-radius:10px }
`;

const pagina = (corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${css}</style></head><body>${corpo}</body></html>`;
const topo = `<div class="topo">${LOGO}<span class="mono" style="color:var(--gelo)">${HANDLE}</span></div>`;
/** Celular com a tela `nome`, a partir de `y` px da imagem (rolagem), em left/top/rotação dados */
const celular = (nome, { left = 315, top = 640, y = 0, rot = 0, escala = 1, hora = '19:40' } = {}) =>
  `<div class="celular" style="left:${left}px;top:${top}px;transform:rotate(${rot}deg) scale(${escala});transform-origin:top center">
    <div class="tela"><div class="status"><span>${hora}</span><i></i></div><div class="rolagem"><img src="${tela(nome)}" style="margin-top:-${y}px"></div></div></div>`;
const navegador = (nome, endereco, { left = 80, top = 640, largura = 1240 } = {}) =>
  `<div class="navegador" style="left:${left}px;top:${top}px;width:${largura}px"><div class="barra"><i></i><i></i><i></i><span>${endereco}</span></div><img src="${tela(nome)}"></div>`;
const texto = (serie, titulo, sub = '') =>
  `<div class="texto"><span class="mono">${serie}</span><h1>${titulo}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>`;
const post = (conteudo) => pagina(`<div class="peca">${topo}${conteudo}</div>`);
const SERIE = (n, tema) => `${String(n).padStart(2, '0')}/09 · ${tema}`;
const FICTICIO = '<span class="nota">Tela real · atletas fictícios</span>';

const pecas = {
  // Foto de perfil: o ícone do app (o Instagram corta em círculo)
  'perfil.png': [1080, 1080, pagina(`<div style="width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(circle at 50% 45%, #13264A, #0b1426 68%)">
    <svg viewBox="0 0 512 512" width="760" height="760"><circle cx="256" cy="256" r="236" fill="none" stroke="#0ea5e9" stroke-opacity=".35" stroke-width="8"/>
    <path d="${PULSO}" fill="none" stroke="#38bdf8" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`)],

  'post-01-treine-com-medida.png': [1080, 1350, post(`
    ${texto(SERIE(1, 'Lançamento'), 'Treine com <em>medida.</em>', 'O atleta conta como foi o treino. A comissão vê a carga do elenco.')}
    ${celular('atleta-pse', { left: 120, top: 700, y: 200, rot: -8, escala: 0.9 })}
    ${celular('atleta-hoje', { left: 500, top: 640, y: 270 })}`)],

  'post-02-escala-pse.png': [1080, 1350, post(`
    ${texto(SERIE(2, 'PSE'), 'De 0 a 10, quanto pesou o <em>treino?</em>', 'Depois do treino, o atleta marca o esforço e a duração. Leva 10 segundos.')}
    ${celular('atleta-pse', { top: 650, y: 270 })}`)],

  'post-03-carga.png': [1080, 1350, post(`
    ${texto(SERIE(3, 'Carga interna'), 'Esforço × tempo = <em>carga.</em>')}
    <div class="cartao conta" style="position:relative;z-index:3">
      <span style="font-size:104px;color:var(--p6)">7</span><span style="font-size:56px;color:var(--nevoa)">×</span>
      <span style="font-size:104px">104</span><span style="font-size:56px;color:var(--nevoa)">=</span>
      <span style="font-size:104px;color:var(--azul)">728</span><span style="font-size:38px;color:var(--nevoa)">UA</span></div>
    <p class="sub" style="position:relative;z-index:3">PSE 7 num randori de 104 minutos. O app faz a conta e mostra para a comissão:</p>
    ${navegador('passo-comparar', 'Hoje · Acompanhamento individual', { top: 860, largura: 1000 })}${FICTICIO}`)],

  'post-04-acwr.png': [1080, 1350, post(`
    ${texto(SERIE(4, 'ACWR'), 'A carga subiu <em>rápido demais?</em>', 'A semana atual ÷ a média das últimas quatro. Entre 0,8 e 1,3 é a zona segura.')}
    ${navegador('treinador-carga', 'Análises · Carga interna', { top: 690 })}${FICTICIO}`)],

  'post-05-lembrete.png': [1080, 1350, post(`
    ${texto(SERIE(5, 'Lembretes'), 'O app avisa. <em>O atleta responde.</em>', 'Bem-estar antes do treino, PSE depois e peso no dia da pesagem.')}
    ${celular('atleta-hoje', { top: 650, y: 265 })}`)],

  'post-06-comissao.png': [1080, 1350, post(`
    ${texto(SERIE(6, 'Comissão técnica'), 'O elenco inteiro <em>numa tela.</em>', 'Quem respondeu, a PSE de cada treino e o bem-estar do dia.')}
    ${navegador('treinador-hoje', 'Hoje · Painel da comissão', { top: 690 })}${FICTICIO}`)],

  'post-07-recuperacao.png': [1080, 1350, post(`
    ${texto(SERIE(7, 'PSR'), 'Chegou <em>recuperado</em> ao treino?', 'Antes do treino, o atleta conta como dormiu, a dor e a disposição.')}
    ${celular('atleta-psr', { top: 650, y: 230, hora: '07:20' })}`)],

  'post-08-instalar.png': [1080, 1350, post(`
    ${texto(SERIE(8, 'Instalação'), 'Sem loja. <em>Instala pelo navegador.</em>', 'Funciona no iPhone e no Android.')}
    ${celular('atleta-instalar', { top: 610, y: 160, hora: '09:15' })}`)],

  'post-09-seu-clube.png': [1080, 1350, post(`
    ${texto(SERIE(9, 'Para clubes'), 'Leve o Carga para o <em>seu clube.</em>')}
    <span class="selo" style="position:relative;z-index:3">Link na bio →</span>
    ${navegador('treinador-agenda', 'Planejamento · Agenda', { left: 80, top: 640, largura: 1150 })}
    ${celular('atleta-inicio', { left: 600, top: 780, escala: 0.82 })}${FICTICIO}`)],

  'story-dica.png': [1080, 1920, pagina(`<div class="peca" style="padding:220px 80px 260px">${topo}
    ${texto('Dica de treino', 'Responda a PSE <em>30 minutos</em> depois do treino.', 'Assim a nota mede o treino inteiro, não só o último exercício.')}
    ${celular('atleta-pse', { top: 960, y: 20 })}</div>`)],

  'story-aviso.png': [1080, 1920, pagina(`<div class="peca" style="padding:220px 80px 260px">${topo}
    ${texto('Aviso', 'Hoje é dia de <em>pesagem.</em>', 'Pese-se em jejum, depois de ir ao banheiro, e registre no app antes do treino.')}
    ${celular('atleta-peso', { top: 960, y: 0, hora: '07:05' })}</div>`)],
};

// Capas dos destaques: traço do mesmo estilo dos ícones do app, sobre o fundo do ícone
const icones = {
  'como-usar': '<rect x="3" y="3" width="26" height="26" rx="8"/><path d="M13 10l9 6-9 6z" fill="#38bdf8" stroke="none"/>',
  atletas: '<circle cx="16" cy="10" r="5.5"/><path d="M5 28c1.5-6 5.5-9 11-9s9.5 3 11 9"/>',
  comissao: '<rect x="6" y="5" width="20" height="24" rx="4"/><path d="M11 13h10M11 18h10M11 23h6"/>',
  ciencia: `<path d="M3 17h5l3-8 5 15 3-10 2 3h8"/>`,
  novidades: '<path d="M16 3l3 9.5L28 16l-9 3.5L16 29l-3-9.5L4 16l9-3.5z"/>',
};
for (const [nome, ic] of Object.entries(icones)) {
  pecas[`destaque-${nome}.png`] = [1080, 1920, pagina(`<div style="width:100%;height:100%;display:grid;place-items:center;background:var(--noite)">
    <div style="width:600px;height:600px;border-radius:50%;background:#0b1426;box-shadow:inset 0 0 0 8px rgba(14,165,233,.35);display:grid;place-items:center">
    <svg viewBox="0 0 32 32" width="300" height="300" fill="none" stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ic}</svg></div></div>`)];
}

for (const [arquivo, [w, h, html]] of Object.entries(pecas)) {
  const htmlPath = join(tmp, arquivo.replace('.png', '.html'));
  writeFileSync(htmlPath, html);
  execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    `--window-size=${w},${h}`, '--virtual-time-budget=8000', `--screenshot=${join(saida, arquivo)}`, pathToFileURL(htmlPath).href,
  ], { stdio: 'ignore' });
  console.log('ok', arquivo);
}

// Prévia do perfil: os 9 posts em grade (ordem do feed: o último publicado fica em cima)
const ordem = Object.keys(pecas).filter((k) => k.startsWith('post-')).reverse();
const grade = pagina(`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#000">${ordem
  .map((f) => `<img src="${pathToFileURL(join(saida, f)).href}" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block">`)
  .join('')}</div>`);
writeFileSync(join(tmp, 'grade.html'), grade);
execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1080,1356', '--virtual-time-budget=4000', `--screenshot=${join(saida, 'previa-grade.png')}`, pathToFileURL(join(tmp, 'grade.html')).href], { stdio: 'ignore' });
console.log('ok previa-grade.png');
