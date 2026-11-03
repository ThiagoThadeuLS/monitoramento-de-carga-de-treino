import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CalendarDays, CheckCircle2, ChevronRight, Clock, Loader2,
  MapPin, Pencil, Plus, Scale, Search, ShieldCheck, Trash2, Trophy, UsersRound, X,
} from 'lucide-react';
import { Competition } from '../../types';
import { AthleteGroup, AthleteRef, listActiveAthletes, listGroups } from '../../lib/groups';
import {
  CompetitionSummaryRow, competitionAppliesTo, competitionAudienceLabel, deleteCompetition,
  getCompetitionSummary, listCompetitions, saveCompetition,
} from '../../lib/competitions';
import { addDaysISO, todayLocalISO } from '../../lib/date';
import {
  WEIGHT_STATUS_LABEL, WeightPlan, WeightPlanStatus, buildWeightPlan, daysBetweenISO, parseCategoryWeight,
} from '../../lib/weightPlan';

interface CompetitionForm {
  id?: string;
  nome: string;
  data: string;
  data_pesagem: string;
  hora_pesagem: string;
  local: string;
  observacoes: string;
  audience: 'todos' | 'incluir' | 'exceto';
  group_ids: string[];
  athlete_ids: string[];
}

const AUDIENCE_OPTIONS: { id: CompetitionForm['audience']; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'incluir', label: 'Somente' },
  { id: 'exceto', label: 'Todos exceto' },
];

const STATUS_CLASS: Record<WeightPlanStatus, string> = {
  risco: 'bg-red-500/15 text-red-300 border-red-500/40',
  atencao: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  seguro: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  no_alvo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  sem_dados: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
  sem_categoria: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  sem_limite: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
};

const STATUS_ORDER: Record<WeightPlanStatus, number> = {
  risco: 0,
  atencao: 1,
  sem_dados: 2,
  sem_categoria: 3,
  seguro: 4,
  no_alvo: 5,
  sem_limite: 6,
};

