import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Clock, Loader2, AlertCircle, X, Trash2, CalendarDays, StickyNote, CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { addDaysISO, scheduleWeekBounds, startOfWeekISO, todayLocalISO } from '../../lib/date';
import { TRAINING_TYPES } from '../../data/constants';
import { TrainingSession } from '../../types';

// Mesma escala de Foster da PSE do atleta
const FOSTER: Record<number, string> = {
  1: 'Muito, muito fácil', 2: 'Muito fácil', 3: 'Fácil', 4: 'Moderado', 5: 'Um pouco difícil',
  6: 'Difícil', 7: 'Muito difícil', 8: 'Muito, muito difícil', 9: 'Quase máximo', 10: 'Máximo absoluto',
};

const pseClass = (v: number) =>
  v >= 8
    ? 'bg-red-500/20 text-red-300 border-red-500/40'
    : v >= 5
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const weekdayName = (iso: string, style: 'short' | 'long') =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: style }).replace('.', '');

interface FormState {
  id?: string;
  date: string;
  start_time: string;
  end_time: string;
  name: string;
  training_type: string;
  expected_pse: number | null;
  notes: string;
}

const emptyForm = (date: string): FormState => ({
  date, start_time: '', end_time: '', name: '', training_type: TRAINING_TYPES[0], expected_pse: null, notes: '',
});

interface TrainingScheduleProps {
  /** Atleta: só visualiza (sem criar, editar ou excluir). */
  readOnly?: boolean;
  /** Busca alternativa (o atleta lê pelo token, não pela tabela). */
  fetchSessions?: (from: string, to: string) => Promise<TrainingSession[]>;
  /** Força a lista por dia mesmo em telas largas (área estreita do atleta). */
  listOnly?: boolean;
}

