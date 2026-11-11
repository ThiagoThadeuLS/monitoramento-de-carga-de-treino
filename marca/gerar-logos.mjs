// Gera os arquivos SVG do logo do Carga (símbolo "barra carregada" + palavra "carga").
// Rodar: node marca/gerar-logos.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'logo');
const C = { noite: '#050B18', profundo: '#0B1426', gelo: '#EAF2FA', azul: '#38BDF8', azulForte: '#0284C7' };

// Símbolo (grade 64): a barra com anilhas que crescem = gráfico subindo + carga na barra
const simbolo = (cor) => `<g fill="${cor}">
  <rect x="4" y="29" width="56" height="6" rx="3"/>
  <rect x="8" y="22" width="7" height="20" rx="2.5"/>
  <rect x="18" y="15" width="8" height="34" rx="2.5"/>
  <rect x="29" y="8" width="9" height="48" rx="2.5"/>
  <rect x="41" y="24" width="4" height="16" rx="2"/>
</g>`;

// Palavra "carga" desenhada (traço 10, altura de x 36, linha de base em y=36)
const palavra = (cor) => `<g fill="none" stroke="${cor}" stroke-width="10">
  <path d="M27.19 8.81A13 13 0 1 0 27.19 27.19"/>
  <circle cx="55.5" cy="18" r="13"/><path d="M68.5 0V36"/>
  <path d="M83.5 36V17A12 12 0 0 1 95.5 5H101"/>
  <circle cx="126.5" cy="18" r="13"/><path d="M139.5 0V34A13 13 0 0 1 115.24 40.5"/>
  <circle cx="167.5" cy="18" r="13"/><path d="M180.5 0V36"/>
</g>`;

const svg = (viewBox, body, fundo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${fundo ? `\n<rect x="${viewBox.split(' ')[0]}" y="${viewBox.split(' ')[1]}" width="100%" height="100%" fill="${fundo}"/>` : ''}\n${body}\n</svg>\n`;

const horizontal = (cs, cp) => `<g transform="translate(0 -17) scale(1.1)">${simbolo(cs)}</g>\n<g transform="translate(84 0)">${palavra(cp)}</g>`;
const vertical = (cs, cp) => `<g transform="translate(51 0) scale(1.3)">${simbolo(cs)}</g>\n<g transform="translate(0 104)">${palavra(cp)}</g>`;
const icone = (fundo, cs) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n<rect width="512" height="512" rx="112" fill="${fundo}"/>\n<g transform="translate(64 64) scale(6)">${simbolo(cs)}</g>\n</svg>\n`;

const arquivos = {
  'carga-simbolo-azul.svg': svg('0 0 64 64', simbolo(C.azul)),
  'carga-simbolo-branco.svg': svg('0 0 64 64', simbolo('#FFFFFF')),
  'carga-simbolo-preto.svg': svg('0 0 64 64', simbolo(C.noite)),
  'carga-palavra-gelo.svg': svg('0 0 186 52', palavra(C.gelo)),
  'carga-palavra-noite.svg': svg('0 0 186 52', palavra(C.noite)),
  'carga-horizontal-escuro.svg': svg('0 -17 270 70', horizontal(C.azul, C.gelo)),
  'carga-horizontal-claro.svg': svg('0 -17 270 70', horizontal(C.azulForte, C.noite)),
  'carga-horizontal-branco.svg': svg('0 -17 270 70', horizontal('#FFFFFF', '#FFFFFF')),
  'carga-horizontal-preto.svg': svg('0 -17 270 70', horizontal(C.noite, C.noite)),
  'carga-vertical-escuro.svg': svg('0 0 186 156', vertical(C.azul, C.gelo)),
  'carga-vertical-claro.svg': svg('0 0 186 156', vertical(C.azulForte, C.noite)),
  'carga-icone-app.svg': icone(C.profundo, C.azul),
  'carga-icone-azul.svg': icone(C.azul, C.noite),
};
for (const [nome, conteudo] of Object.entries(arquivos)) writeFileSync(join(dir, nome), conteudo);
console.log(Object.keys(arquivos).length, 'arquivos em', dir);
