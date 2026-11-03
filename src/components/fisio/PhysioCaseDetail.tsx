import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useDialogs } from '../ui/Dialogs';
import { ClubAthlete } from '../../lib/athletes';
import { brDateOfStamp, todayISO } from '../../lib/date';
import {
  PHYSIO_RETURN_TONE,
  PHYSIO_STATUS_LABEL,
  PHYSIO_STATUS_TONE,
  PhysioCase,
  PhysioCheckin,
  PhysioCriterion,
  PhysioPrescription,
  PhysioSession,
  criteriaProgress,
  deletePhysioCriterion,
  deletePhysioPrescription,
  deletePhysioSession,
  formatPhysioRegion,
  getPhysioCase,
  listPhysioCheckins,
  listPhysioCriteria,
  listPhysioPrescriptions,
  listPhysioSessions,
  physioReturnInfo,
  savePhysioCriterion,
  savePhysioPrescription,
  savePhysioSession,
  setPhysioCriterionDone,
} from '../../lib/physio';

type Tab = 'sessoes' | 'plano' | 'criterios' | 'checkins';

interface Props {
  caseId: string;
  athletes: ClubAthlete[];
  onBack: () => void;
  onEdit: (c: PhysioCase) => void;
  onDelete: (c: PhysioCase) => void;
  onChanged: () => void;
}

const input =
  'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';
const smallLabel = 'block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1';

const num = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const painTone = (v?: number | null) =>
  v == null ? 'text-slate-400' : v <= 3 ? 'text-emerald-300' : v <= 6 ? 'text-amber-300' : 'text-red-300';

const dateBR = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

