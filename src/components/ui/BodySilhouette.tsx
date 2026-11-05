import React, { useState } from 'react';
import { FOLD_SITES, FoldKey, FoldValues, Sexo, foldIntensityScale } from '../../lib/bodyFat';

interface Props {
  folds: FoldValues;
  /** Dobra em edição (fica destacada) */
  active?: FoldKey | null;
  onSelect?: (key: FoldKey) => void;
  /** O desenho muda conforme o sexo escolhido na avaliação */
  sexo?: Sexo;
  className?: string;
  /** Visão do atleta: sem clique e com os pontos coloridos por intensidade relativa */
  readOnly?: boolean;
}

type View = 'frente' | 'costas';
const VIEWS: { id: View; label: string }[] = [
  { id: 'frente', label: 'Frente' },
  { id: 'costas', label: 'Costas' },
];

/**
 * Posição dos selos quando a tela usa as imagens (public/corpo/*.png):
 * percentual da largura/altura da imagem. Ajuste fino é aqui.
 */
type Spots = Partial<Record<FoldKey, { x: number; y: number }>>;
/** Mesma posição nos dois corpos: as imagens foram geradas no mesmo enquadramento. */
const IMAGE_SPOTS: Record<View, Spots> = {
  frente: {
    peitoral: { x: 58, y: 27 },
    axilar: { x: 74, y: 31 },
    abdominal: { x: 55, y: 42.5 },
    suprailiaca: { x: 30, y: 44.5 },
    coxa: { x: 39, y: 61 },
    bicipital: { x: 16.5, y: 32.5 },
  },
  costas: {
    subescapular: { x: 61, y: 27 },
    triceps: { x: 15, y: 34 },
    panturrilha: { x: 61, y: 75.5 },
  },
};

/** Verde = menos gordura, amarelo = intermediário, vermelho = mais gordura. */
const heatColor = (t: number) => `hsl(${Math.round(160 - 160 * t)} 85% 55%)`;
const heatLabel = (t: number) => (t >= 0.66 ? 'mais gordura' : t <= 0.33 ? 'menos gordura' : 'gordura intermediária');

/** Posição de cada dobra no desenho (viewBox 0 0 200 380). */
const SPOTS: Record<FoldKey, { view: View; x: number; y: number }> = {
  peitoral: { view: 'frente', x: 113, y: 112 },
  axilar: { view: 'frente', x: 135, y: 122 },
  abdominal: { view: 'frente', x: 104, y: 152 },
  suprailiaca: { view: 'frente', x: 77, y: 167 },
  coxa: { view: 'frente', x: 83, y: 230 },
  bicipital: { view: 'frente', x: 60, y: 140 },
  triceps: { view: 'costas', x: 140, y: 140 },
  subescapular: { view: 'costas', x: 82, y: 115 },
  panturrilha: { view: 'costas', x: 119, y: 292 },
};

type Body = {
  /** Metade esquerda do contorno (a direita é o espelho) */
  half: string;
  muscles: Record<View, string[]>;
  /** Linhas de detalhe extras (tendões, divisões) */
  lines: Record<View, string[]>;
};

/**
 * Contorno único: pescoço, ombro, braço, tronco, quadril, perna e pé.
 * As proporções mudam entre masculino e feminino (ombro, cintura e quadril).
 */
