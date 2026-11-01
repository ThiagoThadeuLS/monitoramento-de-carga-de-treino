import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, HelpCircle, X, Compass } from 'lucide-react';

/**
 * Tour guiado pelas telas de verdade: destaca uma parte da tela de cada vez
 * (data-tour="...") e explica para que serve. Não altera nenhum dado.
 */
export interface TourStep {
  /** valor de data-tour do elemento destacado (sem alvo: cartão no centro) */
  target?: string;
  title: string;
  body: React.ReactNode;
  /** prepara a tela antes do passo (ex.: trocar de aba) */
  before?: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;

export const Tour: React.FC<{ steps: TourStep[]; onClose: () => void }> = ({ steps, onClose }) => {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const [cardH, setCardH] = useState(260);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  // Troca de passo: prepara a tela, espera o alvo aparecer e rola até ele
  useEffect(() => {
    setReady(false);
    step.before?.();
    if (!step.target) {
      setRect(null);
      setReady(true);
      return;
    }
    let tries = 0;
    let timer: number;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el && el.getBoundingClientRect().height > 0) {
        // Leva o início da seção para o topo (abaixo do cabeçalho fixo); o cartão fica no espaço livre
        if (getComputedStyle(el).position !== 'fixed') {
          const top = el.getBoundingClientRect().top + window.scrollY - 76;
          window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
        }
        timer = window.setTimeout(() => setReady(true), 350);
      } else if (tries++ < 30) {
        timer = window.setTimeout(find, 100);
      } else {
        setRect(null);
        setReady(true);
      }
    };
    timer = window.setTimeout(find, 60);
    return () => window.clearTimeout(timer);
  }, [i]);

  // Acompanha a posição do alvo (rolagem, teclado, conteúdo carregando)
  useLayoutEffect(() => {
    if (!step.target) return;
    let frame = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect((cur) =>
          cur && Math.abs(cur.top - r.top) < 0.5 && Math.abs(cur.left - r.left) < 0.5 && Math.abs(cur.width - r.width) < 0.5 && Math.abs(cur.height - r.height) < 0.5
            ? cur
            : { top: r.top, left: r.left, width: r.width, height: r.height }
        );
      } else setRect(null);
      if (cardRef.current) {
        const h = cardRef.current.offsetHeight;
        setCardH((cur) => (Math.abs(cur - h) < 1 ? cur : h));
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
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

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Destaque limitado à área visível
  const spot =
    step.target && rect
      ? (() => {
          const top = Math.max(rect.top - PAD, 8);
          const left = Math.max(rect.left - PAD, 4);
          const bottom = Math.min(rect.top + rect.height + PAD, vh - 8);
          const right = Math.min(rect.left + rect.width + PAD, vw - 4);
          return { top, left, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
        })()
      : null;
  // Cartão no espaço livre: embaixo do destaque, senão em cima; se não couber, embaixo (o início da seção fica visível)
  const placement: 'center' | 'top' | 'bottom' = !spot
    ? 'center'
    : vh - (spot.top + spot.height) >= cardH + 16
    ? 'bottom'
    : spot.top >= cardH + 16
    ? 'top'
    : 'bottom';

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Tour pela plataforma">
      {/* Fundo escurecido com "janela" no elemento destacado; bloqueia cliques na tela */}
      {spot ? (
        <div
          className="absolute rounded-2xl ring-2 ring-sky-400 transition-all duration-300 ease-out pointer-events-none"
          style={{ ...spot, boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.8)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-[2px]" />
      )}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        className={`absolute left-0 right-0 px-3 sm:px-4 flex justify-center pointer-events-none ${
          placement === 'center' ? 'top-1/2 -translate-y-1/2' : placement === 'top' ? 'top-3' : 'bottom-3'
        }`}
        style={placement === 'bottom' ? { paddingBottom: 'env(safe-area-inset-bottom)' } : placement === 'top' ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
      >
        <div
          ref={cardRef}
          className={`pointer-events-auto w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-4 sm:p-5 space-y-3 transition-opacity duration-200 ${
            ready ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" /> Tour • {i + 1} de {steps.length}
            </span>
            <button type="button" onClick={onClose} className="ml-auto p-1 -m-1 text-slate-500 hover:text-white" title="Fechar o tour">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1.5 max-h-[38vh] overflow-y-auto">
            <h2 className="text-base sm:text-lg font-black text-white leading-snug">{step.title}</h2>
            <div className="text-sm text-slate-300 leading-relaxed space-y-2">{step.body}</div>
          </div>
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, k) => (
              <span key={k} className={`h-1 rounded-full flex-1 transition-colors ${k <= i ? 'bg-sky-500' : 'bg-slate-700'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {i > 0 ? (
              <button type="button" onClick={prev} className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            ) : (
              <button type="button" onClick={onClose} className="px-3 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-bold">
                Pular tour
              </button>
            )}
            <button
              type="button"
              onClick={next}
              autoFocus
              className="ml-auto flex items-center gap-1 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black"
            >
              {last ? 'Concluir' : i === 0 ? 'Começar' : 'Próximo'} {!last && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
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
