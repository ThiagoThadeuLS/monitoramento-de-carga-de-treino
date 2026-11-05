import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Share2, X } from 'lucide-react';
import { AthletePr } from '../../lib/athleteAuth';
import { ClubInfo, useClub } from '../../lib/club';
import { photoInitials } from '../../lib/photos';
import { shareImage } from '../../lib/share';

export interface ShareAthlete {
  nome: string;
  photo_url?: string | null;
  classe?: string | null;
  categoria?: string | null;
}

interface PrShareCardProps {
  athlete: ShareAthlete;
  /** PR em destaque (o novo recorde) */
  pr: AthletePr;
  /** Todos os PRs, para o rodapé "outros recordes" */
  prs: AthletePr[];
  /** PR recém-batido: mostra o selo "novo recorde" */
  novo?: boolean;
  onClose: () => void;
}

// Card no formato story (1080 × 1920), com as cores e o escudo do clube
const W = 1080;
const H = 1920;
const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const kg = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const shortDate = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

/** Cor do clube (variável CSS aplicada por applyTheme), sem nova consulta ao banco. */
function cssColor(name: string, fallback: string) {
  const parts = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/[\s,]+/).map(Number);
  return parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite) ? `rgb(${parts[0]},${parts[1]},${parts[2]})` : fallback;
}

const alpha = (rgb: string, a: number) => {
  const m = rgb.match(/\d+/g);
  return m && m.length >= 3 ? `rgba(${m[0]},${m[1]},${m[2]},${a})` : rgb;
};

