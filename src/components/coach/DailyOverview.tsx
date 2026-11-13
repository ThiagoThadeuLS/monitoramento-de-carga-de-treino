import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Cake, Flame, HeartPulse, Scale, AlertTriangle, RefreshCw, Loader2, CheckCircle2, Edit3, BellOff, ChevronDown, Siren,
  Clock, ListChecks,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Athlete, PseRecord, PsrRecord, TrainingSession, WeightRecord } from '../../types';
import { addDaysISO, nowTimeHM, stampInAppZone, todayISO } from '../../lib/date';
import { useClub } from '../../lib/club';
import { AthleteBirthday, fetchAthleteBirthdays, fetchClubAthletes } from '../../lib/athletes';
import { ageOn, isBirthday } from '../../lib/age';
import { brDate } from '../../lib/export';
import { sessionAppliesTo, useClubGroups } from '../../lib/groups';
import { LoadMetrics, dailyLoads, loadMetrics, sessionLoad } from '../../lib/load';
import { matchPseToSessions } from '../../lib/pseMatch';
import { AttentionReason, attentionLevel, attentionReasons, pendingForDay } from '../../lib/attention';
import { AthleteSelection, EMPTY_SELECTION, GroupFilter, resolveSelection } from './GroupFilter';
import { fetchRange } from './period/shared';
import { DayAlerts } from './period/DayAlerts';
import { PushRow, pushProblem } from './PushStatusCard';
import { Avatar } from '../ui/Avatar';

interface AthleteDailyStatus {
  athlete: Athlete;
  pses: PseRecord[]; // o atleta pode responder mais de uma PSE no dia
  psr?: PsrRecord;
  weight?: WeightRecord;
}

interface DailyOverviewProps {
  onEditAthlete?: (athlete: Athlete) => void;
  /** Abre a ficha individual do atleta */
  onOpenProfile?: (athleteId: string) => void;
  /** Abre a lista de notificações dos atletas (Elenco → Atletas) */
  onOpenNotifications?: () => void;
}

const loadText = (p: PseRecord) =>
  p.duration_minutes && p.rpe_score ? `${p.duration_minutes} min • ${Math.round(p.rpe_score * p.duration_minutes)} UA` : '';

const LEVEL_CHIP: Record<number, string> = {
  3: 'bg-red-500/15 text-red-300 border-red-500/40',
  2: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  1: 'bg-slate-800 text-slate-300 border-slate-700',
};

const ReasonChip: React.FC<{ r: AttentionReason }> = ({ r }) => (
  <span title={r.detail} className={`text-[10px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${LEVEL_CHIP[r.level]}`}>
    {r.label}
  </span>
);

const hm = (t?: string | null) => (t ? t.slice(0, 5) : '');

