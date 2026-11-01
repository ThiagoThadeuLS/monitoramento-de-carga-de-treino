import React, { useEffect, useState } from 'react';
import { Scale, Loader2, Check, BellRing, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const DAYS = [
  { n: 1, label: 'Seg' }, { n: 2, label: 'Ter' }, { n: 3, label: 'Qua' }, { n: 4, label: 'Qui' },
  { n: 5, label: 'Sex' }, { n: 6, label: 'Sáb' }, { n: 7, label: 'Dom' },
];

/** Agenda (treinador): janela de horário das notificações e lembrete de pesagem do clube. */
export const WeightReminderSettings: React.FC = () => {
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState('07:00');
  const [from, setFrom] = useState('06:00');
  const [until, setUntil] = useState('22:00');
  const [saved, setSaved] = useState<{ days: number[]; time: string; from: string; until: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('club_reminder_settings')
      .select('weight_days, weight_time, notify_from, notify_until')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          if (/club_reminder_settings/.test(error.message)) setError('Lembretes ainda não ativados no banco (supabase_completo.sql).');
        } else if (data) {
          const t = String(data.weight_time).slice(0, 5);
          const f = String(data.notify_from ?? '06:00').slice(0, 5);
          const u = String(data.notify_until ?? '22:00').slice(0, 5);
          setDays(data.weight_days ?? []);
          setTime(t);
          setFrom(f);
          setUntil(u);
          setSaved({ days: data.weight_days ?? [], time: t, from: f, until: u });
        }
        setLoading(false);
      });
  }, []);

  const dirty =
    !saved || saved.time !== time || saved.from !== from || saved.until !== until ||
    saved.days.slice().sort().join() !== days.slice().sort().join();
  const windowError = from >= until ? 'O início precisa ser antes do fim.' : '';

  const save = async () => {
    if (!supabase || windowError) return;
    setSaving(true);
    setError('');
    const sorted = [...days].sort();
    const { error } = await supabase
      .from('club_reminder_settings')
      .upsert(
        { weight_days: sorted, weight_time: time, notify_from: from, notify_until: until, updated_at: new Date().toISOString() },
        { onConflict: 'club_id' }
      );
    setSaving(false);
    if (error) return setError(/row-level security/.test(error.message) ? 'Sem permissão para alterar (modo somente leitura?).' : `Erro: ${error.message}`);
    setSaved({ days: sorted, time, from, until });
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  };

  if (loading) return null;

  return (
    <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-4">
      {/* Janela de horário das notificações */}
      <div className="space-y-2 pb-4 border-b border-slate-800">
        <div className="flex items-start gap-2">
          <Clock className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-white">Horário das notificações</p>
            <p className="text-xs text-slate-400">
              Os atletas só recebem lembretes (PSE, bem-estar e pesagem) dentro deste horário. Fora dele, nenhum aviso é enviado.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <label htmlFor="notif-de">das</label>
          <input
            id="notif-de"
            type="time"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <label htmlFor="notif-ate">às</label>
          <input
            id="notif-ate"
            type="time"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        {windowError && <p className="text-xs text-red-300">{windowError}</p>}
      </div>

      <div className="flex items-start gap-2">
        <Scale className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-white flex items-center gap-1.5">
            Lembrete de pesagem <BellRing className="w-3.5 h-3.5 text-slate-400" />
          </p>
          <p className="text-xs text-slate-400">
            Nos dias marcados, os atletas recebem o lembrete a partir do horário escolhido, repetindo a cada 30 min até registrarem o peso.
            PSE: 20 min após o fim de cada treino. PSR: a partir do início do horário das notificações, nos dias com treino. Ambos repetem a cada 20 min até a resposta.
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="grid grid-cols-7 gap-1.5 flex-1 sm:flex-none" role="group" aria-label="Dias da pesagem">
          {DAYS.map((d) => {
            const on = days.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                aria-pressed={on}
                onClick={() => setDays(on ? days.filter((x) => x !== d.n) : [...days, d.n])}
                className={`px-2 py-2 rounded-lg text-xs font-bold border ${
                  on ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400" htmlFor="peso-horario">às</label>
          <input
            id="peso-horario"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty || !!windowError}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ok ? <Check className="w-3.5 h-3.5" /> : null}
            {ok ? 'Salvo' : 'Salvar'}
          </button>
        </div>
      </div>
      {days.length === 0 && <p className="text-[11px] text-slate-500">Nenhum dia marcado: sem lembrete de pesagem.</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
};
