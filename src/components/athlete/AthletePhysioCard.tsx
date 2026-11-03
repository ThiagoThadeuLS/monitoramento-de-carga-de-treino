import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Dumbbell, HeartPulse, Loader2 } from 'lucide-react';
import {
  AthletePhysio,
  AthletePhysioPrescription,
  PHYSIO_RETURN_TONE,
  PHYSIO_STATUS_LABEL,
  PHYSIO_STATUS_TONE,
  checkinAthletePhysio,
  criteriaProgress,
  formatPhysioRegion,
  getAthletePhysio,
  physioReturnInfo,
} from '../../lib/physio';

interface Props {
  token: string | null;
  /** Muda quando a tela Hoje recarrega (novo check-in, virada do dia) */
  refreshKey?: number;
}

const dateBR = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

const input =
  'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';

/** Cartão do atleta na tela Hoje: plano da fisioterapia, critérios e check-in do dia. */
export const AthletePhysioCard: React.FC<Props> = ({ token, refreshKey }) => {
  const [data, setData] = useState<AthletePhysio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [done, setDone] = useState(true);
  const [dorAntes, setDorAntes] = useState('');
  const [dorDepois, setDorDepois] = useState('');
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setData(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setData(await getAthletePhysio(token));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const flash = (text: string) => {
    setFeedback(text);
    setTimeout(() => setFeedback(''), 3500);
  };

  const openForm = (p: AthletePhysioPrescription) => {
    const today = data?.checkins.find((c) => c.prescription_id === p.id);
    if (openId === p.id) {
      setOpenId(null);
      return;
    }
    setOpenId(p.id);
    setDone(today?.done ?? true);
    setDorAntes(today?.dor_antes != null ? String(today.dor_antes) : '');
    setDorDepois(today?.dor_depois != null ? String(today.dor_depois) : '');
    setObservacao(today?.observacao ?? '');
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !openId) return;
    setSaving(true);
    setError('');
    try {
      await checkinAthletePhysio(token, {
        prescriptionId: openId,
        done,
        dorAntes: dorAntes === '' ? null : Number(dorAntes),
        dorDepois: dorDepois === '' ? null : Number(dorDepois),
        observacao,
      });
      flash('Check-in registrado. A fisioterapia vai ver sua evolução.');
      setOpenId(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!token) return null;
  if (!data) {
    return loading ? (
      <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-4 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
      </div>
    ) : null;
  }
  if (!data.case) return null;

  const c = data.case;
  const ret = physioReturnInfo(c);
  const progress = criteriaProgress(data.criteria);
  const todayCheckins = new Map(data.checkins.map((ck) => [ck.prescription_id, ck]));
  const painPoints = data.painHistory.slice(-12);

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
            <HeartPulse className="w-5 h-5 text-sky-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-white">Fisioterapia</p>
            <p className="text-xs text-slate-400 truncate">{formatPhysioRegion(c.regiao, c.lado)}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold ${PHYSIO_STATUS_TONE[c.status]}`}>
            {PHYSIO_STATUS_LABEL[c.status]}
          </span>
          <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold ${PHYSIO_RETURN_TONE[ret.state]}`}>{ret.label}</span>
        </div>
      </div>

      {c.restricao && (
        <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
          <strong className="font-bold">Restrição:</strong> {c.restricao}
        </p>
      )}

      {data.criteria.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold uppercase tracking-wide text-slate-400">Critérios de retorno</span>
            <span className="text-slate-400">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
          <ul className="space-y-1 pt-0.5">
            {data.criteria.map((cr) => (
              <li key={cr.id} className="flex items-center gap-2 text-xs">
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${cr.cumprido ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-600'}`}>
                  {cr.cumprido && <CheckCircle2 className="w-3 h-3" />}
                </span>
                <span className={cr.cumprido ? 'text-slate-400 line-through' : 'text-slate-200'}>{cr.descricao}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.prescriptions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Seu plano de hoje</p>
          <ul className="space-y-2">
            {data.prescriptions.map((p) => {
              const today = todayCheckins.get(p.id);
              const open = openId === p.id;
              return (
                <li key={p.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                  <div className="p-3 flex items-start gap-3">
                    <Dumbbell className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">{p.nome}</p>
                      <p className="text-xs text-slate-400">
                        {[p.series && `${p.series} série${p.series === '1' ? '' : 's'}`, p.repeticoes && `${p.repeticoes} rep.`, p.frequencia]
                          .filter(Boolean)
                          .join(' • ') || 'Siga a orientação da fisioterapia.'}
                      </p>
                      {p.orientacao && <p className="text-[11px] text-slate-500 mt-0.5">{p.orientacao}</p>}
                      {today && (
                        <p className={`text-[11px] mt-1 font-semibold ${today.done ? 'text-emerald-300' : 'text-slate-400'}`}>
                          Hoje: {today.done ? 'feito' : 'não feito'}
                          {today.dor_antes != null ? ` • dor antes ${today.dor_antes}` : ''}
                          {today.dor_depois != null ? ` • depois ${today.dor_depois}` : ''}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openForm(p)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 flex-shrink-0 ${
                        today
                          ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          : 'bg-sky-500 text-slate-950 border-sky-400 hover:bg-sky-400'
                      }`}
                    >
                      {today ? 'Editar' : 'Registrar'}
                      {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>

                  {open && (
                    <form onSubmit={submit} className="border-t border-slate-800 p-3 space-y-2.5 bg-slate-900/60">
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="w-4 h-4 accent-sky-500" />
                        Fiz este exercício hoje
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">Dor antes (0-10)</span>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={dorAntes}
                            onChange={(e) => setDorAntes(e.target.value)}
                            placeholder="ex: 3"
                            className={input}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">Dor depois (0-10)</span>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={dorDepois}
                            onChange={(e) => setDorDepois(e.target.value)}
                            placeholder="ex: 1"
                            className={input}
                          />
                        </label>
                      </div>
                      <label className="block">
                        <span className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">Observação (opcional)</span>
                        <input
                          type="text"
                          value={observacao}
                          onChange={(e) => setObservacao(e.target.value)}
                          placeholder="ex: senti um pouco de dor no fim"
                          className={input}
                          maxLength={200}
                        />
                      </label>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                        >
                          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar check-in
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {painPoints.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sua dor nas últimas sessões</p>
          <div className="flex items-end gap-1.5 h-14">
            {painPoints.map((s, i) => {
              const h = Math.max(4, ((s.dor_movimento ?? 0) / 10) * 100);
              return (
                <div key={`${s.date}-${i}`} className="flex-1 flex flex-col items-center justify-end gap-0.5" title={`${dateBR(s.date)} • dor ${s.dor_movimento ?? '—'}`}>
                  <span className="text-[9px] text-slate-400">{s.dor_movimento ?? '—'}</span>
                  <div
                    className={`w-full rounded-t ${(s.dor_movimento ?? 0) >= 7 ? 'bg-red-400/80' : (s.dor_movimento ?? 0) >= 4 ? 'bg-amber-400/80' : 'bg-emerald-400/80'}`}
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {feedback && (
        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {feedback}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </p>
      )}
    </section>
  );
};