function setFont(ctx: CanvasRenderingContext2D, size: number, weight: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

function write(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 700,
  align: CanvasTextAlign = 'center'
) {
  setFont(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

/** Diminui a fonte até o texto caber na largura disponível. */
function fitSize(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, start: number, weight = 800) {
  let size = start;
  setFont(ctx, size, weight);
  while (size > 20 && ctx.measureText(value).width > maxWidth) {
    size -= 2;
    setFont(ctx, size, weight);
  }
  return size;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Carrega a imagem para o canvas. Se o servidor não liberar CORS a imagem falha
 * e o card cai nas iniciais — assim o canvas nunca fica "sujo" (toBlob quebraria).
 */
function loadImage(src?: string | null) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

interface DrawInput {
  athlete: ShareAthlete;
  pr: AthletePr;
  prs: AthletePr[];
  novo: boolean;
  club: ClubInfo | null;
}

async function drawCard(canvas: HTMLCanvasElement, { athlete, pr, prs, novo, club }: DrawInput) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível preparar o card.');

  canvas.width = W;
  canvas.height = H;

  const accent = cssColor('--sky-500', 'rgb(14,165,233)');
  const base = cssColor('--slate-950', 'rgb(2,6,23)');
  const white = '#ffffff';
  const dim = 'rgba(255,255,255,0.68)';
  const faint = 'rgba(255,255,255,0.42)';

  // Fundo opaco (story não aceita transparência): base, brilho do clube e escuro embaixo
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  const topo = ctx.createLinearGradient(0, 0, 0, 1250);
  topo.addColorStop(0, alpha(accent, 0.38));
  topo.addColorStop(1, alpha(accent, 0));
  ctx.fillStyle = topo;
  ctx.fillRect(0, 0, W, 1250);

  const baixo = ctx.createLinearGradient(0, 1250, 0, H);
  baixo.addColorStop(0, alpha(base, 0));
  baixo.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = baixo;
  ctx.fillRect(0, 1250, W, H - 1250);

  const glow = ctx.createRadialGradient(W / 2, 430, 40, W / 2, 430, 760);
  glow.addColorStop(0, alpha(accent, 0.5));
  glow.addColorStop(1, alpha(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 1150);

  const [crest, photo] = await Promise.all([loadImage(club?.escudo_url), loadImage(athlete.photo_url)]);

  // Topo: escudo + nome do clube
  const crestX = 138;
  const crestY = 158;
  const crestR = 46;
  ctx.save();
  ctx.beginPath();
  ctx.arc(crestX, crestY, crestR, 0, Math.PI * 2);
  ctx.clip();
  if (crest) {
    ctx.drawImage(crest, crestX - crestR, crestY - crestR, crestR * 2, crestR * 2);
  } else {
    ctx.fillStyle = alpha(accent, 0.25);
    ctx.fillRect(crestX - crestR, crestY - crestR, crestR * 2, crestR * 2);
    write(ctx, photoInitials(club?.nome ?? 'Carga'), crestX, crestY + 12, 32, white, 900);
  }
  ctx.restore();

  write(ctx, (club?.nome ?? 'Carga').toUpperCase(), 206, 150, 28, dim, 700, 'left');
  write(ctx, 'monitoramento de carga de treino', 206, 190, 22, faint, 500, 'left');
  write(ctx, 'CARGA', W - 96, 158, 24, faint, 900, 'right');

  // Foto do atleta em círculo com anel da cor do clube
  const photoY = 600;
  const photoR = 190;
  const halo = ctx.createRadialGradient(W / 2, photoY, photoR * 0.7, W / 2, photoY, photoR * 1.6);
  halo.addColorStop(0, alpha(accent, 0.35));
  halo.addColorStop(1, alpha(accent, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(W / 2, photoY, photoR * 1.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(W / 2, photoY, photoR + 8, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(W / 2, photoY, photoR, 0, Math.PI * 2);
  ctx.clip();
  if (photo) {
    const side = Math.min(photo.naturalWidth, photo.naturalHeight);
    ctx.drawImage(
      photo,
      (photo.naturalWidth - side) / 2,
      (photo.naturalHeight - side) / 2,
      side,
      side,
      W / 2 - photoR,
      photoY - photoR,
      photoR * 2,
      photoR * 2
    );
  } else {
    ctx.fillStyle = alpha(accent, 0.18);
    ctx.fillRect(W / 2 - photoR, photoY - photoR, photoR * 2, photoR * 2);
    write(ctx, photoInitials(athlete.nome), W / 2, photoY + 40, 118, white, 900);
  }
  ctx.restore();

  // Nome e categoria
  const nomeSize = fitSize(ctx, athlete.nome, W - 200, 68, 800);
  write(ctx, athlete.nome, W / 2, 900, nomeSize, white, 800);
  const sub = [athlete.classe && `Classe ${athlete.classe}`, athlete.categoria].filter(Boolean).join(' • ');
  if (sub) write(ctx, sub, W / 2, 950, 30, dim, 500);

  // Selo do recorde
  const chipLabel = novo ? 'NOVO RECORDE PESSOAL' : 'RECORDE PESSOAL';
  setFont(ctx, 25, 800);
  const chipW = ctx.measureText(chipLabel).width + 68;
  const chipH = 60;
  const chipY = 1000;
  ctx.fillStyle = accent;
  roundRect(ctx, W / 2 - chipW / 2, chipY, chipW, chipH, chipH / 2);
  ctx.fill();
  write(ctx, chipLabel, W / 2, chipY + 39, 25, '#05070d', 800);

  // Exercício
  const exercicioSize = fitSize(ctx, pr.exercicio.toUpperCase(), W - 180, 42, 700);
  write(ctx, pr.exercicio.toUpperCase(), W / 2, 1150, exercicioSize, 'rgba(255,255,255,0.75)', 700);

  // Carga em destaque
  const pesoTexto = kg(pr.peso_pr);
  const bigSize = fitSize(ctx, pesoTexto, W - 340, 232, 900);
  setFont(ctx, bigSize, 900);
  const numeroW = ctx.measureText(pesoTexto).width;
  setFont(ctx, 60, 800);
  const unidadeW = ctx.measureText('kg').width;
  const gap = 20;
  const inicio = W / 2 - (numeroW + gap + unidadeW) / 2;

  setFont(ctx, bigSize, 900);
  ctx.textAlign = 'left';
  ctx.fillStyle = white;
  ctx.fillText(pesoTexto, inicio, 1370);
  setFont(ctx, 60, 800);
  ctx.fillStyle = accent;
  ctx.fillText('kg', inicio + numeroW + gap, 1370);

  // Evolução (do primeiro registro até agora)
  const hist = pr.history ?? [];
  const primeiro = hist[0]?.peso_pr ?? pr.peso_pr;
  const delta = pr.peso_pr - primeiro;
  let deltaTexto = 'primeiro registro';
  if (hist.length > 1) {
    deltaTexto =
      delta > 0.01
        ? `+${kg(delta)} kg desde ${shortDate(hist[0]?.created_at)}`
        : `evolução desde ${shortDate(hist[0]?.created_at)}`;
  }
  write(ctx, deltaTexto, W / 2, 1438, 30, accent, 700);

  const valores = hist.length >= 2 ? hist.map((h) => h.peso_pr).slice(-12) : [];
  const chartTop = 1500;
  const chartH = 100;
  const left = 120;
  const right = W - 120;
  if (valores.length >= 2) {
    write(ctx, 'EVOLUÇÃO', left, chartTop - 16, 23, faint, 800, 'left');
    write(ctx, `${shortDate(hist[0]?.created_at)} → hoje`, right, chartTop - 16, 23, faint, 500, 'right');
    const max = Math.max(...valores);
    const min = Math.min(...valores);
    const span = max - min || 1;
    const gapBar = 12;
    const barW = Math.min(56, (right - left - gapBar * (valores.length - 1)) / valores.length);
    valores.forEach((v, i) => {
      const h = 22 + ((v - min) / span) * (chartH - 22);
      ctx.fillStyle = i === valores.length - 1 ? accent : alpha(accent, 0.3);
      roundRect(ctx, left + i * (barW + gapBar), chartTop + chartH - h, barW, h, Math.min(12, barW / 2));
      ctx.fill();
    });
  }

  // Outros recordes (evolução toda, com o novo PR em destaque acima)
  const outros = prs.filter((p) => p.id !== pr.id).slice(0, 2);
  if (outros.length) {
    const restantes = prs.length - 1 - outros.length;
    const titulo = restantes > 0 ? `OUTROS RECORDES • +${restantes}` : 'OUTROS RECORDES';
    write(ctx, titulo, left, 1690, 23, faint, 800, 'left');
    outros.forEach((p, i) => {
      const y = 1740 + i * 50;
      write(ctx, p.exercicio, left, y, 30, 'rgba(255,255,255,0.8)', 600, 'left');
      write(ctx, `${kg(p.peso_pr)} kg`, right, y, 30, white, 800, 'right');
    });
  }

  write(ctx, 'Carga • monitoramento de carga de treino', W / 2, 1846, 22, 'rgba(255,255,255,0.35)', 500);
}

/** Modal com o card do PR pronto para publicar no story. */
export const PrShareCard: React.FC<PrShareCardProps> = ({ athlete, pr, prs, novo = false, onClose }) => {
  const { club } = useClub();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setReady(false);
    setError('');
    drawCard(canvas, { athlete, pr, prs, novo, club })
      .then(() => !cancelled && setReady(true))
      .catch((err: Error) => !cancelled && setError(err?.message ?? 'Não foi possível montar o card.'));
    return () => {
      cancelled = true;
    };
  }, [athlete, pr, prs, novo, club]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const makeFile = () =>
    new Promise<File>((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) return reject(new Error('O card ainda está sendo montado.'));
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Não foi possível gerar a imagem.'));
        const slug = pr.exercicio
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/gi, '-')
          .toLowerCase();
        resolve(new File([blob], `pr-${slug}.png`, { type: 'image/png' }));
      }, 'image/png');
    });

  const share = async () => {
    setBusy(true);
    setError('');
    setHint('');
    try {
      const file = await makeFile();
      const result = await shareImage(file, `Novo PR em ${pr.exercicio}: ${kg(pr.peso_pr)} kg`, `PR de ${athlete.nome}`);
      if (result === 'downloaded') setHint('Imagem baixada. Abra o Instagram e publique nos stories.');
      else if (result === 'shared') onClose();
    } catch (err) {
      setError((err as Error)?.message ?? 'Não foi possível compartilhar.');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const file = await makeFile();
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setHint('Imagem salva no aparelho.');
    } catch (err) {
      setError((err as Error)?.message ?? 'Não foi possível salvar a imagem.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label="Card do recorde">
      <div className="min-h-full flex flex-col items-center justify-center gap-4 p-4">
        <div className="w-full max-w-xs flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Card do recorde</p>
          <button type="button" onClick={onClose} className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <canvas
          ref={canvasRef}
          className="w-[min(84vw,340px)] h-auto rounded-[26px] border border-slate-700 shadow-2xl shadow-black/60"
          aria-label={`Card do recorde de ${pr.exercicio}`}
        />

        {error && <p className="text-xs text-red-300 bg-red-950/60 border border-red-800 rounded-xl px-3 py-2 max-w-xs text-center">{error}</p>}
        {hint && <p className="text-xs text-emerald-200 bg-emerald-950/50 border border-emerald-800 rounded-xl px-3 py-2 max-w-xs text-center">{hint}</p>}

        <div className="flex items-center gap-2 w-full max-w-xs">
          <button
            type="button"
            onClick={share}
            disabled={!ready || busy}
            className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            Compartilhar
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!ready || busy}
            className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50"
            title="Baixar imagem"
            aria-label="Baixar imagem"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-slate-500 text-center max-w-xs">
          O card usa as cores e o escudo do seu clube. Nada é publicado sozinho: você escolhe onde postar.
        </p>
      </div>
    </div>
  );
};
