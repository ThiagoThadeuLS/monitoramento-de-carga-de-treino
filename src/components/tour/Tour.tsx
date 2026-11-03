import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, HelpCircle, X, Compass } from 'lucide-react';

/**
 * Tour guiado pelas telas de verdade: destaca uma parte da tela de cada vez
 * (data-tour="...") e explica para que serve. Não altera nenhum dado.
 *
 * Tudo é medido na hora (alvo, cabeçalho fixo, áreas seguras do celular e o próprio
 * cartão), a cada quadro, para o destaque acompanhar o elemento em qualquer tamanho
 * de tela, ao girar o celular e ao rolar a página.
 */
export interface TourStep {
  /** valor de data-tour do elemento destacado (sem alvo: cartão no centro) */
  target?: string;
  title: string;
  body: React.ReactNode;
  /** prepara a tela antes do passo (ex.: trocar de aba) */
  before?: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Layout {
  vw: number;
  vh: number;
  /** alvo, em relação à área do tour */
  target: Box | null;
  /** canto arredondado do alvo (px) */
  radius: number;
  /** altura natural do cartão (sem corte) */
  cardH: number;
  /** parte do cartão que não é texto (cabeçalho, progresso, botões) */
  cardFixed: number;
  /** fim do cabeçalho fixo no topo: o destaque não passa por baixo dele */
  headerBottom: number;
  /** áreas seguras do celular (entalhe e barra de gestos) */
  safeTop: number;
  safeBottom: number;
}

const PAD = 6; // folga em volta do elemento destacado
const GAP = 12; // distância entre destaque, cartão e bordas da tela
const CARD_MAX_W = 448;
const MIN_TEXT_H = 96; // espaço mínimo para o texto do cartão (cerca de 4 linhas; o resto rola)
const MIN_SPOT_H = 56; // destaque muito alto: mostra pelo menos o começo dele acima do cartão
const BODY_VH = 0.38; // texto do cartão: no máximo 38% da altura da tela
const TIGHT_VH = 500; // tela baixa (celular deitado): cartão compacto

const findTarget = (name?: string) => (name ? document.querySelector<HTMLElement>(`[data-tour="${name}"]`) : null);

const isShown = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5);

const sameLayout = (a: Layout, b: Layout) =>
  sameBox(a.target, b.target) &&
  Math.abs(a.vw - b.vw) < 0.5 &&
  Math.abs(a.vh - b.vh) < 0.5 &&
  Math.abs(a.radius - b.radius) < 0.5 &&
  Math.abs(a.cardH - b.cardH) < 1 &&
  Math.abs(a.cardFixed - b.cardFixed) < 1 &&
  Math.abs(a.headerBottom - b.headerBottom) < 0.5 &&
  Math.abs(a.safeTop - b.safeTop) < 0.5 &&
  Math.abs(a.safeBottom - b.safeBottom) < 0.5;

/** Cabeçalho grudado no topo da página (fica por cima do conteúdo ao rolar). */
const stickyHeader = () =>
  [...document.querySelectorAll<HTMLElement>('header')].find((h) => {
    const pos = getComputedStyle(h).position;
    return pos === 'sticky' || pos === 'fixed';
  }) ?? null;

const radiusOf = (el: HTMLElement, r: DOMRect) => {
  const v = getComputedStyle(el).borderTopLeftRadius;
  const n = parseFloat(v) || 0;
  return v.endsWith('%') ? (Math.min(r.width, r.height) * n) / 100 : n;
};

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Rola a página até o começo do alvo ficar logo abaixo do cabeçalho. */
const bringIntoView = (el: HTMLElement, offset: number) => {
  for (let p: HTMLElement | null = el; p; p = p.parentElement) {
    if (getComputedStyle(p).position === 'fixed') return; // fixo na tela: não precisa rolar
  }
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(top, 0), behavior: reduceMotion() ? 'auto' : 'smooth' });
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

