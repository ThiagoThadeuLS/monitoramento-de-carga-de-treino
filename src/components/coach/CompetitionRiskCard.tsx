import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, Trophy } from 'lucide-react';
import { Competition } from '../../types';
import { getCompetitionSummary, listCompetitions } from '../../lib/competitions';
import { buildWeightPlan, daysBetweenISO, parseCategoryWeight } from '../../lib/weightPlan';

interface Summary {
  competition: Competition;
  risk: string[];
  attention: number;
  total: number;
}

/** Visão "Hoje" do treinador: próxima competição e quem está em risco de peso (some se não houver). */
export const CompetitionRiskCard: React.FC<{ today: string; onOpen: () => void }> = ({ today, onOpen }) => {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listCompetitions();
        const next = list.filter((c) => c.data_pesagem >= today).sort((a, b) => a.data_pesagem.localeCompare(b.data_pesagem))[0];
        if (!next) {
          if (!cancelled) setSummary(null);
          return;
        }
        const rows = await getCompetitionSummary(next.id);
        if (cancelled) return;
        const plans = rows.map((r) => ({
          nome: r.nome,
          plan: buildWeightPlan({
            currentWeight: r.peso_atual,
            currentDate: r.peso_data,
            targetWeight: parseCategoryWeight(r.categoria),
            category: r.categoria,
            weighInDate: next.data_pesagem,
            today,
          }),
        }));
        setSummary({
          competition: next,
          risk: plans.filter((p) => p.plan.status === 'risco').map((p) => p.nome),
          attention: plans.filter((p) => p.plan.status === 'atencao').length,
          total: rows.length,
        });
      } catch {
        // Módulo de competições ainda não ativado no banco: o cartão não aparece
        if (!cancelled) setSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [today]);

  if (!summary) return null;
  const { competition: c, risk, attention, total } = summary;
  const days = daysBetweenISO(today, c.data_pesagem);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left rounded-2xl border p-4 flex items-center gap-3 ${
        risk.length ? 'bg-red-500/10 border-red-500/40' : 'bg-slate-900/80 border-slate-800'
      } hover:brightness-110`}
    >
      <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
        {risk.length ? <AlertTriangle className="w-5 h-5 text-red-300" /> : <Trophy className="w-5 h-5 text-amber-300" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white truncate">
          {c.nome} • pesagem {days === 0 ? 'hoje' : `em ${days} dia${days === 1 ? '' : 's'}`}
        </p>
        <p className="text-xs text-slate-300">
          {risk.length
            ? `Acima do limite de peso: ${risk.slice(0, 3).join(', ')}${risk.length > 3 ? ` e mais ${risk.length - 3}` : ''}`
            : `${total} atleta${total === 1 ? '' : 's'} • todos dentro do limite`}
          {attention > 0 && ` • ${attention} em atenção`}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
    </button>
  );
};