const MALE: Body = {
  half:
    'M100,66 C94,66 90,68 88,72 C82,75 76,78 73,84 C66,88 62,95 60,103 ' +
    'C57,112 55,122 54,132 C53,144 52,156 50,168 C48,180 47,190 48,198 ' +
    'C49,205 53,210 58,210 C63,210 67,206 68,199 C69,190 70,180 71,171 ' +
    'C72,161 73,152 74,145 C72,136 72,127 74,120 C72,132 72,144 75,156 ' +
    'C76,166 76,176 75,184 C74,192 73,200 72,208 C71,220 70,232 70,244 ' +
    'C70,254 71,262 72,270 C71,282 70,296 70,310 C70,320 70,326 70,330 ' +
    'C70,336 68,341 64,342 L80,338 C84,336 86,332 86,326 C86,314 86,302 87,290 ' +
    'C88,278 88,268 88,260 C88,250 89,240 90,232 C92,224 95,216 100,212 Z',
  muscles: {
    frente: [
      // ombro
      'M77,84 C68,88 63,96 62,104 C68,109 74,107 78,100 Z',
      // peitoral
      'M100,101 C92,97 82,100 76,108 C80,121 90,127 100,124 Z',
      // bíceps
      'M66,118 C61,128 60,142 62,156 C67,157 71,151 72,144 C72,132 70,122 68,117 Z',
      // antebraço
      'M58,160 C54,172 53,186 55,198 C59,200 63,195 64,188 C65,176 64,166 63,159 Z',
      // serrátil / oblíquo
      'M78,128 C74,140 73,152 75,164 C80,163 82,155 82,146 C82,138 80,132 79,128 Z',
      // quadríceps
      'M78,196 C72,212 71,232 74,252 C82,258 90,252 91,242 C91,224 87,206 83,194 Z',
      // panturrilha
      'M73,268 C70,282 70,298 72,312 C76,314 80,310 80,303 C81,290 79,276 78,267 Z',
    ],
    costas: [
      // trapézio
      'M100,73 C89,73 79,80 73,89 C81,97 92,100 100,96 Z',
      // dorsal
      'M100,99 C87,98 77,106 73,117 C76,135 80,151 82,165 C90,167 98,163 100,157 Z',
      // ombro posterior
      'M77,84 C68,88 63,96 62,104 C68,109 74,107 78,100 Z',
      // tríceps
      'M66,118 C61,129 60,143 62,157 C67,158 71,152 72,145 C72,133 70,123 68,118 Z',
      // glúteo
      'M100,177 C90,172 79,179 76,190 C77,203 86,211 96,208 C99,200 100,188 100,177 Z',
      // posterior de coxa
      'M78,208 C73,222 73,240 76,254 C84,259 90,252 92,243 C92,226 88,214 84,206 Z',
      // panturrilha
      'M73,264 C70,278 70,294 72,310 C76,312 80,308 80,300 C81,288 79,272 77,263 Z',
    ],
  },
  lines: {
    frente: ['M100,104 C100,120 100,138 100,160', 'M79,196 C84,206 87,220 88,236'],
    costas: ['M100,76 C100,96 100,120 100,168', 'M85,196 C83,210 82,224 82,238'],
  },
};

const FEMALE: Body = {
  half:
    'M100,66 C95,66 91,68 89,72 C84,75 79,78 76,84 C70,88 67,95 65,102 ' +
    'C62,110 61,120 60,130 C59,142 58,154 56,166 C54,178 53,188 54,196 ' +
    'C55,203 59,208 64,208 C69,208 72,204 73,198 C74,189 75,180 76,171 ' +
    'C77,161 78,152 79,145 C77,136 77,127 79,119 C77,131 77,143 79,154 ' +
    'C80,164 80,174 79,182 C78,190 77,198 77,205 C76,216 75,228 75,240 ' +
    'C75,250 76,258 77,266 C76,278 75,292 75,308 C75,318 75,325 75,330 ' +
    'C75,336 73,341 69,342 L84,338 C88,336 90,332 90,326 C90,314 90,302 91,290 ' +
    'C92,278 92,268 92,260 C92,250 92,240 92,232 C93,224 96,216 100,212 Z',
  muscles: {
    frente: [
      // ombro (mais suave)
      'M79,84 C71,88 67,96 66,103 C71,108 76,106 80,100 Z',
      // peitoral / busto
      'M100,101 C93,98 84,101 79,108 C83,121 92,126 100,123 Z',
      // bíceps
      'M69,120 C65,130 64,142 66,154 C70,155 73,150 74,144 C74,133 72,124 70,119 Z',
      // antebraço
      'M61,160 C58,172 57,186 59,197 C62,199 65,195 66,189 C67,177 66,167 65,160 Z',
      // cintura / oblíquo
      'M80,128 C77,140 76,152 78,164 C82,163 84,155 84,146 C84,138 82,132 81,128 Z',
      // coxa (mais cheia)
      'M80,194 C74,210 73,232 76,252 C84,258 92,252 93,242 C93,224 89,204 85,192 Z',
      // panturrilha
      'M77,268 C74,282 74,298 76,312 C79,314 83,310 83,303 C84,290 82,276 81,267 Z',
    ],
    costas: [
      // trapézio
      'M100,73 C90,73 82,80 77,89 C84,96 93,99 100,96 Z',
      // dorsal
      'M100,99 C89,98 80,106 77,117 C80,135 84,151 86,165 C93,167 99,163 100,157 Z',
      // ombro posterior
      'M79,84 C71,88 67,96 66,103 C71,108 76,106 80,100 Z',
      // tríceps
      'M69,120 C65,130 64,143 66,155 C70,156 73,151 74,145 C74,134 72,125 70,119 Z',
      // glúteo (mais amplo)
      'M100,174 C89,169 77,177 74,189 C75,203 85,213 96,210 C99,201 100,188 100,174 Z',
      // posterior de coxa
      'M80,205 C75,220 75,240 78,254 C86,259 92,252 94,243 C94,226 90,212 86,204 Z',
      // panturrilha
      'M77,264 C74,278 74,294 76,310 C79,312 83,308 83,300 C84,288 82,272 80,263 Z',
    ],
  },
  lines: {
    frente: ['M100,104 C100,120 100,138 100,160', 'M81,192 C86,204 89,220 90,236'],
    costas: ['M100,76 C100,96 100,120 100,168', 'M87,194 C85,210 84,224 84,238'],
  },
};

