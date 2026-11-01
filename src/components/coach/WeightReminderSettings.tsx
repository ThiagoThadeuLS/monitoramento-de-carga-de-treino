import React, { useEffect, useState } from 'react';
import { Scale, Loader2, Check, BellRing } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const DAYS = [
  { n: 1, label: 'Seg' }, { n: 2, label: 'Ter' }, { n: 3, label: 'Qua' }, { n: 4, label: 'Qui' },
  { n: 5, label: 'Sex' }, { n: 6, label: 'Sáb' }, { n: 7, label: 'Dom' },
];

/** Agenda (treinador): dias e horário do lembrete de pesagem enviado aos atletas. */
export const WeightReminderSettings: React.FC = () => {
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState('07:00');
  const [saved, setSaved] = useState<{ days: number[]; time: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('club_reminder_settings')
      .select('weight_days, weight_time')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          if (/club_reminder_settings/.test(error.message)) setError('Lembretes ainda não ativados no banco (supabase_lembretes.sql).');
        } else if (data) {
          const t = String(data.weight_time).slice(0, 5);
          setDays(data.weight_days ?? []);
          setTime(t);
          setSaved({ days: data.weight_days ?? [], time: t });
        }
        setLoading(false);
      });
  }, []);

  const dirty = !saved || saved.time !== time || saved.days.slice().sort().join() !== days.slice().sort().join();

  const save = async () => {
    if (!supabase) return;
    setSaving(true);
    setError('');
    const sorted = [...days].sort();
    const { error } = await supabase
      .from('club_reminder_settings')
      .upsert({ weight_days: sorted, weight_time: time, updated_at: new Date().toISOString() }, { onConflict: 'club_id' });
    setSaving(false);
    if (error) return setError(/row-level security/.test(error.message) ? 'Sem permissão para alterar (modo somente leitura?).' : `Erro: ${error.message}`);
    setSaved({ days: sorted, time });
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  };

  if (loading) return null;

  return (
    <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-3">
      <div className="flex items-start gap-2">
        <Scale className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-white flex items-center gap-1.5">
            Lembrete de pesagem <BellRing className="w-3.5 h-3.5 text-slate-400" />
          </p>
          <p className="text-xs text-slate-400">
            Nos dias marcados, os atletas recebem o lembrete a partir do horário escolhido, repetindo a cada 30 min até registrarem o peso.
            Os lembretes de PSE e PSR saem automaticamente pelos horários do cronograma.
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
            disabled={saving || !dirty}
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
