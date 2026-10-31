import React, { useState, useEffect } from 'react';
import { Calendar, Flame, HeartPulse, Scale, AlertTriangle, RefreshCw, Loader2, CheckCircle2, Edit3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Athlete, PseRecord, PsrRecord, WeightRecord } from '../../types';
import { todayLocalISO } from '../../lib/date';

interface AthleteDailyStatus {
  athlete: Athlete;
  pse?: PseRecord;
  psr?: PsrRecord;
  weight?: WeightRecord;
}

interface DailyOverviewProps {
  onEditAthlete?: (athlete: Athlete) => void;
}

export const DailyOverview: React.FC<DailyOverviewProps> = ({ onEditAthlete }) => {
  const [selectedDate, setSelectedDate] = useState(todayLocalISO);
  const [statuses, setStatuses] = useState<AthleteDailyStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDailyData = async () => {
    if (!supabase) return;
    setLoading(true);

    try {
      // 1. Busca todos os atletas ativos
      const { data: athletesData } = await supabase
        .from('athletes')
        .select('*')
        .eq('active', true)
        .order('nome');

      const athletes: Athlete[] = athletesData || [];

      // 2. Busca registros de PSE na data
      const { data: pseData } = await supabase
        .from('pse_records')
        .select('*')
        .eq('date', selectedDate);

      // 3. Busca registros de PSR na data
      const { data: psrData } = await supabase
        .from('psr_records')
        .select('*')
        .eq('date', selectedDate);

      // 4. Busca registros de Peso na data
      const { data: weightData } = await supabase
        .from('weight_records')
        .select('*')
        .eq('date', selectedDate);

      // Agrupa os dados por atleta
      const combined: AthleteDailyStatus[] = athletes.map((a) => ({
        athlete: a,
        pse: pseData?.find((p) => p.athlete_id === a.id),
        psr: psrData?.find((r) => r.athlete_id === a.id),
        weight: weightData?.find((w) => w.athlete_id === a.id),
      }));

      setStatuses(combined);
    } catch (err) {
      console.error('Erro ao carregar dados do dia:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDailyData();
  }, [selectedDate]);

  // Contadores
  const totalAthletes = statuses.length;
  const pseAnswered = statuses.filter((s) => s.pse).length;
  const psrAnswered = statuses.filter((s) => s.psr).length;
  const weightAnswered = statuses.filter((s) => s.weight).length;

  // Média de esforço do dia
  const validPseScores = statuses.filter((s) => s.pse && s.pse.rpe_score !== null).map((s) => s.pse!.rpe_score!);
  const avgPse = validPseScores.length > 0
    ? (validPseScores.reduce((a, b) => a + b, 0) / validPseScores.length).toFixed(1)
    : '—';

  // Média de recuperação do dia
  const validPsrScores = statuses.filter((s) => s.psr).map((s) => s.psr!.psr_score);
  const avgPsr = validPsrScores.length > 0
    ? (validPsrScores.reduce((a, b) => a + b, 0) / validPsrScores.length).toFixed(1)
    : '—';

  return (
    <div className="space-y-6">
      {/* Top Bar: Seletor de Data + Botão Atualizar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-sky-400" />
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block">
              Data de Monitoramento
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1 text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={loadDailyData}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Dados</span>
        </button>
      </div>

      {/* Cards de Resumo Rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Questionários PSE
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{pseAnswered}</span>
            <span className="text-xs text-slate-400 font-medium">/ {totalAthletes}</span>
          </div>
          <span className="text-[11px] text-orange-400 font-semibold flex items-center gap-1">
            <Flame className="w-3 h-3" /> Média PSE: {avgPse}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Questionários PSR
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{psrAnswered}</span>
            <span className="text-xs text-slate-400 font-medium">/ {totalAthletes}</span>
          </div>
          <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <HeartPulse className="w-3 h-3" /> Média PSR: {avgPsr}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Pesagens Registradas
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{weightAnswered}</span>
            <span className="text-xs text-slate-400 font-medium">/ {totalAthletes}</span>
          </div>
          <span className="text-[11px] text-sky-400 font-semibold flex items-center gap-1">
            <Scale className="w-3 h-3" /> Balança
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total do Elenco
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{totalAthletes}</span>
            <span className="text-xs text-slate-400 font-medium">atletas ativos</span>
          </div>
          <span className="text-[11px] text-slate-400 font-semibold">
            Minas Tênis Clube
          </span>
        </div>
      </div>

      {/* Tabela Detalhada com Alertas */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-white text-base">Acompanhamento Individual por Atleta</h3>
          <span className="text-xs text-slate-400">{statuses.length} atletas listados</span>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
            <p className="text-sm">Carregando dados do dia...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Atleta</th>
                  <th className="py-3 px-3">PSE (Esforço)</th>
                  <th className="py-3 px-3">Tipo de Treino</th>
                  <th className="py-3 px-3">PSR (Bem-Estar)</th>
                  <th className="py-3 px-3">Peso</th>
                  <th className="py-3 px-4">Status / Alertas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {statuses.map(({ athlete, pse, psr, weight }) => {
                  const hasMusclePain = psr && psr.muscle_soreness_score <= 3;
                  const hasHighFatigue = psr && psr.fatigue_score <= 3;
                  const hasExtremeEffort = pse && pse.rpe_score && pse.rpe_score >= 9;

                  return (
                    <tr key={athlete.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Atleta com Botão de Editar Direto */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-bold text-white leading-tight">{athlete.nome}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Classe {athlete.classe || 'A'} • {athlete.categoria}
                            </p>
                          </div>
                          {onEditAthlete && (
                            <button
                              type="button"
                              onClick={() => onEditAthlete(athlete)}
                              className="px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 active:bg-sky-500/30 text-sky-400 border border-sky-500/20 text-xs font-bold flex items-center gap-1 transition-colors flex-shrink-0"
                              title="Editar este atleta"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Editar</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* PSE */}
                      <td className="py-3 px-3">
                        {pse ? (
                          pse.did_not_train ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-800 font-semibold">
                              Não Treinou
                            </span>
                          ) : (
                            <span
                              className={`text-xs px-2.5 py-1 rounded-lg border font-bold ${
                                (pse.rpe_score || 0) >= 8
                                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                  : (pse.rpe_score || 0) >= 5
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              }`}
                            >
                              PSE: {pse.rpe_score} / 10
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-500 italic">Pendente</span>
                        )}
                      </td>

                      {/* Tipo de Treino */}
                      <td className="py-3 px-3 text-xs">
                        {pse?.training_type ? (
                          <span className="font-medium text-slate-200">
                            {pse.training_type}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* PSR */}
                      <td className="py-3 px-3">
                        {psr ? (
                          <div className="space-y-0.5">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-lg border font-bold ${
                                psr.psr_score <= 3
                                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                  : psr.psr_score <= 6
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              }`}
                            >
                              PSR: {psr.psr_score} / 10
                            </span>
                            <p className="text-[10px] text-slate-400">
                              Dor: {psr.muscle_soreness_score} • Sono: {psr.sleep_score} • Fadiga: {psr.fatigue_score}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Pendente</span>
                        )}
                      </td>

                      {/* Peso */}
                      <td className="py-3 px-3 font-semibold text-slate-200 text-xs">
                        {weight ? (
                          <span className="text-sky-400 font-bold">{weight.weight} kg</span>
                        ) : (
                          <span className="text-slate-500 italic">Pendente</span>
                        )}
                      </td>

                      {/* Alertas da Fisiologia */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {hasMusclePain && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-950/80 text-red-300 border border-red-800 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-red-400" />
                              Dor Muscular
                            </span>
                          )}
                          {hasHighFatigue && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-800 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                              Fadiga Alta
                            </span>
                          )}
                          {hasExtremeEffort && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-950/80 text-orange-300 border border-orange-800 flex items-center gap-1">
                              <Flame className="w-3 h-3 text-orange-400" />
                              Esforço Máximo
                            </span>
                          )}
                          {!hasMusclePain && !hasHighFatigue && !hasExtremeEffort && (pse || psr) && (
                            <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Normal
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