const SHAPES: Record<Sexo, Body> = { Masculino: MALE, Feminino: FEMALE };

const ABS_ROWS = [128, 139, 150];

const Figure: React.FC<{
  view: View;
  body: Body;
  folds: FoldValues;
  active: FoldKey | null;
  onSelect?: (k: FoldKey) => void;
  readOnly?: boolean;
}> = ({ view, body, folds, active, onSelect, readOnly = false }) => {
  const id = (part: string) => `${part}-${view}`;
  const skin = id('skin');
  const glow = id('glow');
  const fibre = id('fibre');
  const half = id('half');
  const muscles = id('muscles');
  const lines = id('lines');
  const mirror = 'translate(200,0) scale(-1,1)';
  const heat = readOnly ? foldIntensityScale(folds) : {};

  return (
    <svg viewBox="0 0 200 380" className="w-full h-auto" role="group" aria-label={`Dobras: vista de ${view}`}>
      <defs>
        <linearGradient id={skin} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#3d6f96" />
          <stop offset="42%" stopColor="#20476b" />
          <stop offset="100%" stopColor="#0b1a2c" />
        </linearGradient>
        <radialGradient id={glow} cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.30" />
          <stop offset="65%" stopColor="#0ea5e9" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={fibre} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a5e6ff" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.12" />
        </linearGradient>
        <path id={half} d={body.half} />
        <g id={muscles}>
          {body.muscles[view].map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g id={lines} fill="none" strokeLinecap="round">
          {body.lines[view].map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </defs>

      {/* halo, painel de leitura e base */}
      <ellipse cx="100" cy="188" rx="94" ry="170" fill={`url(#${glow})`} />
      <ellipse
        cx="100"
        cy="192"
        rx="78"
        ry="152"
        fill="none"
        stroke="#7dd3fc"
        strokeOpacity="0.20"
        strokeWidth="1"
        strokeDasharray="2 7"
      />
      <g stroke="#7dd3fc" strokeOpacity="0.18" strokeWidth="1">
        {[92, 132, 172, 212, 252, 292].map((y) => (
          <line key={y} x1="10" x2="22" y1={y} y2={y} />
        ))}
        {[92, 132, 172, 212, 252, 292].map((y) => (
          <line key={`r${y}`} x1="178" x2="190" y1={y} y2={y} />
        ))}
        <line x1="16" x2="16" y1="92" y2="292" strokeOpacity="0.10" />
        <line x1="184" x2="184" y1="92" y2="292" strokeOpacity="0.10" />
      </g>

      {/* corpo */}
      <g>
        <use href={`#${half}`} fill={`url(#${skin})`} />
        <use href={`#${half}`} fill={`url(#${skin})`} transform={mirror} />
      </g>
      <g fill={`url(#${fibre})`} stroke="#bae6fd" strokeOpacity="0.28" strokeWidth="0.8" strokeLinejoin="round">
        <use href={`#${muscles}`} />
        <use href={`#${muscles}`} transform={mirror} />
      </g>
      <g stroke="#bae6fd" strokeOpacity="0.32" strokeWidth="0.9">
        <use href={`#${lines}`} />
        <use href={`#${lines}`} transform={mirror} />
      </g>
      {view === 'frente' &&
        ABS_ROWS.map((y) => (
          <g key={y}>
            <rect x="89" y={y} width="10.5" height="8" rx="2.5" fill="#bae6fd" fillOpacity="0.14" stroke="#bae6fd" strokeOpacity="0.22" strokeWidth="0.7" />
            <rect x="100.5" y={y} width="10.5" height="8" rx="2.5" fill="#bae6fd" fillOpacity="0.14" stroke="#bae6fd" strokeOpacity="0.22" strokeWidth="0.7" />
          </g>
        ))}
      {/* luz de borda */}
      <g fill="none" stroke="#67e8f9" strokeOpacity="0.55" strokeWidth="1.4" strokeLinejoin="round">
        <use href={`#${half}`} />
        <use href={`#${half}`} transform={mirror} />
      </g>

      {/* cabeça, rosto e pescoço */}
      <g>
        <ellipse cx="100" cy="42" rx="17" ry="21" fill={`url(#${skin})`} stroke="#67e8f9" strokeOpacity="0.45" strokeWidth="1.2" />
        <path d="M88,40 C92,36 96,35 100,35 C104,35 108,36 112,40" fill="none" stroke="#bae6fd" strokeOpacity="0.30" strokeWidth="0.9" />
        <path d="M90,50 C92,59 96,64 100,64 C104,64 108,59 110,50" fill="none" stroke="#bae6fd" strokeOpacity="0.25" strokeWidth="0.9" />
        <path d="M92,46 L96,46 M104,46 L108,46" stroke="#bae6fd" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M87,66 C92,74 108,74 113,66" fill="none" stroke="#bae6fd" strokeOpacity="0.22" strokeWidth="1" />
        <circle cx="81.5" cy="44" r="2.8" fill="#132a44" stroke="#67e8f9" strokeOpacity="0.3" />
        <circle cx="118.5" cy="44" r="2.8" fill="#132a44" stroke="#67e8f9" strokeOpacity="0.3" />
      </g>

      <ellipse cx="100" cy="346" rx="62" ry="7" fill="#0ea5e9" fillOpacity="0.16" stroke="#67e8f9" strokeOpacity="0.35" />

      {/* pontos de medida: selos grandes com sigla */}
      {FOLD_SITES.filter((f) => SPOTS[f.key].view === view).map((f) => {
        const spot = SPOTS[f.key];
        const value = folds[f.key];
        const preenchida = typeof value === 'number' && Number.isFinite(value) && value > 0;

        if (readOnly) {
          const intensity = heat[f.key];
          const color = typeof intensity === 'number' ? heatColor(intensity) : null;
          const label = typeof intensity === 'number' ? heatLabel(intensity) : 'não medida';
          return (
            <g key={f.key} role="img" aria-label={`${f.nome} — ${label}`}>
              <title>{`${f.nome} — ${label}`}</title>
              {color && <circle cx={spot.x} cy={spot.y} r={18} fill={color} opacity="0.18" />}
              <circle cx={spot.x} cy={spot.y} r={11} fill={color ?? '#1e293b'} stroke="#020b16" strokeWidth="1.6" />
            </g>
          );
        }

        const isActive = active === f.key;
        const ring = isActive ? '#bae6fd' : preenchida ? '#6ee7b7' : '#7dd3fc';
        return (
          <g
            key={f.key}
            role="button"
            tabIndex={0}
            aria-label={`${f.nome}${preenchida ? `: ${value} mm` : ': medir'}`}
            onClick={() => onSelect?.(f.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(f.key);
              }
            }}
            className="cursor-pointer outline-none focus-visible:opacity-80"
          >
            <title>{`${f.nome} (${f.sigla})`}</title>
            {isActive && <circle cx={spot.x} cy={spot.y} r={19} fill="#0ea5e9" opacity="0.30" className="animate-ping" />}
            <circle cx={spot.x} cy={spot.y} r={16} fill="#020b16" fillOpacity={isActive ? 0.55 : 0.88} />
            <circle
              cx={spot.x}
              cy={spot.y}
              r={15}
              fill={isActive ? '#0ea5e9' : preenchida ? 'rgba(16,185,129,0.18)' : 'rgba(8,20,34,0.6)'}
              stroke={ring}
              strokeOpacity={isActive ? 1 : 0.7}
              strokeWidth={1.6}
              strokeDasharray={preenchida || isActive ? undefined : '3 2.5'}
              style={{ transition: 'all 150ms' }}
            />
            <circle cx={spot.x} cy={spot.y} r={10.5} fill="none" stroke={ring} strokeOpacity="0.25" strokeWidth="0.8" />
            <text
              x={spot.x}
              y={spot.y + 4}
              textAnchor="middle"
              fontSize={preenchida ? '11' : '10'}
              fontWeight="900"
              fill={isActive ? '#04121f' : preenchida ? '#a7f3d0' : '#e2e8f0'}
              pointerEvents="none"
              style={{ letterSpacing: '-0.3px' }}
            >
              {preenchida ? String(value) : f.sigla}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/**
 * Mesma tela, mas com a imagem real do corpo (public/corpo/<vista>-<sexo>.png).
 * Se o arquivo não existir, cai no desenho vetorial — nada quebra.
 */
/**
 * As imagens têm margens transparentes diferentes: o corpo feminino ocupa
 * ~85% da altura da imagem, contra ~79% do masculino. Como as duas são
 * exibidas com a mesma altura de <img>, reduzimos a feminina em ~7% para
 * que o corpo tenha o mesmo tamanho aparente nas duas versões.
 */
const IMAGE_HEIGHT: Record<Sexo, string> = {
  Masculino: 'h-[clamp(360px,62vh,560px)]',
  Feminino: 'h-[clamp(336px,58vh,522px)]',
};

const ImageFigure: React.FC<{
  view: View;
  sexo: Sexo;
  folds: FoldValues;
  active: FoldKey | null;
  onSelect?: (k: FoldKey) => void;
  readOnly?: boolean;
}> = ({ view, sexo, folds, active, onSelect, readOnly = false }) => {
  const [failed, setFailed] = useState(false);
  const heat = readOnly ? foldIntensityScale(folds) : {};

  if (failed) {
    return (
      <Figure
        view={view}
        body={SHAPES[sexo] ?? MALE}
        folds={folds}
        active={active}
        onSelect={onSelect}
        readOnly={readOnly}
      />
    );
  }

  return (
    <div className="flex w-full justify-center">
      <div className="relative">
        <img
          src={`/corpo/${view}-${sexo.toLowerCase()}.png`}
          alt={`Corpo — vista de ${view}`}
          className={`block ${IMAGE_HEIGHT[sexo] ?? IMAGE_HEIGHT.Masculino} w-auto max-w-full select-none`}
          style={{
            // sombra suave para assentar a figura transparente no painel
            filter: 'drop-shadow(0 16px 24px rgba(2, 11, 22, 0.75)) drop-shadow(0 0 18px rgba(56, 189, 248, 0.16))',
          }}
          draggable={false}
          onError={() => setFailed(true)}
        />
        {FOLD_SITES.filter((f) => SPOTS[f.key].view === view).map((f) => {
          const pos = IMAGE_SPOTS[view][f.key];
          if (!pos) return null;
          const value = folds[f.key];
          const preenchida = typeof value === 'number' && Number.isFinite(value) && value > 0;

          if (readOnly) {
            const intensity = heat[f.key];
            const color = typeof intensity === 'number' ? heatColor(intensity) : null;
            const label = typeof intensity === 'number' ? heatLabel(intensity) : 'não medida';
            return (
              <span
                key={f.key}
                role="img"
                title={`${f.nome} — ${label}`}
                aria-label={`${f.nome} — ${label}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-slate-950"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  backgroundColor: color ?? '#1e293b',
                  boxShadow: color ? `0 0 12px ${color}` : undefined,
                }}
              />
            );
          }

          const isActive = active === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onSelect?.(f.key)}
              title={`${f.nome}${preenchida ? `: ${value} mm` : ''}`}
              aria-label={`${f.nome}${preenchida ? `: ${value} mm` : ': medir'}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 grid place-items-center text-[10px] font-black leading-none shadow-lg touch-manipulation transition active:scale-110 ${
                isActive
                  ? 'bg-sky-500 text-slate-950 border-sky-100'
                  : preenchida
                  ? 'bg-emerald-500/30 text-emerald-100 border-emerald-300/90'
                  : 'bg-slate-950/90 text-slate-100 border-sky-300/70 border-dashed'
              }`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {preenchida ? value : f.sigla}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Silhueta do atleta com as dobras clicáveis (frente e costas).
 * Usa as imagens de public/corpo quando existem; senão, o desenho vetorial.
 * O desenho muda conforme o sexo; verde = medida, azul = em edição, tracejado = falta.
 */
/** Fundo do painel: brilho central, base luminosa, trilhos laterais e cantoneiras HUD. */
const PanelBackdrop: React.FC = () => (
  <div aria-hidden className="pointer-events-none absolute inset-0">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(56,189,248,0.16),transparent_64%)]" />
    <div className="absolute inset-x-0 bottom-0 h-28 bg-[radial-gradient(ellipse_at_50%_100%,rgba(14,165,233,0.20),transparent_72%)]" />
    <div className="absolute inset-y-6 left-2.5 w-px bg-gradient-to-b from-transparent via-sky-400/30 to-transparent" />
    <div className="absolute inset-y-6 right-2.5 w-px bg-gradient-to-b from-transparent via-sky-400/30 to-transparent" />
    <div
      className="absolute inset-0 opacity-[0.07]"
      style={{ backgroundImage: 'repeating-linear-gradient(to bottom, #7dd3fc 0 1px, transparent 1px 14px)' }}
    />
    <span className="absolute left-2 top-2 h-3 w-3 border-l border-t border-sky-400/40 rounded-tl" />
    <span className="absolute right-2 top-2 h-3 w-3 border-r border-t border-sky-400/40 rounded-tr" />
    <span className="absolute left-2 bottom-2 h-3 w-3 border-b border-l border-sky-400/40 rounded-bl" />
    <span className="absolute right-2 bottom-2 h-3 w-3 border-b border-r border-sky-400/40 rounded-br" />
  </div>
);

/**
 * Silhueta do atleta com as dobras clicáveis (frente e costas).
 * Usa as imagens de public/corpo quando existem; senão, o desenho vetorial.
 * O desenho muda conforme o sexo; verde = medida, azul = em edição, tracejado = falta.
 * Com `readOnly`, os pontos viram um mapa de calor relativo (verde = menos, vermelho = mais).
 */
export const BodySilhouette: React.FC<Props> = ({
  folds,
  active = null,
  onSelect,
  sexo = 'Masculino',
  className = '',
  readOnly = false,
}) => (
  <div className={`grid grid-cols-2 gap-2 ${className}`}>
    {VIEWS.map((v) => (
      <div
        key={v.id}
        className="relative overflow-hidden rounded-2xl border border-sky-400/15 bg-[#060d18] shadow-[inset_0_1px_0_rgba(125,211,252,0.10)]"
      >
        <PanelBackdrop />
        <div className="relative flex flex-col items-center px-1 pb-2 pt-2.5">
          <span className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300/70">{v.label}</span>
          <ImageFigure
            view={v.id}
            sexo={sexo}
            folds={folds}
            active={active}
            onSelect={onSelect}
            readOnly={readOnly}
          />
        </div>
      </div>
    ))}
  </div>
);
