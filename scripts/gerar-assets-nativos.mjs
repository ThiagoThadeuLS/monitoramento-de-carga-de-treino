// Gera os recursos de ícone e splash dos apps iOS/Android a partir da marca do app.
// Rodar: node scripts/gerar-assets-nativos.mjs && npm run native:assets
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const resources = join(root, 'resources');
const C = { fundo: '#0b1426', noite: '#020617', azul: '#38bdf8', gelo: '#eaf2fa' };

const onda = (cor, largura, espessura) => {
  // Mesma curva do ícone web (public/icons/icon.svg), centralizada em 512x512.
  // No arquivo original a curva vai de x=104 a x=408 e de y=164 a y=360.
  const escala = largura / 304;
  const deslocamento = (512 - largura) / 2 - 104 * escala;
  return `<g transform="translate(${deslocamento} ${256 - 262 * escala}) scale(${escala})">
    <path d="M104 268h70l38-104 64 196 46-128 26 36h60" fill="none" stroke="${cor}"
      stroke-width="${espessura / escala}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
};

const svg = (conteudo, fundo = 'none') => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512">
  ${fundo === 'none' ? '' : `<rect width="512" height="512" fill="${fundo}"/>`}
  ${conteudo}
</svg>`;

await mkdir(resources, { recursive: true });

// Ícone da loja: quadrado opaco (a App Store não aceita transparência).
await sharp(Buffer.from(svg(`
  <rect x="23" y="23" width="466" height="466" rx="118" fill="none" stroke="${C.azul}" stroke-opacity="0.35" stroke-width="6"/>
  ${onda(C.azul, 360, 34)}
`, C.fundo))).resize(1024, 1024).png().toFile(join(resources, 'icon-only.png'));

// Android adaptativo: fundo chapado + símbolo dentro da área segura.
await sharp(Buffer.from(svg(onda(C.azul, 300, 34)))).resize(1024, 1024).png().toFile(join(resources, 'icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: C.fundo } }).png().toFile(join(resources, 'icon-background.png'));

// Splash: mesma cor de fundo do app, símbolo centralizado.
const splash = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 1366 1366">
  <rect width="1366" height="1366" fill="${C.noite}"/>
  <g transform="translate(483 483) scale(0.78)">${onda(C.azul, 512, 34)}</g>
</svg>`);
await sharp(splash).png().toFile(join(resources, 'splash.png'));
await sharp(splash).png().toFile(join(resources, 'splash-dark.png'));

// Ícone pequeno da notificação no Android (silhueta branca, fundo transparente).
const notificacao = Buffer.from(svg(onda('#ffffff', 420, 46)));
for (const [pasta, tamanho] of [
  ['mdpi', 24],
  ['hdpi', 36],
  ['xhdpi', 48],
  ['xxhdpi', 72],
  ['xxxhdpi', 96],
]) {
  const destino = join(root, 'android/app/src/main/res', `drawable-${pasta}`);
  await mkdir(destino, { recursive: true });
  await sharp(notificacao).resize(tamanho, tamanho).png().toFile(join(destino, 'ic_stat_onesignal_default.png'));
}

// Ícone grande da notificação (opcional, colorido).
await sharp(join(resources, 'icon-only.png'))
  .resize(256, 256)
  .png()
  .toFile(join(root, 'android/app/src/main/res/drawable-xxxhdpi', 'ic_onesignal_large_icon_default.png'));

console.log('Recursos nativos gerados em resources/ e android/app/src/main/res/.');