export const TrainingSchedule: React.FC<TrainingScheduleProps> = ({ readOnly = false, fetchSessions, listOnly = false }) => {
  const [weekStart, setWeekStart] = useState(() => startOfWeekISO(todayLocalISO()));
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const today = todayLocalISO();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)), [weekStart]);
  const weekEnd = days[6];
  const isCurrentWeek = weekStart === startOfWeekISO(today);
  const bounds = scheduleWeekBounds(today);
  const canGoBack = weekStart > bounds.minWeek;
  const canGoForward = weekStart < bounds.maxWeek;

  const friendlyError = (err: any) => {
    const msg = String(err?.message ?? err);
    if (msg.includes('fora_da_janela')) return 'Só é possível programar a semana atual e a próxima (a semana passada fica só para consulta).';
    if (err?.code === 'PGRST205' || msg.includes('training_sessions') || msg.includes('athlete_get_schedule') || err?.code === 'migracao_pendente')
      return 'O cronograma ainda não foi ativado no banco. Rode o arquivo supabase_cronograma.sql no Supabase.';
    return err?.code === 'sessao_invalida' ? msg : `Erro: ${msg}`;
  };

  const load = async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      if (fetchSessions) {
        setSessions(await fetchSessions(weekStart, weekEnd));
        return;
      }
      // Apaga treinos mais antigos que a semana passada (reforço caso o pg_cron não esteja ativo)
      await supabase.rpc('purge_old_training_sessions');
      const { data, error } = await supabase
        .from('training_sessions')
        .select('*')
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .order('date')
        .order('start_time');
      if (error) throw error;
      setSessions(data ?? []);
    } catch (err: any) {
      console.error('Erro ao carregar cronograma:', err);
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [weekStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, TrainingSession[]>(days.map((d) => [d, []]));
    for (const s of sessions) map.get(s.date)?.push(s);
    return map;
  }, [sessions, days]);

  const avgExpected = sessions.length
    ? (sessions.reduce((sum, s) => sum + s.expected_pse, 0) / sessions.length).toFixed(1).replace('.', ',')
    : '—';

  const showFeedback = (text: string) => {
    setFeedback(text);
    setTimeout(() => setFeedback(''), 4000);
  };

  const openNew = (date: string) => {
    setFormError('');
    setForm(emptyForm(date));
  };

  const openEdit = (s: TrainingSession) => {
    setFormError('');
    setForm({
      id: s.id,
      date: s.date,
      start_time: hhmm(s.start_time),
      end_time: hhmm(s.end_time),
      name: s.name,
      training_type: s.training_type,
      expected_pse: s.expected_pse,
      notes: s.notes ?? '',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !supabase) return;
    if (!form.date || !form.start_time) return setFormError('Informe a data e o horário de início.');
    if (form.date < bounds.minDate || form.date > bounds.maxDate)
      return setFormError('Escolha uma data entre a semana passada e o fim da próxima semana.');
    if (form.end_time && form.end_time <= form.start_time) return setFormError('O horário de fim precisa ser depois do início.');
    if (!form.name.trim()) return setFormError('Dê um nome ao treino.');
    if (!form.expected_pse) return setFormError('Escolha a PSE esperada (1 a 10).');

    const payload = {
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time || null,
      name: form.name.trim(),
      training_type: form.training_type,
      expected_pse: form.expected_pse,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    setFormError('');
    try {
      const { error } = form.id
        ? await supabase.from('training_sessions').update(payload).eq('id', form.id)
        : await supabase.from('training_sessions').insert([payload]);
      if (error) throw error;
      setForm(null);
      showFeedback(form.id ? `Treino "${payload.name}" atualizado.` : `Treino "${payload.name}" adicionado.`);
      // Se o treino foi para outra semana, acompanha a mudança
      const target = startOfWeekISO(payload.date);
      if (target !== weekStart) setWeekStart(target);
      else await load();
    } catch (err: any) {
      setFormError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!form?.id || !supabase) return;
    if (!window.confirm(`Excluir o treino "${form.name}" de ${dayMonth(form.date)}?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('training_sessions').delete().eq('id', form.id);
      if (error) throw error;
      setForm(null);
      showFeedback('Treino excluído.');
      await load();
    } catch (err: any) {
      setFormError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const sessionCard = (s: TrainingSession, compact = false) => (
    <button
      key={s.id}
      type="button"
      onClick={readOnly ? undefined : () => openEdit(s)}
      className={`w-full min-w-0 text-left bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1.5 transition-colors ${
        readOnly ? 'cursor-default' : 'hover:bg-slate-800/70 hover:border-slate-600'
      }`}
      title={readOnly ? undefined : 'Editar treino'}
    >
      {/* flex-wrap: em colunas estreitas a PSE desce para a linha de baixo em vez de vazar */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-xs font-semibold text-sky-300 flex items-center gap-1 whitespace-nowrap">
          <Clock className="w-3 h-3" />
          {hhmm(s.start_time)}
          {s.end_time && `–${hhmm(s.end_time)}`}
        </span>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-md border font-bold whitespace-nowrap ${pseClass(s.expected_pse)}`}
          title={`PSE esperada: ${FOSTER[s.expected_pse]}`}
        >
          PSE {s.expected_pse}
        </span>
      </div>
      <p className={`font-bold text-white leading-tight ${compact ? 'text-xs' : 'text-sm'} break-words`}>{s.name}</p>
      <p className="text-[11px] text-slate-400">{s.training_type}</p>
      {s.notes && (
        <p className="text-[11px] text-slate-500 flex gap-1 line-clamp-3 break-words">
          <StickyNote className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>{s.notes}</span>
        </p>
      )}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Navegação da semana */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
            disabled={!canGoBack}
            className="p-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
            title={canGoBack ? 'Semana anterior' : 'Só a semana passada fica guardada'}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 md:flex-none text-center md:min-w-[190px]">
            <p className="text-[10px] uppercase font-bold text-slate-400">
              {isCurrentWeek ? 'Esta semana' : weekStart < startOfWeekISO(today) ? 'Semana passada' : 'Próxima semana'}
            </p>
            <p className="text-sm font-bold text-white">
              {dayMonth(weekStart)} a {dayMonth(weekEnd)}/{weekEnd.slice(0, 4)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
            disabled={!canGoForward}
            className="p-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
            title={canGoForward ? 'Próxima semana' : 'Só é possível programar até a próxima semana'}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={() => setWeekStart(startOfWeekISO(today))}
              className="px-3 py-2 rounded-lg text-xs font-bold border bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800"
            >
              Esta semana
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400 md:ml-auto">
          <span>
            <strong className="text-white text-sm">{sessions.length}</strong> {sessions.length === 1 ? 'treino' : 'treinos'}
          </span>
          <span>
            PSE esperada média <strong className="text-white text-sm">{avgExpected}</strong>
          </span>
        </div>

        {!readOnly && (
        <button
          type="button"
          onClick={() => openNew(isCurrentWeek ? today : weekStart)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo treino
        </button>
        )}
      </div>

      {feedback && (
        <div className="p-3 rounded-xl border bg-emerald-950/60 border-emerald-600 text-emerald-300 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {feedback}
        </div>
      )}

      {error ? (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <p className="text-sm">Carregando cronograma...</p>
        </div>
      ) : (
        <>
          {/* Desktop: grade de 7 colunas */}
          <div className={listOnly ? 'hidden' : 'hidden lg:grid grid-cols-7 gap-2'}>
            {days.map((d) => {
              const isToday = d === today;
              return (
                <div
                  key={d}
                  className={`flex flex-col min-h-[260px] rounded-2xl border p-2 ${
                    isToday ? 'bg-sky-950/30 border-sky-700/60' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <div className="px-1 pb-2 mb-2 border-b border-slate-800">
                    <p className={`text-xs font-bold capitalize ${isToday ? 'text-sky-300' : 'text-slate-300'}`}>
                      {weekdayName(d, 'short')}
                    </p>
                    <p className="text-[11px] text-slate-500">{dayMonth(d)}{isToday && ' • hoje'}</p>
                  </div>
                  <div className="space-y-2 flex-1">
                    {byDay.get(d)!.map((s) => sessionCard(s, true))}
                  </div>
                  {!readOnly && (
                  <button
                    type="button"
                    onClick={() => openNew(d)}
                    className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-slate-700 text-slate-500 hover:text-sky-300 hover:border-sky-600 text-xs font-semibold transition-colors"
                    title={`Adicionar treino em ${dayMonth(d)}`}
                  >
                    <Plus className="w-3.5 h-3.5" /> Treino
                  </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Celular / tablet: lista por dia */}
          <div className={listOnly ? 'space-y-3' : 'lg:hidden space-y-3'}>
            {days.map((d) => {
              const isToday = d === today;
              const list = byDay.get(d)!;
              return (
                <section
                  key={d}
                  className={`rounded-2xl border p-3 ${isToday ? 'bg-sky-950/30 border-sky-700/60' : 'bg-slate-900/80 border-slate-800'}`}
                >
                  <header className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className={`w-4 h-4 ${isToday ? 'text-sky-300' : 'text-slate-500'}`} />
                      <p className="text-sm font-bold text-white capitalize">
                        {weekdayName(d, 'long')}{' '}
                        <span className="font-normal text-slate-400">{dayMonth(d)}</span>
                        {isToday && <span className="ml-1.5 text-[11px] text-sky-300 font-semibold">hoje</span>}
                      </p>
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => openNew(d)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/30 text-xs font-bold"
                      >
                        <Plus className="w-3.5 h-3.5" /> Treino
                      </button>
                    )}
                  </header>
                  {list.length === 0 ? (
                    <p className="text-xs text-slate-500 px-1">Sem treinos.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {list.map((s) => sessionCard(s))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* Modal: novo / editar treino */}
      {form && !readOnly && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{form.id ? 'Editar treino' : 'Novo treino'}</h3>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label className="block col-span-2 sm:col-span-1">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Data *</span>
                  <input
                    type="date"
                    required
                    min={bounds.minDate}
                    max={bounds.maxDate}
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Início *</span>
                  <input
                    type="time"
                    required
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Fim</span>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
              </div>

              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Nome do treino *</span>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="ex: Randori de pé – preparação para o estadual"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </label>

              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Tipo de treino *</span>
                <div className="grid grid-cols-3 gap-2">
                  {TRAINING_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={form.training_type === t}
                      onClick={() => setForm({ ...form, training_type: t })}
                      className={`px-2 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                        form.training_type === t
                          ? 'bg-sky-500 text-slate-950 border-sky-500'
                          : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {t.replace('Treino ', '')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">PSE esperada *</span>
                  <span className="text-xs text-slate-400">
                    {form.expected_pse ? FOSTER[form.expected_pse] : 'Escala de Foster (1–10)'}
                  </span>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5" role="group" aria-label="PSE esperada">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={form.expected_pse === v}
                      title={FOSTER[v]}
                      onClick={() => setForm({ ...form, expected_pse: v })}
                      className={`py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                        form.expected_pse === v
                          ? pseClass(v)
                          : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Anotações</span>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Objetivos, exercícios, atletas com restrição, material necessário..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
                />
              </label>

              {formError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-700 flex items-center gap-2.5 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="pt-4 flex items-center gap-3 border-t border-slate-800">
                {form.id && (
                  <button
                    type="button"
                    onClick={handleDelete}
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