export const DailyOverview: React.FC<DailyOverviewProps> = ({ onEditAthlete, onOpenProfile, onOpenNotifications }) => {
  const { club } = useClub();
  const clubId = club?.id ?? null;
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const { groups } = useClubGroups();
  const [selection, setSelection] = useState<AthleteSelection>(EMPTY_SELECTION);
  const [statuses, setStatuses] = useState<AthleteDailyStatus[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loads, setLoads] = useState<Map<string, LoadMetrics>>(new Map());
  const [push, setPush] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [showLight, setShowLight] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const loadDailyData = () => setReloadKey((k) => k + 1);

  // Aniversariantes do dia (consulta separada: banco antigo devolve lista vazia)
  const [birthdays, setBirthdays] = useState<AthleteBirthday[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchAthleteBirthdays(clubId)
      .then((list) => !cancelled && setBirthdays(list))
      .catch(() => !cancelled && setBirthdays([]));
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  useEffect(() => {
    if (!supabase) return;
    const db = supabase;
    // Trocar a data rápido: só a última busca pode atualizar a tela
    let cancelled = false;
    setLoading(true);
    setLoadError('');

    (async () => {
      try {
        const [allAthletes, pseRes, psrRes, weightRes, sessionRes] = await Promise.all([
          fetchClubAthletes(clubId, reloadKey > 0),
          db.from('pse_records').select('*').eq('date', selectedDate),
          db.from('psr_records').select('*').eq('date', selectedDate),
          db.from('weight_records').select('*').eq('date', selectedDate),
          db.from('training_sessions').select('*').eq('date', selectedDate),
        ]);
        const failed = [pseRes, psrRes, weightRes].find((r) => r.error);
        if (failed?.error) throw failed.error;
        if (cancelled) return;

        const athletes = allAthletes.filter((a) => a.active) as Athlete[];
        const pseData: PseRecord[] = pseRes.data ?? [];
        const psrData: PsrRecord[] = psrRes.data ?? [];
        const weightData: WeightRecord[] = weightRes.data ?? [];

        setSessions(((sessionRes.data ?? []) as TrainingSession[]).sort((a, b) => a.start_time.localeCompare(b.start_time)));
        setStatuses(
          athletes.map((a) => ({
            athlete: a,
            pses: pseData
              .filter((p) => p.athlete_id === a.id)
              .sort((x, y) => (x.created_at ?? '').localeCompare(y.created_at ?? '')),
            psr: psrData.find((r) => r.athlete_id === a.id),
            weight: weightData.find((w) => w.athlete_id === a.id),
          }))
        );
      } catch (err) {
        console.error('Erro ao carregar dados do dia:', err);
        if (!cancelled) {
          // Sem dados não dá para dizer quem respondeu: não mostra a lista como "não respondeu"
          setStatuses([]);
          setSessions([]);
          setLoadError(`Não foi possível carregar os dados do dia. ${(err as Error)?.message ?? ''}`.trim());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDate, reloadKey, clubId]);

  // Carga (ACWR e monotonia) até o dia escolhido e notificações: só para a lista de atenção,
  // então chegam depois sem segurar a tabela
  useEffect(() => {
    if (!supabase) return;
    const db = supabase;
    let cancelled = false;
    fetchRange<PseRecord>('pse_records', addDaysISO(selectedDate, -55), selectedDate)
      .then((rows) => {
        if (cancelled) return;
        const perAthlete = dailyLoads(rows);
        const weekStart = addDaysISO(selectedDate, -6);
        const weekCount = new Map<string, number>();
        for (const r of rows) {
          if (r.date >= weekStart && sessionLoad(r) !== null) weekCount.set(r.athlete_id, (weekCount.get(r.athlete_id) ?? 0) + 1);
        }
        const out = new Map<string, LoadMetrics>();
        for (const [id, daily] of perAthlete) out.set(id, loadMetrics(daily, selectedDate, weekCount.get(id) ?? 0));
        setLoads(out);
      })
      .catch(() => !cancelled && setLoads(new Map()));
    db.rpc('coach_push_status').then(({ data, error }) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      if (!error) for (const r of (data ?? []) as PushRow[]) {
        const p = pushProblem(r);
        if (p) map.set(r.athlete_id, p);
      }
      setPush(map);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDate, reloadKey]);

  // Filtro por grupos e/ou atletas específicos (vazio = todos)
  const selected = useMemo(() => resolveSelection(selection, groups), [selection, groups]);
  const shownBase = useMemo(() => (selected ? statuses.filter((st) => selected.has(st.athlete.id)) : statuses), [statuses, selected]);
  const nameOf = useCallback((id: string) => statuses.find((s) => s.athlete.id === id)?.athlete.nome ?? 'Atleta', [statuses]);

  // Motivos de atenção de cada atleta
  const today = todayISO();
  const now = nowTimeHM();
  const withReasons = useMemo(
    () =>
      shownBase.map((st) => {
        const mine = sessions.filter((s) => sessionAppliesTo(s, st.athlete.id, groups));
        const pending = pendingForDay({ date: selectedDate, today, now, sessions: mine, pse: st.pses, psr: st.psr });
        const reasons = attentionReasons({ load: loads.get(st.athlete.id), pse: st.pses, psr: st.psr, pending, push: push.get(st.athlete.id) });
        return { ...st, reasons, level: attentionLevel(reasons), pending: pending.psr || pending.sessions.length > 0 };
      }),
    // now muda a cada minuto; recalcular ao trocar dados basta
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shownBase, sessions, groups, loads, push, selectedDate]
  );

  // Quem precisa de atenção primeiro (mais grave em cima), depois por nome
  const sorted = useMemo(
    () => [...withReasons].sort((a, b) => b.level - a.level || a.athlete.nome.localeCompare(b.athlete.nome, 'pt-BR')),
    [withReasons]
  );
  const attention = sorted.filter((s) => s.level > 0);
  const shown = onlyAttention ? attention : sorted;
  // A lista mostra o que é grave ou pede acompanhamento (nível 2 e 3); os avisos leves
  // (sem resposta, notificação, não treinou, esforço máximo) viram uma linha de resumo
  const serious = attention.filter((s) => s.level >= 2);
  const light = attention.filter((s) => s.level === 1);
  const lightCount = (kind: AttentionReason['kind']) => light.filter((s) => s.reasons.some((r) => r.kind === kind)).length;
  const lightSummary = (
    [
      ['sem_resposta', 'sem resposta'],
      ['notificacao', 'com notificação parada'],
      ['nao_treinou', 'não treinaram'],
      ['esforco', 'com esforço máximo'],
    ] as const
  )
    .map(([kind, text]) => [lightCount(kind), text] as const)
    .filter(([n]) => n > 0)
    .map(([n, text]) => `${n} ${text}`)
    .join(' • ');

  // Treinos do dia: PSE esperada × média do que os atletas responderam
  const sessionSummary = useMemo(
    () =>
      sessions.map((s) => {
        const people = shownBase.filter((st) => sessionAppliesTo(s, st.athlete.id, groups));
        const scores: number[] = [];
        let answered = 0;
        for (const st of people) {
          const mine = sessions.filter((x) => sessionAppliesTo(x, st.athlete.id, groups));
          const rec = matchPseToSessions(mine, st.pses).get(s.id);
          if (!rec) continue;
          answered++;
          if (!rec.did_not_train && rec.rpe_score) scores.push(rec.rpe_score);
        }
        const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        return { s, total: people.length, answered, avg };
      }),
    [sessions, shownBase, groups]
  );

  // Contadores
  const totalAthletes = shownBase.length;
  const pseAnswered = shownBase.filter((s) => s.pses.length > 0).length;
  const pseTotal = shownBase.reduce((sum, s) => sum + s.pses.length, 0);
  const psrAnswered = shownBase.filter((s) => s.psr).length;
  const weightAnswered = shownBase.filter((s) => s.weight).length;
  const pendingCount = withReasons.filter((s) => s.pending).length;

  const validPseScores = shownBase.flatMap((s) => s.pses.filter((p) => p.rpe_score !== null).map((p) => p.rpe_score!));
  const avgPse = validPseScores.length > 0 ? (validPseScores.reduce((a, b) => a + b, 0) / validPseScores.length).toFixed(1) : '—';
  const validPsrScores = shownBase.filter((s) => s.psr).map((s) => s.psr!.psr_score);
  const avgPsr = validPsrScores.length > 0 ? (validPsrScores.reduce((a, b) => a + b, 0) / validPsrScores.length).toFixed(1) : '—';

  const birthdayPeople = birthdays.filter((b) => isBirthday(b.birth_date, selectedDate));
  const attentionList = showLight ? attention : serious;
  const attentionVisible = showAllAttention ? attentionList : attentionList.slice(0, 6);

  const nameButton = (athlete: Athlete, cls: string) =>
    onOpenProfile ? (
      <button type="button" onClick={() => onOpenProfile(athlete.id)} className={`${cls} text-left hover:text-sky-300 hover:underline`} title="Abrir a ficha do atleta">
        {athlete.nome}
      </button>
    ) : (
      <p className={cls}>{athlete.nome}</p>
    );

  return (
    <div className="space-y-5">
      {/* Data e atletas */}
      <div data-tour="daily-filters" className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-3 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
        <div className="flex flex-wrap items-end gap-3">
          <Calendar className="w-5 h-5 text-sky-400 mb-2" />
          <label className="block">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Dia</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
            />
          </label>
          {selectedDate !== today && (
            <button type="button" onClick={() => setSelectedDate(today)} className="px-3 py-2 rounded-lg text-xs font-bold border bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800">
              Hoje
            </button>
          )}
          <GroupFilter
            groups={groups}
            athletes={statuses.map((st) => ({ id: st.athlete.id, nome: st.athlete.nome }))}
            value={selection}
            onChange={setSelection}
            className="flex-1 sm:w-64 sm:flex-none"
          />
        </div>
        <button
          type="button"
          onClick={loadDailyData}
          disabled={loading}
          title="Buscar as respostas mais recentes"
          aria-label="Atualizar dados"
          className="self-end p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Aniversariantes do dia */}
      {birthdayPeople.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-pink-500/30 bg-gradient-to-r from-pink-500/15 via-fuchsia-500/10 to-amber-400/10 p-4">
          <Cake className="w-5 h-5 text-pink-300 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-pink-200/90">Aniversariantes de {brDate(selectedDate)}</p>
            <p className="text-sm text-white font-semibold mt-1">
              {birthdayPeople
                .map((b) => {
                  const idade = ageOn(b.birth_date, selectedDate);
                  return idade !== null ? `${b.nome} (${idade} anos)` : b.nome;
                })
                .join(' • ')}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Mande um parabéns para a equipe! 🎉</p>
          </div>
        </div>
      )}

      {loadError ? (
        <div className="py-12 px-4 flex flex-col items-center justify-center gap-3 text-center bg-slate-900/80 border border-slate-800 rounded-2xl">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <p className="text-sm text-red-300">{loadError}</p>
          <button type="button" onClick={loadDailyData} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold">
            Tentar de novo
          </button>
        </div>
      ) : loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-900/80 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <p className="text-sm">Carregando dados do dia...</p>
        </div>
      ) : (
        <>
          {/* Precisa de atenção */}
          <section data-tour="daily-attention" className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
              <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                <Siren className={`w-4 h-4 ${attention.some((a) => a.level === 3) ? 'text-red-400' : 'text-amber-400'}`} />
                Precisa de atenção
                <span className="text-xs font-semibold text-slate-400">{attentionList.length ? `• ${attentionList.length}` : ''}</span>
              </h3>
              <span className="text-[11px] text-slate-500 hidden sm:block">Carga e bem-estar, do mais grave para o mais leve</span>
            </header>
            {attentionList.length === 0 ? (
              <p className="px-4 py-5 text-sm text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> {attention.length ? 'Nada grave neste dia.' : 'Ninguém precisa de atenção neste dia.'}
              </p>
            ) : (
              <>
                <ul className="divide-y divide-slate-800/60">
                  {attentionVisible.map(({ athlete, reasons }) => (
                    <li key={athlete.id} className="px-4 py-3 flex items-center gap-3">
                      <Avatar name={athlete.nome} src={athlete.photo_url} className="w-9 h-9" textClassName="text-[11px]" />
                      <div className="min-w-0 flex-1">
                        {nameButton(athlete, 'font-bold text-white text-sm leading-tight')}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {reasons.map((r) => (
                            <ReasonChip key={r.kind} r={r} />
                          ))}
                        </div>
                        {reasons
                          .filter((r) => r.kind === 'nao_treinou' || r.kind === 'sem_resposta')
                          .map((r) => r.detail && (
                            <p key={r.kind} className="text-[11px] text-slate-500 mt-1 truncate">
                              {r.kind === 'sem_resposta' ? `Falta: ${r.detail}` : `Motivo: ${r.detail}`}
                            </p>
                          ))}
                      </div>
                      {reasons.some((r) => r.kind === 'notificacao') && onOpenNotifications && (
                        <button type="button" onClick={onOpenNotifications} className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 flex-shrink-0">
                          <BellOff className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Notificações</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {attentionList.length > attentionVisible.length && (
                  <button type="button" onClick={() => setShowAllAttention(true)} className="w-full py-2.5 text-xs font-bold text-sky-400 hover:text-sky-300 border-t border-slate-800">
                    Mostrar todos ({attentionList.length})
                  </button>
                )}
              </>
            )}
            {/* Avisos leves: resumo numa linha (abre a lista completa) */}
            {light.length > 0 && (
              <button
                type="button"
                onClick={() => setShowLight(!showLight)}
                aria-expanded={showLight}
                className="w-full px-4 py-2.5 border-t border-slate-800 text-left text-xs text-slate-400 hover:text-white flex items-center gap-2"
              >
                <BellOff className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">
                  {showLight ? 'Esconder os avisos leves' : <>Também: {lightSummary}</>}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 ml-auto flex-shrink-0 transition-transform ${showLight ? 'rotate-180' : ''}`} />
              </button>
            )}
          </section>

          {/* Treinos do dia: planejado × percebido */}
          {sessionSummary.length > 0 && (
            <section data-tour="daily-sessions" className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
                <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-sky-400" /> Treinos do dia
                </h3>
                <span className="text-[11px] text-slate-500">PSE esperada × média dos atletas</span>
              </header>
              <ul className="divide-y divide-slate-800/60">
                {sessionSummary.map(({ s, total, answered, avg }) => {
                  const diff = avg === null ? null : avg - s.expected_pse;
                  const tone =
                    diff === null ? 'bg-slate-800 text-slate-400 border-slate-700' : diff >= 1 ? 'bg-orange-500/15 text-orange-300 border-orange-500/40' : diff <= -1 ? 'bg-sky-500/15 text-sky-300 border-sky-500/40' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
                  const verdict = diff === null ? 'Sem respostas' : diff >= 1 ? 'Acima do planejado' : diff <= -1 ? 'Abaixo do planejado' : 'Como planejado';
                  return (
                    <li key={s.id} className="px-4 py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1.5">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{s.name || s.training_type}</p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {hm(s.start_time)}
                          {s.end_time ? `–${hm(s.end_time)}` : ''} • {s.training_type}
                        </p>
                      </div>
                      <div className="text-right sm:text-left text-xs text-slate-300 tabular-nums">
                        Esperada <strong className="text-white">{s.expected_pse}</strong> • Média{' '}
                        <strong className="text-white">{avg === null ? '—' : avg.toFixed(1).replace('.', ',')}</strong>
                        <span className="block text-[11px] text-slate-500">
                          {answered}/{total} respostas
                        </span>
                      </div>
                      <span className={`col-span-2 sm:col-span-1 justify-self-start sm:justify-self-end text-[11px] font-bold px-2 py-0.5 rounded-md border ${tone}`}>{verdict}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Resumo rápido */}
          <div data-tour="daily-cards" className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Kpi title="Questionários PSE" value={pseAnswered} of={totalAthletes}>
              <span className="text-orange-400 flex items-center gap-1">
                <Flame className="w-3 h-3" /> Média PSE: {avgPse}
                {pseTotal > pseAnswered && <span className="text-slate-500 font-normal">({pseTotal} respostas)</span>}
              </span>
            </Kpi>
            <Kpi title="Questionários PSR" value={psrAnswered} of={totalAthletes}>
              <span className="text-emerald-400 flex items-center gap-1">
                <HeartPulse className="w-3 h-3" /> Média PSR: {avgPsr}
              </span>
            </Kpi>
            <Kpi title="Pesagens" value={weightAnswered} of={totalAthletes}>
              <span className="text-sky-400 flex items-center gap-1">
                <Scale className="w-3 h-3" /> Balança
              </span>
            </Kpi>
            <Kpi title="Sem resposta" value={pendingCount} of={totalAthletes} alert={pendingCount > 0}>
              <span className={`${pendingCount ? 'text-red-300' : 'text-slate-400'} flex items-center gap-1`}>
                <BellOff className="w-3 h-3" /> {pendingCount ? 'falta PSR ou PSE' : 'todos em dia'}
              </span>
            </Kpi>
          </div>

          {/* Tabela: quem precisa de atenção primeiro */}
          <div data-tour="daily-table" className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-white text-sm sm:text-base">Acompanhamento individual</h3>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} className="accent-sky-500" />
                Só quem precisa de atenção
                <span className="text-slate-500">({onlyAttention ? attention.length : shown.length})</span>
              </label>
            </div>

            {shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">{onlyAttention ? 'Ninguém precisa de atenção neste dia.' : 'Nenhum atleta nesta seleção.'}</p>
            ) : (
              <>
                {/* Celular: um card por atleta */}
                <ul className="md:hidden divide-y divide-slate-800/60">
                  {shown.map(({ athlete, pses, psr, weight, reasons }) => {
                    const tone = (v: number, hi: number, mid: number) =>
                      v >= hi ? 'bg-red-500/20 text-red-300 border-red-500/40' : v >= mid ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                    return (
                      <li key={athlete.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <Avatar name={athlete.nome} src={athlete.photo_url} className="w-11 h-11" textClassName="text-xs" />
                            <div className="min-w-0">
                              {nameButton(athlete, 'font-bold text-white leading-tight break-words')}
                              <p className="text-xs text-slate-400 mt-0.5 break-words">
                                Classe {athlete.classe || 'A'} • {athlete.categoria}
                              </p>
                            </div>
                          </div>
                          {onEditAthlete && (
                            <button
                              type="button"
                              onClick={() => onEditAthlete(athlete)}
                              className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex-shrink-0"
                              title="Editar este atleta"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="min-w-0 bg-slate-950/60 border border-slate-800 rounded-xl p-2">
                            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">PSE</p>
                            {pses.length === 0 ? (
                              <span className="text-slate-500 italic">Pendente</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {pses.map((p) =>
                                  p.did_not_train ? (
                                    <span key={p.id} className="px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-800 font-semibold">Não treinou</span>
                                  ) : (
                                    <span key={p.id} title={p.training_type} className={`px-1.5 py-0.5 rounded border font-bold ${tone(p.rpe_score || 0, 8, 5)}`}>{p.rpe_score}</span>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 bg-slate-950/60 border border-slate-800 rounded-xl p-2">
                            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">PSR</p>
                            {psr ? (
                              <span className={`px-1.5 py-0.5 rounded border font-bold ${tone(11 - psr.psr_score, 8, 5)}`}>{psr.psr_score}</span>
                            ) : (
                              <span className="text-slate-500 italic">Pendente</span>
                            )}
                          </div>
                          <div className="min-w-0 bg-slate-950/60 border border-slate-800 rounded-xl p-2">
                            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Peso</p>
                            {weight ? <span className="text-sky-400 font-bold">{weight.weight} kg</span> : <span className="text-slate-500 italic">Pendente</span>}
                          </div>
                        </div>
                        {psr && (
                          <p className="text-[11px] text-slate-400">
                            Dor {psr.muscle_soreness_score} • Sono {psr.sleep_score} • Fadiga {psr.fatigue_score} • Estresse {psr.stress_score} • Humor {psr.mood_score}
                          </p>
                        )}
                        {pses.some((p) => p.training_type) && (
                          <p className="text-[11px] text-slate-400 break-words">
                            {pses.map((p) => `${p.training_type || 'Treino'}${p.did_not_train ? ' (não treinou)' : `: ${p.rpe_score}${loadText(p) ? ` (${loadText(p)})` : ''}`}`).join(' • ')}
                          </p>
                        )}
                        {reasons.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {reasons.map((r) => (
                              <ReasonChip key={r.kind} r={r} />
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950/80 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Atleta</th>
                        <th className="py-3 px-3">PSE (Esforço) • Tipo de Treino</th>
                        <th className="py-3 px-3">PSR (Bem-Estar)</th>
                        <th className="py-3 px-3">Peso</th>
                        <th className="py-3 px-4">Atenção</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {shown.map(({ athlete, pses, psr, weight, reasons }) => (
                        <tr key={athlete.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar name={athlete.nome} src={athlete.photo_url} className="w-10 h-10" textClassName="text-xs" />
                                <div className="min-w-0">
                                  {nameButton(athlete, 'font-bold text-white leading-tight')}
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    Classe {athlete.classe || 'A'} • {athlete.categoria}
                                  </p>
                                </div>
                              </div>
                              {onEditAthlete && (
                                <button
                                  type="button"
                                  onClick={() => onEditAthlete(athlete)}
                                  className="p-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 flex-shrink-0"
                                  title="Editar este atleta"
                                  aria-label={`Editar ${athlete.nome}`}
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* PSE: todas as respostas do atleta no dia */}
                          <td className="py-3 px-3">
                            {pses.length === 0 ? (
                              <span className="text-xs text-slate-500 italic">Pendente</span>
                            ) : (
                              <ul className="space-y-1.5">
                                {pses.map((p) => (
                                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                                    {p.did_not_train ? (
                                      <span className="text-xs px-2 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-800 font-semibold">Não Treinou</span>
                                    ) : (
                                      <span
                                        className={`text-xs px-2.5 py-1 rounded-lg border font-bold whitespace-nowrap ${
                                          (p.rpe_score || 0) >= 8
                                            ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                            : (p.rpe_score || 0) >= 5
                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        }`}
                                      >
                                        PSE: {p.rpe_score} / 10
                                      </span>
                                    )}
                                    <span className="text-xs font-medium text-slate-200">{p.training_type || (p.did_not_train ? '' : '—')}</span>
                                    {loadText(p) && <span className="text-[10px] text-sky-300/80">{loadText(p)}</span>}
                                    {p.created_at && <span className="text-[10px] text-slate-500">{stampInAppZone(p.created_at)[1]}</span>}
                                  </li>
                                ))}
                              </ul>
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
                            {weight ? <span className="text-sky-400 font-bold">{weight.weight} kg</span> : <span className="text-slate-500 italic">Pendente</span>}
                          </td>

                          {/* Motivos de atenção */}
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {reasons.map((r) => (
                                <ReasonChip key={r.kind} r={r} />
                              ))}
                              {reasons.length === 0 && (pses.length > 0 || psr) && (
                                <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Normal
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Detalhes do dia (PSE acima de 6 com observações, motivos de quem não treinou, PSR abaixo de 5 por variável) */}
          <section data-tour="daily-details" className="space-y-4">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              aria-expanded={showDetails}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-sm font-bold text-slate-200 hover:text-white"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Detalhes do dia
              <span className="text-xs font-normal text-slate-500 truncate">• PSE acima de 6, quem não treinou e PSR abaixo de 5</span>
              <ChevronDown className={`w-4 h-4 ml-auto flex-shrink-0 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            </button>
            {showDetails && <DayAlerts day={selectedDate} selected={selected} nameOf={nameOf} reloadSignal={reloadKey} />}
          </section>
        </>
      )}
    </div>
  );
};

const Kpi: React.FC<{ title: string; value: number; of: number; alert?: boolean; children: React.ReactNode }> = ({ title, value, of, alert, children }) => (
  <div className={`bg-slate-900/90 border p-4 rounded-2xl space-y-1 ${alert ? 'border-red-500/40' : 'border-slate-800'}`}>
    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">{title}</span>
    <div className="flex items-baseline gap-1.5">
      <span className={`text-2xl font-black ${alert ? 'text-red-300' : 'text-white'}`}>{value}</span>
      <span className="text-xs text-slate-400 font-medium">/ {of}</span>
    </div>
    <span className="text-[11px] font-semibold block truncate">{children}</span>
  </div>
);