export const Tour: React.FC<{ steps: TourStep[]; onClose: () => void }> = ({ steps, onClose }) => {
  const [i, setI] = useState(0);
  const [ready, setReady] = useState(false);
  const [layout, setLayout] = useState<Layout>(() => ({
    vw: document.documentElement.clientWidth,
    vh: window.innerHeight,
    target: null,
    radius: 0,
    cardH: 0,
    cardFixed: 0,
    headerBottom: 0,
    safeTop: 0,
    safeBottom: 0,
  }));
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const safeTopRef = useRef<HTMLDivElement>(null);
  const safeBottomRef = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  // Troca de passo: prepara a tela, espera o alvo aparecer, rola até ele
  // e só mostra o destaque quando a tela parar de se mexer.
  useEffect(() => {
    setReady(false);
    step.before?.();
    if (!step.target) {
      setReady(true);
      return;
    }
    const header = stickyHeader();
    const start = performance.now();
    let raf = 0;
    let settleStart = 0;
    let stable = 0;
    let prev: Box | null = null;
    const tick = () => {
      const now = performance.now();
      const el = findTarget(step.target);
      if (!el || !isShown(el)) {
        // a aba nova ainda está carregando; se o alvo não existir nesta tela, cartão no centro
        if (now - start > 3000) setReady(true);
        else raf = requestAnimationFrame(tick);
        return;
      }
      if (!settleStart) {
        settleStart = now;
        const safeTop = safeTopRef.current?.offsetHeight ?? 0;
        bringIntoView(el, Math.max(header ? header.getBoundingClientRect().bottom : 0, safeTop) + GAP);
      }
      const r = el.getBoundingClientRect();
      const box = { top: r.top, left: r.left, width: r.width, height: r.height };
      stable = sameBox(box, prev) ? stable + 1 : 0;
      prev = box;
      if (stable >= 6 || now - settleStart > 2000) setReady(true);
      else raf = requestAnimationFrame(tick);
    };
    const t = window.setTimeout(() => (raf = requestAnimationFrame(tick)), 50);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [i]);

  // Mede tudo a cada quadro: rolagem, giro da tela, teclado, conteúdo carregando
  useLayoutEffect(() => {
    const header = stickyHeader();
    let raf = 0;
    let lastEl: HTMLElement | null = null;
    let radius = 0;
    const measure = () => {
      const root = rootRef.current;
      if (root) {
        const rr = root.getBoundingClientRect();
        const el = findTarget(step.target);
        let target: Box | null = null;
        if (el && isShown(el)) {
          const r = el.getBoundingClientRect();
          if (el !== lastEl) {
            lastEl = el;
            radius = radiusOf(el, r);
          }
          target = { top: r.top - rr.top, left: r.left - rr.left, width: r.width, height: r.height };
        }
        // altura natural do cartão: a de agora com o texto inteiro (até o limite de 38% da tela)
        const card = cardRef.current;
        const body = bodyRef.current;
        const bodyMax = Math.round(root.clientHeight * BODY_VH);
        const next: Layout = {
          vw: root.clientWidth,
          vh: root.clientHeight,
          target,
          radius,
          cardH: card && body ? card.offsetHeight - body.offsetHeight + Math.min(body.scrollHeight, bodyMax) : 0,
          cardFixed: card && body ? card.offsetHeight - body.offsetHeight : 0,
          headerBottom: header ? Math.max(0, header.getBoundingClientRect().bottom - rr.top) : 0,
          safeTop: safeTopRef.current?.offsetHeight ?? 0,
          safeBottom: safeBottomRef.current?.offsetHeight ?? 0,
        };
        setLayout((cur) => (sameLayout(cur, next) ? cur : next));
      }
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [i]);

  const next = useCallback(() => (last ? onClose() : setI((x) => x + 1)), [last, onClose]);
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  // ---------- posições ----------
  const { vw, vh } = layout;
  const cardW = Math.max(0, Math.min(CARD_MAX_W, vw - 2 * GAP));
  const cardH = layout.cardH || 240;
  const minTop = layout.safeTop + GAP;
  const maxBottom = vh - layout.safeBottom - GAP;

  // Destaque: o alvo com folga, sem passar por baixo do cabeçalho nem sair da tela
  let spot: Box | null = null;
  if (step.target && layout.target) {
    const t = layout.target;
    const top = Math.max(t.top - PAD, Math.max(layout.headerBottom, layout.safeTop) + 2);
    const left = Math.max(t.left - PAD, 2);
    const bottom = Math.min(t.top + t.height + PAD, vh - 2);
    const right = Math.min(t.left + t.width + PAD, vw - 2);
    if (bottom - top >= 8 && right - left >= 8) spot = { top, left, width: right - left, height: bottom - top };
  }

  // Cartão, nesta ordem de preferência (nunca um por cima do outro, a não ser em tela
  // baixa demais para os dois):
  //  1. logo abaixo do destaque;  2. logo acima;
  //  3. destaque alto: mostra o começo dele e o cartão inteiro logo abaixo;
  //  4. no lado com mais espaço, com o texto rolando dentro;
  //  5. só o começo do destaque e o cartão menor embaixo, com o texto rolando.
  const tight = vh < TIGHT_VH;
  const room = maxBottom - minTop;
  const minSpotH = tight ? 40 : MIN_SPOT_H;
  const minCard = Math.min(cardH, (layout.cardFixed || 110) + (tight ? 72 : MIN_TEXT_H));
  let cardTop = minTop;
  let cardLeft = (vw - cardW) / 2;
  let cardMaxH: number | undefined;
  if (!spot) {
    if (cardH > room) cardMaxH = room;
    cardTop = minTop + Math.max(0, (room - Math.min(cardH, room)) / 2);
  } else {
    const below = maxBottom - (spot.top + spot.height + GAP);
    const above = spot.top - GAP - minTop;
    const underTrimmed = maxBottom - (spot.top + minSpotH + GAP); // espaço se o destaque mostrar só o começo
    const trimTo = (cardBox: number) => {
      cardTop = maxBottom - cardBox;
      if (cardBox < cardH) cardMaxH = cardBox;
      spot = { ...spot!, height: Math.min(spot!.height, cardTop - GAP - spot!.top) };
    };
    cardLeft = clamp(spot.left + spot.width / 2 - cardW / 2, GAP, vw - GAP - cardW);
    if (below >= cardH) {
      cardTop = spot.top + spot.height + GAP;
    } else if (above >= cardH) {
      cardTop = spot.top - GAP - cardH;
    } else if (spot.height > minSpotH && underTrimmed >= cardH) {
      trimTo(cardH);
    } else if (Math.max(below, above) >= minCard) {
      if (below >= above) {
        cardTop = spot.top + spot.height + GAP;
        cardMaxH = below;
      } else {
        cardTop = minTop;
        cardMaxH = above;
      }
    } else if (underTrimmed >= minCard) {
      trimTo(underTrimmed);
    } else {
      const h = Math.min(cardH, room);
      cardTop = maxBottom - h;
      if (h < cardH) cardMaxH = h;
    }
  }
  const ringRadius = layout.radius > 0 ? layout.radius + PAD : 16;
  const dimAll = !spot || !ready;

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Tour pela plataforma">
      {/* medidores das áreas seguras do celular (entalhe e barra de gestos) */}
      <div ref={safeTopRef} aria-hidden className="absolute top-0 left-0 w-0 invisible pointer-events-none" style={{ height: 'env(safe-area-inset-top, 0px)' }} />
      <div ref={safeBottomRef} aria-hidden className="absolute top-0 left-0 w-0 invisible pointer-events-none" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />

      {/* Fundo escurecido com uma "janela" no elemento destacado */}
      {spot && (
        <div
          data-tour-spot={step.target}
          className="absolute ring-2 ring-sky-400 pointer-events-none"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            borderRadius: Math.min(ringRadius, spot.width / 2, spot.height / 2),
            boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.8)',
          }}
        />
      )}
      {/* Entre um passo e outro (rolando a tela) tudo fica escuro; o destaque aparece já no lugar */}
      <div className={`absolute inset-0 bg-slate-950/80 transition-opacity duration-200 ${dimAll ? 'opacity-100' : 'opacity-0'}`} />
      {/* Bloqueia cliques na tela durante o tour */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Cartão: título e texto rolam dentro; cabeçalho, progresso e botões ficam sempre visíveis */}
      <div
        ref={cardRef}
        data-tour-card
        className={`absolute flex flex-col bg-slate-900 border border-slate-700 shadow-2xl transition-opacity duration-200 ${
          tight ? 'gap-2 p-3 rounded-2xl' : 'gap-3 p-4 sm:p-5 rounded-3xl'
        } ${ready ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ top: cardTop, left: cardLeft, width: cardW, maxHeight: cardMaxH }}
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" /> Tour • {i + 1} de {steps.length}
          </span>
          <button type="button" onClick={onClose} className="ml-auto p-1 -m-1 text-slate-500 hover:text-white" title="Fechar o tour">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div ref={bodyRef} className="space-y-1.5 min-h-0 overflow-y-auto overscroll-contain" style={{ maxHeight: Math.round(vh * BODY_VH) }}>
          <h2 className={`${tight ? 'text-base' : 'text-base sm:text-lg'} font-black text-white leading-snug break-words`}>{step.title}</h2>
          <div className="text-sm text-slate-300 leading-relaxed space-y-2 break-words">{step.body}</div>
        </div>
        {/* tela baixa: sem a barra de progresso (o "x de y" no topo já mostra) */}
        {!tight && (
          <div className="flex gap-1 flex-shrink-0" aria-hidden>
            {steps.map((_, k) => (
              <span key={k} className={`h-1 rounded-full flex-1 transition-colors ${k <= i ? 'bg-sky-500' : 'bg-slate-700'}`} />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {i > 0 ? (
            <button type="button" onClick={prev} className={`flex items-center gap-1 px-3 ${tight ? 'py-2' : 'py-2.5'} rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold`}>
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
          ) : (
            <button type="button" onClick={onClose} className={`px-3 ${tight ? 'py-2' : 'py-2.5'} rounded-xl text-slate-400 hover:text-white text-xs font-bold`}>
              Pular tour
            </button>
          )}
          <button
            type="button"
            onClick={next}
            autoFocus
            className={`ml-auto flex items-center gap-1 px-4 ${tight ? 'py-2' : 'py-2.5'} rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black`}
          >
            {last ? 'Concluir' : i === 0 ? 'Começar' : 'Próximo'} {!last && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** Botão discreto para rever o tour. */
export const HelpButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    data-tour="help"
    title="Ver o tour pela plataforma"
    aria-label="Ver o tour pela plataforma"
    className="fixed z-40 right-3 w-9 h-9 rounded-full bg-slate-800/70 border border-slate-700/70 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center opacity-60 hover:opacity-100 transition-all"
    style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
  >
    <HelpCircle className="w-4 h-4" />
  </button>
);