/** Ficha do caso: sessões, plano de exercícios, critérios de retorno e check-ins do atleta. */
export const PhysioCaseDetail: React.FC<Props> = ({ caseId, athletes, onBack, onEdit, onDelete, onChanged }) => {
  const { confirm } = useDialogs();
  const [c, setC] = useState<PhysioCase | null>(null);
  const [sessions, setSessions] = useState<PhysioSession[]>([]);
  const [prescriptions, setPrescriptions] = useState<PhysioPrescription[]>([]);
  const [criteria, setCriteria] = useState<PhysioCriterion[]>([]);
  const [checkins, setCheckins] = useState<PhysioCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [tab, setTab] = useState<Tab>('sessoes');

  // formulários
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionDate, setSessionDate] = useState(todayISO());
  const [dorRepouso, setDorRepouso] = useState('');
  const [dorMovimento, setDorMovimento] = useState('');
  const [funcao, setFuncao] = useState('');
  const [conduta, setConduta] = useState('');
  const [proxima, setProxima] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');

  const [planOpen, setPlanOpen] = useState(false);
  const [planNome, setPlanNome] = useState('');
  const [planSeries, setPlanSeries] = useState('');
  const [planReps, setPlanReps] = useState('');
  const [planFreq, setPlanFreq] = useState('');
  const [planOrient, setPlanOrient] = useState('');

  const [newCriterion, setNewCriterion] = useState('');
  const [saving, setSaving] = useState(false);

  const athleteName = useMemo(
    () => athletes.find((a) => a.id === c?.athlete_id)?.nome ?? 'Atleta',
    [athletes, c?.athlete_id]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const found = await getPhysioCase(caseId);
      if (!found) {
        setError('Caso não encontrado.');
        return;
      }
      const [s, p, cr, ck] = await Promise.all([
        listPhysioSessions(caseId),
        listPhysioPrescriptions(caseId),
        listPhysioCriteria(caseId),
        listPhysioCheckins(caseId),
      ]);
      setC(found);
      setSessions(s);
      setPrescriptions(p);
      setCriteria(cr);
      setCheckins(ck);
      onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [caseId, onChanged]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (text: string) => {
    setFeedback(text);
    setTimeout(() => setFeedback(''), 3500);
  };

  const resetSession = () => {
    setSessionDate(todayISO());
    setDorRepouso('');
    setDorMovimento('');
    setFuncao('');
    setConduta('');
    setProxima('');
    setSessionNotes('');
    setSessionOpen(false);
  };

  const addSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!c) return;
    setSaving(true);
    setError('');
    try {
      await savePhysioSession({
        case_id: c.id,
        date: sessionDate,
        dor_repouso: num(dorRepouso),
        dor_movimento: num(dorMovimento),
        funcao_score: num(funcao),
        conduta,
        proxima_sessao: proxima || null,
        notas: sessionNotes,
      });
      flash('Sessão registrada.');
      resetSession();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeSession = async (s: PhysioSession) => {
    if (!(await confirm({ message: `Excluir a sessão de ${dateBR(s.date)}?`, danger: true, confirmLabel: 'Excluir' }))) return;
    try {
      await deletePhysioSession(s.id);
      flash('Sessão excluída.');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetPlan = () => {
    setPlanNome('');
    setPlanSeries('');
    setPlanReps('');
    setPlanFreq('');
    setPlanOrient('');
    setPlanOpen(false);
  };

  const addPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!c) return;
    if (!planNome.trim()) return setError('Informe o nome do exercício.');
    setSaving(true);
    setError('');
    try {
      await savePhysioPrescription({
        case_id: c.id,
        nome: planNome,
        series: planSeries,
        repeticoes: planReps,
        frequencia: planFreq,
        orientacao: planOrient,
      });
      flash('Exercício adicionado ao plano.');
      resetPlan();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removePlan = async (p: PhysioPrescription) => {
    if (!(await confirm({ message: `Remover "${p.nome}" do plano?`, danger: true, confirmLabel: 'Remover' }))) return;
    try {
      await deletePhysioPrescription(p.id);
      flash('Exercício removido.');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addCriterion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!c) return;
    if (!newCriterion.trim()) return;
    setSaving(true);
    setError('');
    try {
      await savePhysioCriterion({ case_id: c.id, descricao: newCriterion, ordem: criteria.length });
      setNewCriterion('');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleCriterion = async (cr: PhysioCriterion) => {
    try {
      await setPhysioCriterionDone(cr.id, !cr.cumprido);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const removeCriterion = async (cr: PhysioCriterion) => {
    if (!(await confirm({ message: `Excluir o critério "${cr.descricao}"?`, danger: true, confirmLabel: 'Excluir' }))) return;
    try {
      await deletePhysioCriterion(cr.id);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-sky-400" />
      </div>
    );
  }

  if (!c) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4" /> {error || 'Caso não encontrado.'}
        </div>
      </div>
    );
  }

  const ret = physioReturnInfo(c);
  const progress = criteriaProgress(criteria);
  const lastSession = sessions[0];
  const painPoints = [...sessions].reverse().slice(-14);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'sessoes', label: 'Sessões', count: sessions.length },
    { id: 'plano', label: 'Plano', count: prescriptions.filter((p) => p.ativo).length },
    { id: 'criterios', label: 'Critérios', count: criteria.length },
    { id: 'checkins', label: 'Check-ins', count: checkins.length },
  ];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Voltar para os casos
      </button>

      {/* Cabeçalho do caso */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-black text-white truncate">{athleteName}</h2>
              <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold ${PHYSIO_STATUS_TONE[c.status]}`}>
                {PHYSIO_STATUS_LABEL[c.status]}
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold ${PHYSIO_RETURN_TONE[ret.state]}`}>{ret.label}</span>
            </div>
            <p className="text-sm text-slate-300 mt-1">{formatPhysioRegion(c.regiao, c.lado)}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => onEdit(c)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (
                  await confirm({
                    message: `Excluir o caso de ${athleteName} (${formatPhysioRegion(c.regiao, c.lado)})? Sessões, plano e check-ins também serão apagados.`,
                    danger: true,
                    confirmLabel: 'Excluir caso',
                  })
                )
                  onDelete(c);
              }}
              className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30"
              title="Excluir caso"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
            <p className="text-slate-500">Início</p>
            <p className="text-slate-200 font-semibold">{dateBR(c.inicio)}</p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
            <p className="text-slate-500">Previsão</p>
            <p className="text-slate-200 font-semibold">{dateBR(c.previsao_retorno)}</p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
            <p className="text-slate-500">Dor (repouso / movimento)</p>
            <p className="font-semibold">
              <span className={painTone(lastSession?.dor_repouso)}>{lastSession?.dor_repouso ?? '—'}</span>
              <span className="text-slate-500"> / </span>
              <span className={painTone(lastSession?.dor_movimento)}>{lastSession?.dor_movimento ?? '—'}</span>
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
            <p className="text-slate-500">Critérios</p>
            <p className="text-slate-200 font-semibold">
              {progress.done}/{progress.total} <span className="text-slate-500">({progress.pct}%)</span>
            </p>
          </div>
        </div>

        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progress.pct}%` }} />
        </div>

        {c.restricao && (
          <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
            <strong className="font-bold">Restrição:</strong> {c.restricao}
          </p>
        )}
        {c.observacoes_treinador && (
          <p className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2">
            <strong className="font-bold text-slate-400">Recado aos treinadores:</strong> {c.observacoes_treinador}
          </p>
        )}
        {c.notas_privadas && (
          <p className="text-xs text-violet-200 bg-violet-500/10 border border-violet-500/30 rounded-xl px-3 py-2">
            <strong className="font-bold">Notas privadas:</strong> {c.notas_privadas}
          </p>
        )}
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

      {/* Evolução da dor */}
      {painPoints.length > 1 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Evolução da dor (0 a 10)</p>
          <div className="flex items-end gap-1.5 h-20">
            {painPoints.map((s) => {
              const h = Math.max(4, ((s.dor_movimento ?? 0) / 10) * 100);
              return (
                <div key={s.id} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${dateBR(s.date)} • dor no movimento ${s.dor_movimento ?? '—'}`}>
                  <span className="text-[10px] text-slate-400">{s.dor_movimento ?? '—'}</span>
                  <div
                    className={`w-full rounded-t ${(s.dor_movimento ?? 0) >= 7 ? 'bg-red-400/80' : (s.dor_movimento ?? 0) >= 4 ? 'bg-amber-400/80' : 'bg-emerald-400/80'}`}
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-[9px] text-slate-500">{dateBR(s.date)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none" role="tablist" style={{ scrollbarWidth: 'none' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border flex-shrink-0 transition-colors ${
              tab === t.id ? 'bg-slate-100 text-slate-950 border-slate-100' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            {t.label}
            {typeof t.count === 'number' && <span className={tab === t.id ? 'text-slate-500' : 'text-slate-500'}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Sessões */}
      {tab === 'sessoes' && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setSessionOpen((v) => !v)}
            className="w-full py-3 rounded-2xl border border-dashed border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold flex items-center justify-center gap-2"
          >
            {sessionOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {sessionOpen ? 'Fechar' : 'Registrar sessão'}
          </button>

          {sessionOpen && (
            <form onSubmit={addSession} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="block col-span-2 sm:col-span-1">
                  <span className={smallLabel}>Data</span>
                  <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className={input} required />
                </label>
                <label className="block">
                  <span className={smallLabel}>Dor repouso</span>
                  <input type="number" min={0} max={10} value={dorRepouso} onChange={(e) => setDorRepouso(e.target.value)} placeholder="0-10" className={input} />
                </label>
                <label className="block">
                  <span className={smallLabel}>Dor movimento</span>
                  <input type="number" min={0} max={10} value={dorMovimento} onChange={(e) => setDorMovimento(e.target.value)} placeholder="0-10" className={input} />
                </label>
                <label className="block">
                  <span className={smallLabel}>Função (%)</span>
                  <input type="number" min={0} max={100} value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder="0-100" className={input} />
                </label>
                <label className="block col-span-2">
                  <span className={smallLabel}>Próxima sessão</span>
                  <input type="date" value={proxima} onChange={(e) => setProxima(e.target.value)} className={input} />
                </label>
              </div>
              <label className="block">
                <span className={smallLabel}>Conduta da sessão</span>
                <input type="text" value={conduta} onChange={(e) => setConduta(e.target.value)} placeholder="ex: mobilização, reforço, gelo" className={input} />
              </label>
              <label className="block">
                <span className={smallLabel}>Notas</span>
                <textarea value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} rows={2} className={`${input} resize-none`} />
              </label>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar sessão
                </button>
              </div>
            </form>
          )}

          {sessions.length === 0 ? (
            <div className="py-10 text-center text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
              <HeartPulse className="w-7 h-7 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">Nenhuma sessão registrada</p>
              <p className="text-xs">Registre a primeira avaliação para começar a acompanhar a evolução.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white flex items-center gap-2">
                        <CalendarDays className="w-3.5 h-3.5 text-sky-400" /> {dateBR(s.date)}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        <span>
                          Dor repouso <span className={painTone(s.dor_repouso)}>{s.dor_repouso ?? '—'}</span>
                        </span>
                        <span>
                          Dor movimento <span className={painTone(s.dor_movimento)}>{s.dor_movimento ?? '—'}</span>
                        </span>
                        <span>Função {s.funcao_score != null ? `${s.funcao_score}%` : '—'}</span>
                      </p>
                      {s.conduta && <p className="text-xs text-slate-300 mt-1">{s.conduta}</p>}
                      {s.proxima_sessao && <p className="text-[11px] text-slate-500 mt-1">Próxima: {dateBR(s.proxima_sessao)}</p>}
                      {s.notas && <p className="text-xs text-slate-500 mt-1">{s.notas}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSession(s)}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 border border-red-500/20 flex-shrink-0"
                      title="Excluir sessão"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Plano */}
      {tab === 'plano' && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setPlanOpen((v) => !v)}
            className="w-full py-3 rounded-2xl border border-dashed border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold flex items-center justify-center gap-2"
          >
            {planOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {planOpen ? 'Fechar' : 'Adicionar exercício'}
          </button>

          {planOpen && (
            <form onSubmit={addPlan} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
              <label className="block">
                <span className={smallLabel}>Exercício *</span>
                <input type="text" value={planNome} onChange={(e) => setPlanNome(e.target.value)} placeholder="ex: Alongamento de isquiotibiais" className={input} required />
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className={smallLabel}>Séries</span>
                  <input type="text" value={planSeries} onChange={(e) => setPlanSeries(e.target.value)} placeholder="3" className={input} />
                </label>
                <label className="block">
                  <span className={smallLabel}>Repetições</span>
                  <input type="text" value={planReps} onChange={(e) => setPlanReps(e.target.value)} placeholder="15" className={input} />
                </label>
                <label className="block col-span-2 sm:col-span-1">
                  <span className={smallLabel}>Frequência</span>
                  <input type="text" value={planFreq} onChange={(e) => setPlanFreq(e.target.value)} placeholder="Diário" className={input} />
                </label>
              </div>
              <label className="block">
                <span className={smallLabel}>Orientação</span>
                <textarea value={planOrient} onChange={(e) => setPlanOrient(e.target.value)} rows={2} placeholder="ex: sem dor, até 30 segundos" className={`${input} resize-none`} />
              </label>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Adicionar
                </button>
              </div>
            </form>
          )}

          {prescriptions.filter((p) => p.ativo).length === 0 ? (
            <div className="py-10 text-center text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
              <Dumbbell className="w-7 h-7 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">Nenhum exercício no plano</p>
              <p className="text-xs">O atleta vê os exercícios ativos na tela Hoje e registra o check-in.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {prescriptions
                .filter((p) => p.ativo)
                .map((p) => (
                  <li key={p.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{p.nome}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {[p.series && `${p.series} série${p.series === '1' ? '' : 's'}`, p.repeticoes && `${p.repeticoes} rep.`, p.frequencia]
                            .filter(Boolean)
                            .join(' • ') || 'Sem detalhes'}
                        </p>
                        {p.orientacao && <p className="text-xs text-slate-500 mt-1">{p.orientacao}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removePlan(p)}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 border border-red-500/20 flex-shrink-0"
                        title="Remover exercício"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {/* Critérios */}
      {tab === 'criterios' && (
        <section className="space-y-3">
          <form onSubmit={addCriterion} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
            <label className="block">
              <span className={smallLabel}>Novo critério de retorno</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCriterion}
                  onChange={(e) => setNewCriterion(e.target.value)}
                  placeholder="ex: agachar sem dor, correr 10 min"
                  className={input}
                  maxLength={200}
                />
                <button
                  type="submit"
                  disabled={saving || !newCriterion.trim()}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50 flex-shrink-0"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            </label>
            <p className="text-[11px] text-slate-500">Critérios cumpridos ajudam a estimar o retorno ao tatame com segurança.</p>
          </form>

          {criteria.length === 0 ? (
            <div className="py-10 text-center text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
              <ClipboardList className="w-7 h-7 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">Nenhum critério definido</p>
              <p className="text-xs">Ex.: dor zero em repouso, força 90% do lado são, corrida sem dor.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {criteria.map((cr) => (
                <li key={cr.id} className={`rounded-2xl border p-3.5 flex items-center gap-3 ${cr.cumprido ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-slate-900/90 border-slate-800'}`}>
                  <button
                    type="button"
                    onClick={() => toggleCriterion(cr)}
                    className={`w-6 h-6 rounded-lg border flex items-center justify-center flex-shrink-0 ${
                      cr.cumprido ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-600 text-transparent hover:border-slate-400'
                    }`}
                    title={cr.cumprido ? 'Marcar como pendente' : 'Marcar como cumprido'}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${cr.cumprido ? 'text-slate-300 line-through' : 'text-white'}`}>{cr.descricao}</p>
                    {cr.cumprido && cr.cumprido_em && <p className="text-[11px] text-emerald-400">Cumprido em {dateBR(cr.cumprido_em)}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCriterion(cr)}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 border border-red-500/20 flex-shrink-0"
                    title="Excluir critério"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Check-ins */}
      {tab === 'checkins' && (
        <section className="space-y-3">
          {checkins.length === 0 ? (
            <div className="py-10 text-center text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
              <CheckCircle2 className="w-7 h-7 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">Nenhum check-in do atleta</p>
              <p className="text-xs">O atleta registra cada exercício feito e a dor antes/depois na tela Hoje.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {checkins.map((ck) => {
                const presc = prescriptions.find((p) => p.id === ck.prescription_id);
                return (
                  <li key={ck.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{presc?.nome ?? 'Exercício removido'}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {dateBR(ck.date)} •{' '}
                          <span className={ck.done ? 'text-emerald-300' : 'text-slate-400'}>{ck.done ? 'Feito' : 'Não feito'}</span>
                          {ck.dor_antes != null && (
                            <>
                              {' '}
                              • dor antes <span className={painTone(ck.dor_antes)}>{ck.dor_antes}</span>
                            </>
                          )}
                          {ck.dor_depois != null && (
                            <>
                              {' '}
                              • depois <span className={painTone(ck.dor_depois)}>{ck.dor_depois}</span>
                            </>
                          )}
                        </p>
                        {ck.observacao && <p className="text-xs text-slate-500 mt-1">{ck.observacao}</p>}
                      </div>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">{brDateOfStamp(ck.created_at)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};
