import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, Loader2, Ruler, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { BodyCompositionPoint, getAthleteBodyComposition } from '../../lib/athleteAuth';
import { BodyFatTrend } from '../ui/BodyFatTrend';
import { BodySilhouette } from '../ui/BodySilhouette';
import { brDate, formatKg } from '../../lib/export';
import { formatDelta, Sexo } from '../../lib/bodyFat';

// Duas casas: 16,73% continua 16,73% (não arredonda para 17%)
const fmtPct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Acompanhamento do atleta: % de gordura, evolução e um mapa de calor das dobras
 * (verde = menos, vermelho = mais). Os valores em milímetros continuam só na
 * tela da comissão técnica.
 */
export const AthleteBodyComposition: React.FC<{ token: string }> = ({ token }) => {
  const [points, setPoints] = useState<BodyCompositionPoint[]>([]);
  const [sexo, setSexo] = useState<Sexo>('Masculino');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getAthleteBodyComposition(token)
      .then((data) => {
        if (cancelled) return;
        setPoints(data.history);
        setSexo(data.sexo);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
      </div>
    );
  }

  // Banco ainda sem a migração: não assusta o atleta com erro
  if (error) {
    return (
      <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-start gap-2.5 text-slate-400 text-xs">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        Não foi possível carregar sua composição corporal agora.
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 text-center space-y-2">
        <Ruler className="w-7 h-7 text-slate-600 mx-auto" />
        <h3 className="text-sm font-bold text-white">Composição corporal</h3>
        <p className="text-xs text-slate-400 max-w-xs mx-auto">
          Sua comissão técnica ainda não registrou uma avaliação de dobras. Assim que registrar, seu percentual de gordura e
          a evolução aparecem aqui.
        </p>
      </section>
    );
  }

  const last = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : null;
  const delta = previous ? last.percentual - previous.percentual : null;
  const first = points[0];
  const sinceFirst = points.length > 1 ? last.percentual - first.percentual : null;
  const ringRatio = Math.min(1, Math.max(0.03, (last.percentual - 3) / 27));
  const lastFolds = last.folds ?? {};
  const hasFolds = Object.values(lastFolds).some((v) => typeof v === 'number' && v > 0);

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <Activity className="w-5 h-5 text-sky-400" />
        <div className="min-w-0">
          <h3 className="font-bold text-white text-sm">Composição corporal</h3>
          <p className="text-[11px] text-slate-500">Avaliações feitas pela comissão técnica</p>
        </div>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-500 flex-shrink-0">
          {points.length} {points.length === 1 ? 'avaliação' : 'avaliações'}
        </span>
      </header>

      <div className="p-4 space-y-4">
        {/* Percentual atual */}
        <div className="flex items-center gap-4">
          <div className="relative w-28 h-28 flex-shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <defs>
                <linearGradient id="ac-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r={RING_R} fill="none" stroke="#1e293b" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r={RING_R}
                fill="none"
                stroke="url(#ac-ring)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${RING_C * ringRatio} ${RING_C}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black text-white leading-none">
                {fmtPct(last.percentual)}
                <span className="text-sm font-bold text-slate-400">%</span>
              </span>
              <span className="text-[9px] uppercase tracking-wider text-slate-500 mt-1">de gordura</span>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[11px] text-slate-500">
              Última avaliação em <span className="text-slate-300 font-semibold">{brDate(last.date)}</span>
            </p>
            {delta !== null && (
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-black ${
                  delta <= 0 ? 'bg-emerald-500/10 border-emerald-600/40 text-emerald-300' : 'bg-amber-500/10 border-amber-600/40 text-amber-300'
                }`}
              >
                {delta <= 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                {formatDelta(delta, 2)} p.p.
              </div>
            )}
            {sinceFirst !== null && (
              <p className="text-[11px] text-slate-500">
                {formatDelta(sinceFirst, 2)} p.p. desde {brDate(first.date)}
              </p>
            )}
          </div>
        </div>

        {/* Massas */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5 text-center">
            <Scale className="w-3.5 h-3.5 text-sky-400 mx-auto mb-0.5" />
            <p className="text-[9px] uppercase tracking-wider text-slate-500">Peso</p>
            <p className="text-sm font-black text-white">{last.peso !== null ? formatKg(last.peso) : '—'}</p>
          </div>
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-slate-500">Massa magra</p>
            <p className="text-sm font-black text-emerald-300">{last.massa_magra !== null ? formatKg(last.massa_magra) : '—'}</p>
          </div>
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-slate-500">Massa gorda</p>
            <p className="text-sm font-black text-amber-300">{last.massa_gorda !== null ? formatKg(last.massa_gorda) : '—'}</p>
          </div>
        </div>

        {/* Silhuetas: onde há mais/menos gordura (relativo às dobras da avaliação) */}
        {hasFolds && (
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Distribuição de gordura</p>
              <span className="text-[10px] text-slate-500 flex-shrink-0">última avaliação</span>
            </div>
            <BodySilhouette folds={lastFolds} sexo={sexo} readOnly />
            <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500">
              <span>Menos</span>
              <span
                className="h-1.5 w-24 rounded-full"
                style={{ background: 'linear-gradient(90deg, hsl(160 85% 55%), hsl(80 85% 55%), hsl(0 85% 55%))' }}
              />
              <span>Mais</span>
            </div>
            <p className="text-[10px] text-slate-500 text-center leading-relaxed">
              Comparação relativa entre as dobras desta avaliação.
            </p>
          </div>
        )}

        {/* Evolução */}
        {points.length > 1 ? (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Evolução do % de gordura</p>
            <BodyFatTrend points={points.map((p) => ({ date: p.date, percentual: p.percentual }))} height={160} />
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 text-center py-1">
            A partir da próxima avaliação você vê aqui a evolução ao longo do tempo.
          </p>
        )}

        {/* Avaliações */}
        <ul className="divide-y divide-slate-800/70 border-t border-slate-800 pt-1">
          {[...points].reverse().map((p) => (
            <li key={p.date} className="flex items-center justify-between gap-2 py-2">
              <span className="text-xs text-slate-400">{brDate(p.date)}</span>
              <span className="flex items-baseline gap-2">
                {p.massa_magra !== null && (
                  <span className="text-[11px] text-slate-500">magra {formatKg(p.massa_magra)}</span>
                )}
                <span className="text-sm font-black text-white">{fmtPct(p.percentual)}%</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