const kg = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value.toFixed(1).replace('.', ',')} kg`;

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

const weekdayDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });

const hhmm = (time?: string | null) => (time ? time.slice(0, 5) : '');

const emptyForm = (today: string): CompetitionForm => ({
  nome: '',
  data: addDaysISO(today, 14),
  data_pesagem: addDaysISO(today, 13),
  hora_pesagem: '',
  local: '',
  observacoes: '',
  audience: 'todos',
  group_ids: [],
  athlete_ids: [],
});

/** Aba Competições: cadastro e acompanhamento seguro de peso por competição. */
export const CompetitionManagement: React.FC = () => {
  const today = todayLocalISO();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [groups, setGroups] = useState<AthleteGroup[]>([]);
  const [athletes, setAthletes] = useState<AthleteRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState<CompetitionForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [athleteSearch, setAthleteSearch] = useState('');
  const [viewing, setViewing] = useState<Competition | null>(null);
  const [summary, setSummary] = useState<CompetitionSummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [c, g, a] = await Promise.all([listCompetitions(), listGroups(), listActiveAthletes()]);
      setCompetitions(c);
      setGroups(g);
      setAthletes(a);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!viewing) {
      setSummary([]);
      setSummaryError('');
      return;
    }
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError('');
    getCompetitionSummary(viewing.id)
      .then((rows) => !cancelled && setSummary(rows))
      .catch((err) => !cancelled && setSummaryError(err.message))
      .finally(() => !cancelled && setSummaryLoading(false));
    return () => {
      cancelled = true;
    };
  }, [viewing?.id]);

  const flash = (text: string) => {
    setFeedback(text);
    setTimeout(() => setFeedback(''), 4000);
  };

  const nameOf = useMemo(() => new Map(athletes.map((a) => [a.id, a.nome])), [athletes]);

  const upcoming = useMemo(
    () => competitions.filter((c) => c.data >= today).sort((a, b) => a.data_pesagem.localeCompare(b.data_pesagem)),
    [competitions, today]
  );
  const past = useMemo(
    () => competitions.filter((c) => c.data < today).sort((a, b) => b.data.localeCompare(a.data)),
    [competitions, today]
  );

  const targetedAthletes = (competition: Competition) =>
    athletes.filter((a) => competitionAppliesTo(competition, a.id, groups));

  const openNew = () => {
    setFormError('');
    setAthleteSearch('');
    setForm(emptyForm(today));
  };

  const openEdit = (competition: Competition) => {
    setFormError('');
    setAthleteSearch('');
    setForm({
      id: competition.id,
      nome: competition.nome,
      data: competition.data,
      data_pesagem: competition.data_pesagem,
      hora_pesagem: hhmm(competition.hora_pesagem),
      local: competition.local ?? '',
      observacoes: competition.observacoes ?? '',
      audience: competition.audience ?? 'todos',
      group_ids: competition.target_group_ids ?? [],
      athlete_ids: competition.target_athlete_ids ?? [],
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.nome.trim()) return setFormError('Dê um nome à competição.');
    if (!form.data || !form.data_pesagem) return setFormError('Informe a data da competição e a data da pesagem.');
    if (form.data_pesagem > form.data) return setFormError('A pesagem precisa acontecer até a data da competição.');
    if (form.audience !== 'todos' && form.group_ids.length + form.athlete_ids.length === 0)
      return setFormError('Escolha pelo menos um grupo ou atleta para a competição.');

    setSaving(true);
    setFormError('');
    try {
      await saveCompetition({
        id: form.id,
        nome: form.nome,
        data: form.data,
        data_pesagem: form.data_pesagem,
        hora_pesagem: form.hora_pesagem || null,
        local: form.local,
        observacoes: form.observacoes,
        audience: form.audience,
        target_group_ids: form.audience === 'todos' ? [] : form.group_ids,
        target_athlete_ids: form.audience === 'todos' ? [] : form.athlete_ids,
      });
      const wasEditing = !!form.id;
      setForm(null);
      flash(wasEditing ? `Competição "${form.nome.trim()}" atualizada.` : `Competição "${form.nome.trim()}" criada.`);
      await load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (competition: Competition) => {
    if (!window.confirm(`Excluir a competição "${competition.nome}"? Os registros de peso dos atletas continuam salvos.`)) return;
    try {
      await deleteCompetition(competition.id);
      if (viewing?.id === competition.id) setViewing(null);
      setForm(null);
      flash(`Competição "${competition.nome}" excluída.`);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const planFor = (row: CompetitionSummaryRow): WeightPlan =>
    buildWeightPlan({
      currentWeight: row.peso_atual,
      currentDate: row.peso_data,
      targetWeight: parseCategoryWeight(row.categoria),
      category: row.categoria,
      weighInDate: viewing?.data_pesagem ?? today,
      today,
    });

  const summaryRows = useMemo(
    () =>
      [...summary]
        .map((row) => ({ row, plan: planFor(row) }))
        .sort((a, b) => STATUS_ORDER[a.plan.status] - STATUS_ORDER[b.plan.status] || a.row.nome.localeCompare(b.row.nome)),
    [summary, viewing?.data_pesagem, today]
  );

  const riskCount = summaryRows.filter(({ plan }) => plan.status === 'risco').length;
  const attentionCount = summaryRows.filter(({ plan }) => plan.status === 'atencao').length;

  const competitionCard = (competition: Competition, isPast = false) => {
    const targeted = targetedAthletes(competition);
    const days = daysBetweenISO(today, competition.data_pesagem);
    return (
      <article key={competition.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              {isPast ? (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                  Encerrada
                </span>
              ) : (
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${
                  days <= 7 ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                }`}>
                  {days < 0 ? 'Pesagem realizada' : days === 0 ? 'Pesagem hoje' : `Pesagem em ${days} dia${days === 1 ? '' : 's'}`}
                </span>
              )}
            </div>
            <h3 className="font-bold text-white break-words">{competition.nome}</h3>
            <p className="text-xs text-slate-400 capitalize">{weekdayDate(competition.data)} • {longDate(competition.data)}</p>
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
              <CalendarDays className="w-3.5 h-3.5 text-violet-300" />
              Pesagem {shortDate(competition.data_pesagem)}
              {competition.hora_pesagem && ` às ${hhmm(competition.hora_pesagem)}`}
            </p>
            {competition.local && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate">{competition.local}</span>
              </p>
            )}
            <p className="text-xs text-violet-300 flex items-start gap-1 mt-1.5">
              <UsersRound className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span className="break-words">
                {targeted.length} atleta{targeted.length === 1 ? '' : 's'} • {competitionAudienceLabel(competition, groups, athletes)}
              </span>
            </p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => openEdit(competition)}
              className="p-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30"
              title="Editar competição"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(competition)}
              className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 border border-red-500/20"
              title="Excluir competição"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setViewing(competition)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
        >
          <Scale className="w-3.5 h-3.5" /> Ver peso dos atletas
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </article>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-white flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-300" /> Competições
          </p>
          <p className="text-xs text-slate-400">
            Cadastre as competições, escolha os grupos ou atletas e acompanhe o peso de luta. O atleta vê o alerta na aba Peso.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" /> Nova competição
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl border bg-emerald-950/60 border-emerald-600 text-emerald-300 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {feedback}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <p className="text-sm">Carregando competições...</p>
        </div>
      ) : competitions.length === 0 ? (
        <div className="py-14 text-center text-slate-400 space-y-1 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Trophy className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">Nenhuma competição cadastrada</p>
          <p className="text-xs">Crie a primeira e escolha os grupos que vão competir.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {upcoming.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Próximas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {upcoming.map((c) => competitionCard(c))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Anteriores</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {past.map((c) => competitionCard(c, true))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Detalhe: atletas da competição e status do peso */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setViewing(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Competição ${viewing.nome}`}
            className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-400 capitalize flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" /> {weekdayDate(viewing.data)} • {longDate(viewing.data)}
                </p>
                <h3 className="text-lg font-bold text-white break-words">{viewing.nome}</h3>
                <p className="text-xs text-violet-300 mt-1">
                  Pesagem {shortDate(viewing.data_pesagem)}
                  {viewing.hora_pesagem && ` às ${hhmm(viewing.hora_pesagem)}`}
                  {viewing.local && ` • ${viewing.local}`}
                </p>
              </div>
              <button type="button" onClick={() => setViewing(null)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white flex-shrink-0" title="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-300">
                  {summary.length} atleta{summary.length === 1 ? '' : 's'}
                </span>
                {riskCount > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 font-bold">
                    {riskCount} em risco
                  </span>
                )}
                {attentionCount > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold">
                    {attentionCount} em atenção
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-violet-300">
                  {competitionAudienceLabel(viewing, groups, athletes)}
                </span>
              </div>

              {viewing.observacoes && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Observações</p>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{viewing.observacoes}</p>
                </div>
              )}

              {summaryError ? (
                <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" /> <span>{summaryError}</span>
                </div>
              ) : summaryLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                </div>
              ) : summaryRows.length === 0 ? (
                <div className="py-10 text-center text-slate-400 space-y-1">
                  <UsersRound className="w-7 h-7 mx-auto text-slate-600" />
                  <p className="text-sm font-semibold text-slate-300">Nenhum atleta neste público</p>
                  <p className="text-xs">Confira os grupos e atletas escolhidos para a competição.</p>
                </div>
              ) : (
                <>
                  {/* Celular */}
                  <div className="sm:hidden space-y-2">
                    {summaryRows.map(({ row, plan }) => (
                      <article key={row.athlete_id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white break-words">{row.nome}</p>
                            <p className="text-[11px] text-slate-400">
                              {row.categoria || 'Sem categoria'}{row.classe ? ` • ${row.classe}` : ''}
                            </p>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold flex-shrink-0 ${STATUS_CLASS[plan.status]}`}>
                            {WEIGHT_STATUS_LABEL[plan.status]}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-500">Atual</p>
                            <p className="font-bold text-white">{kg(plan.current)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-500">Meta</p>
                            <p className="font-bold text-sky-300">{kg(plan.target)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-500">Falta</p>
                            <p className={`font-bold ${plan.gap !== null && plan.gap > 0 ? 'text-amber-300' : plan.gap !== null ? 'text-emerald-300' : 'text-slate-400'}`}>
                              {plan.gap !== null ? (plan.gap > 0.05 ? kg(plan.gap) : 'No alvo') : '—'}
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {plan.current
                            ? `Faixa segura na pesagem: ${kg(plan.safeMin)} a ${kg(plan.safeMax)}`
                            : 'Sem pesagem registrada.'}
                        </p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Última pesagem: {row.peso_data ? shortDate(row.peso_data) : 'nunca'}
                        </p>
                      </article>
                    ))}
                  </div>

                  {/* Desktop */}
                  <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase tracking-wider">
                        <tr>
                          <th className="text-left px-3 py-2.5">Atleta</th>
                          <th className="text-right px-3 py-2.5">Atual</th>
                          <th className="text-right px-3 py-2.5">Meta</th>
                          <th className="text-right px-3 py-2.5">Falta</th>
                          <th className="text-left px-3 py-2.5">Faixa segura</th>
                          <th className="text-left px-3 py-2.5">Última pesagem</th>
                          <th className="text-right px-3 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {summaryRows.map(({ row, plan }) => (
                          <tr key={row.athlete_id} className="hover:bg-slate-800/40">
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-white">{row.nome}</p>
                              <p className="text-[11px] text-slate-400">
                                {row.categoria || 'Sem categoria'}{row.classe ? ` • ${row.classe}` : ''}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-white">{kg(plan.current)}</td>
                            <td className="px-3 py-2.5 text-right text-sky-300 font-semibold">{kg(plan.target)}</td>
                            <td className={`px-3 py-2.5 text-right font-semibold ${plan.gap !== null && plan.gap > 0 ? 'text-amber-300' : plan.gap !== null ? 'text-emerald-300' : 'text-slate-400'}`}>
                              {plan.gap !== null ? (plan.gap > 0.05 ? kg(plan.gap) : 'No alvo') : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-slate-300">
                              {plan.current ? `${kg(plan.safeMin)} a ${kg(plan.safeMax)}` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-slate-400">{row.peso_data ? shortDate(row.peso_data) : 'nunca'}</td>
                            <td className="px-3 py-2.5 text-right">
                              <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${STATUS_CLASS[plan.status]}`}>
                                {WEIGHT_STATUS_LABEL[plan.status]}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-2 text-[11px] text-slate-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <p>
                      A faixa segura considera uma perda de 0,5% a 1% do peso corporal por semana. Em <strong className="text-slate-300">risco</strong>,
                      converse com o atleta sobre categoria, prazo e acompanhamento com nutricionista ou médico.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setViewing(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  const competition = viewing;
                  setViewing(null);
                  openEdit(competition);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold"
              >
                <Pencil className="w-4 h-4" /> Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formulário: nova / editar competição */}
      {form && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{form.id ? 'Editar competição' : 'Nova competição'}</h3>
              <button type="button" onClick={() => setForm(null)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Nome da competição *</span>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="ex: Campeonato Brasileiro"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Data da competição *</span>
                  <input
                    type="date"
                    required
                    value={form.data}
                    onChange={(e) => setForm({ ...form, data: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Data da pesagem *</span>
                  <input
                    type="date"
                    required
                    value={form.data_pesagem}
                    onChange={(e) => setForm({ ...form, data_pesagem: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Hora da pesagem</span>
                  <input
                    type="time"
                    value={form.hora_pesagem}
                    onChange={(e) => setForm({ ...form, hora_pesagem: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Local</span>
                  <input
                    type="text"
                    maxLength={120}
                    value={form.local}
                    onChange={(e) => setForm({ ...form, local: e.target.value })}
                    placeholder="ex: Ginásio Municipal"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
              </div>

              {/* Para quem é a competição (mesmo modelo dos treinos) */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300">Para quem *</span>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Público da competição">
                  {AUDIENCE_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={form.audience === o.id}
                      onClick={() => setForm({ ...form, audience: o.id })}
                      className={`px-2 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                        form.audience === o.id
                          ? 'bg-violet-500 text-slate-950 border-violet-500'
                          : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {form.audience !== 'todos' && (
                  <div className="space-y-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <p className="text-[11px] text-slate-400">
                      {form.audience === 'incluir'
                        ? 'A competição aparece só para os grupos e atletas marcados.'
                        : 'A competição aparece para todos, menos os grupos e atletas marcados.'}
                    </p>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">Grupos</p>
                      {groups.length === 0 ? (
                        <p className="text-xs text-slate-500">Nenhum grupo criado. Crie em Gestão → Grupos.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {groups.map((g) => {
                            const on = form.group_ids.includes(g.id);
                            return (
                              <button
                                key={g.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() =>
                                  setForm({ ...form, group_ids: on ? form.group_ids.filter((x) => x !== g.id) : [...form.group_ids, g.id] })
                                }
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                                  on
                                    ? 'bg-violet-500/20 text-violet-200 border-violet-500/60'
                                    : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-white'
                                }`}
                              >
                                {on ? '✓ ' : ''}{g.nome} <span className="font-normal opacity-70">({g.members.filter((id) => nameOf.has(id)).length})</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">
                        Atletas específicos {form.athlete_ids.length > 0 && `(${form.athlete_ids.length})`}
                      </p>
                      <div className="relative mb-1.5">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          value={athleteSearch}
                          onChange={(e) => setAthleteSearch(e.target.value)}
                          placeholder="Buscar atleta..."
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                      <ul className="max-h-36 overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800/70">
                        {athletes
                          .filter((a) => a.nome.toLowerCase().includes(athleteSearch.trim().toLowerCase()))
                          .map((a) => {
                            const on = form.athlete_ids.includes(a.id);
                            return (
                              <li key={a.id}>
                                <label className={`flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer text-xs ${on ? 'bg-violet-500/10 text-white' : 'text-slate-300 hover:bg-slate-800/60'}`}>
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() =>
                                      setForm({ ...form, athlete_ids: on ? form.athlete_ids.filter((x) => x !== a.id) : [...form.athlete_ids, a.id] })
                                    }
                                    className="w-3.5 h-3.5 accent-violet-500"
                                  />
                                  {a.nome}
                                </label>
                              </li>
                            );
                          })}
                        {athletes.filter((a) => a.nome.toLowerCase().includes(athleteSearch.trim().toLowerCase())).length === 0 && (
                          <li className="px-3 py-3 text-xs text-slate-500">Nenhum atleta encontrado.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Observações</span>
                <textarea
                  rows={3}
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  placeholder="Informações da competição, horário de concentração, documentos..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
                />
              </label>

              {formError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-700 flex items-center gap-2.5 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" /> <span>{formError}</span>
                </div>
              )}

              <div className="pt-4 flex items-center gap-3 border-t border-slate-800">
                {form.id && (
                  <button
                    type="button"
                    onClick={() => {
                      const competition = competitions.find((c) => c.id === form.id);
                      if (competition) handleDelete(competition);
                    }}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 border border-red-500/30 text-sm font-semibold disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Excluir</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="ml-auto px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold shadow-lg shadow-sky-500/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
