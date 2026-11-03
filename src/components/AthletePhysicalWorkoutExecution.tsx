import { useState, useEffect } from 'react';
import { completeAthleteWorkout, getAthleteWorkout, WorkoutPrescription } from '../lib/athleteAuth';
import {
  Dumbbell, Play, Square, Loader2, Clock, ArrowRight,
  AlertCircle, CheckCircle2, Eye, ArrowLeft,
} from 'lucide-react';
import {
  calcularMontagemBarra,
  ajustarCargaMontavel,
  getPlateColor,
  PlateWeight,
} from '../lib/barbellCalculator';

interface AthletePhysicalWorkoutExecutionProps {
  token: string;
  athleteId: string;
  sessionId: string;
  sessionName: string;
  onFinishAndGoToPse: (durationMinutes: number) => void;
  onBack: () => void;
}

// ─── Visual barbell plate display ────────────────────────────────────────────
function PlateVisual({
  totalWeight,
  theoreticalWeight,
  barWeight = 20,
}: {
  totalWeight: number;
  theoreticalWeight?: number;
  barWeight?: number;
}) {
  const setup = calcularMontagemBarra(totalWeight, barWeight);

  if (totalWeight <= barWeight) {
    return (
      <p className="text-xs text-slate-400 italic">Apenas a barra ({barWeight} kg) — sem anilhas</p>
    );
  }

  const plateBlocks: { plate: PlateWeight; qty: number }[] = [];
  for (const pr of setup.plates) {
    plateBlocks.push({ plate: pr.plate, qty: pr.qty });
  }

  const getPlateHeightAndWidth = (p: PlateWeight) => {
    if (p >= 25) return 'h-16 w-4';
    if (p >= 20) return 'h-14 w-4';
    if (p >= 15) return 'h-12 w-4';
    if (p >= 10) return 'h-10 w-3.5';
    if (p >= 5) return 'h-8 w-3.5';
    if (p >= 2.5) return 'h-6 w-3';
    return 'h-5 w-2.5';
  };

  return (
    <div className="space-y-2.5">
      {/* Barbell illustration */}
      <div className="flex items-center justify-center gap-0 overflow-x-auto py-2">
        {/* Left collar */}
        <div className="w-3 h-7 rounded-l-sm bg-slate-600 border border-slate-500 flex-shrink-0" />

        {/* Left plates (outer → inner = largest first) */}
        <div className="flex items-center">
          {plateBlocks.map((pb) =>
            Array.from({ length: pb.qty }).map((_, i) => {
              const c = getPlateColor(pb.plate);
              const size = getPlateHeightAndWidth(pb.plate);
              return (
                <div
                  key={`L-${pb.plate}-${i}`}
                  className={`${c.bg} ${c.border} border-2 ${size} flex-shrink-0 rounded-xs`}
                  title={`${pb.plate} kg`}
                />
              );
            })
          )}
        </div>

        {/* Bar */}
        <div className="flex-1 min-w-[40px] max-w-[80px] h-2.5 bg-gradient-to-r from-slate-400 via-slate-300 to-slate-400 rounded-sm flex-shrink-0" />

        {/* Right plates (inner → outer = reverse) */}
        <div className="flex items-center">
          {[...plateBlocks].reverse().map((pb) =>
            Array.from({ length: pb.qty }).map((_, i) => {
              const c = getPlateColor(pb.plate);
              const size = getPlateHeightAndWidth(pb.plate);
              return (
                <div
                  key={`R-${pb.plate}-${i}`}
                  className={`${c.bg} ${c.border} border-2 ${size} flex-shrink-0 rounded-xs`}
                  title={`${pb.plate} kg`}
                />
              );
            })
          )}
        </div>

        {/* Right collar */}
        <div className="w-3 h-7 rounded-r-sm bg-slate-600 border border-slate-500 flex-shrink-0" />
      </div>

      {/* Plate legend chips */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        {setup.plates.map((pr) => {
          const c = getPlateColor(pr.plate);
          return (
            <span
              key={pr.plate}
              className={`${c.bg} ${c.text} text-[10px] font-black px-2 py-0.5 rounded-md border ${c.border} flex-shrink-0`}
            >
              {pr.qty > 1 ? `${pr.qty}× ` : ''}{pr.plate} kg
            </span>
          );
        })}
      </div>

      {/* Per-side summary */}
      <div className="text-center space-y-0.5">
        <p className="text-[11px] text-slate-300">
          <strong className="text-white font-bold">{setup.weightPerSide.toFixed(1).replace('.0', '').replace('.', ',')} kg</strong> de cada lado · barra {barWeight} kg
        </p>
        {theoreticalWeight && theoreticalWeight !== totalWeight && (
          <p className="text-[10px] text-amber-400/90">
            Cálculo teórico: {theoreticalWeight.toFixed(1).replace('.', ',')} kg • ajustado para {totalWeight} kg com anilhas disponíveis
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export function AthletePhysicalWorkoutExecution({
  token,
  athleteId,
  sessionId,
  sessionName,
  onFinishAndGoToPse,
  onBack,
}: AthletePhysicalWorkoutExecutionProps) {
  const [loading, setLoading] = useState(true);
  const [prescriptions, setPrescriptions] = useState<WorkoutPrescription[]>([]);
  const [athletePrs, setAthletePrs] = useState<Record<string, number>>({});

  // Cronômetro em andamento fica neste aparelho; o treino concluído fica no banco
  const storageKey = `workout_timer_${athleteId}_${sessionId}`;

  // ── Timer state (persistent) ──
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [now, setNow] = useState(Date.now());

  // ── Completed read-only mode ──
  const [isCompleted, setIsCompleted] = useState(false);
  const [completedDuration, setCompletedDuration] = useState(0);

  const [generalError, setGeneralError] = useState('');
  const [finishing, setFinishing] = useState(false);

  // ── Plate visualization: expand state per prescription ──
  const [expandedPlates, setExpandedPlates] = useState<Set<string>>(new Set());
  const togglePlates = (id: string) =>
    setExpandedPlates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Load timer state
  useEffect(() => {
    if (!athleteId || !sessionId) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setStartedAt(parsed.startedAt ?? null);
        setAccumulatedSeconds(Number(parsed.accumulatedSeconds) || 0);
        setTimerActive(Boolean(parsed.timerActive));
        setHasStarted(Boolean(parsed.hasStarted));
      }
    } catch {
      /* sem armazenamento */
    }
  }, [storageKey, athleteId, sessionId]);

  const persistState = (overrides: Partial<{
    startedAt: number | null; accumulatedSeconds: number;
    timerActive: boolean; hasStarted: boolean;
  }> = {}) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        startedAt, accumulatedSeconds, timerActive, hasStarted, ...overrides,
      }));
    } catch {
      /* sem armazenamento */
    }
  };

  // Tick every second when running
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerActive]);

  // Warn before page unload
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (timerActive) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [timerActive]);

  // Ficha, PRs e se o treino já foi concluído (em qualquer aparelho)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAthleteWorkout(token, sessionId)
      .then((w) => {
        if (cancelled) return;
        setPrescriptions(w.prescriptions);
        setAthletePrs(w.prs);
        setIsCompleted(Boolean(w.completion));
        setCompletedDuration(w.completion?.duration_minutes ?? 0);
      })
      .catch((err) => !cancelled && setGeneralError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, sessionId]);

  const totalSeconds =
    accumulatedSeconds +
    (timerActive && startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleStartTimer = () => {
    const t = Date.now();
    setStartedAt(t); setTimerActive(true); setHasStarted(true); setGeneralError('');
    persistState({ startedAt: t, timerActive: true, hasStarted: true });
  };

  const handlePauseTimer = () => {
    const add = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
    const newAcc = accumulatedSeconds + add;
    setAccumulatedSeconds(newAcc); setStartedAt(null); setTimerActive(false);
    persistState({ startedAt: null, accumulatedSeconds: newAcc, timerActive: false });
  };

  const handleBack = () => {
    persistState();
    onBack();
  };

  const handleFinishWorkout = async () => {
    setGeneralError('');
    if (!hasStarted) {
      setGeneralError('Você precisa iniciar o cronômetro antes de concluir.');
      return;
    }

    const durationMinutes = Math.min(600, Math.max(1, Math.round(totalSeconds / 60)));

    setFinishing(true);
    try {
      await completeAthleteWorkout(token, sessionId, durationMinutes);
    } catch (err) {
      setGeneralError((err as Error).message);
      setFinishing(false);
      return;
    }
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* sem armazenamento */
    }
    setFinishing(false);
    onFinishAndGoToPse(durationMinutes);
  };

  const calculateLoad = (exercicio: string, porcentagem?: number | null) => {
    if (!porcentagem) return null;
    const pr = athletePrs[exercicio.toLowerCase().trim()];
    if (!pr) return null;
    const teorico = (pr * porcentagem) / 100;
    const { pesoAjustado } = ajustarCargaMontavel(teorico, 20);
    return {
      pesoAjustado,
      teorico: Math.round(teorico * 10) / 10,
    };
  };

  // ── READ-ONLY mode (treino já concluído) ───────────────────────────────────
  if (!loading && isCompleted) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto pb-12">
        {/* Header */}
        <div className="bg-emerald-950/50 border border-emerald-700/40 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Treino Concluído</span>
              <h2 className="text-base font-bold text-white">{sessionName}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-emerald-950/60 px-4 py-2 rounded-2xl border border-emerald-700/40">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span className="text-lg font-black text-emerald-300 font-mono">
              {String(completedDuration).padStart(2, '0')}:00
            </span>
            <span className="text-xs text-emerald-500 ml-1">{completedDuration} min</span>
          </div>
        </div>

        {/* Badge notice */}
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs">
          <Eye className="w-4 h-4 flex-shrink-0 text-sky-400" />
          <span>Este treino já foi realizado e registrado. Você está em modo de visualização.</span>
        </div>

        {/* Prescriptions read-only */}
        <div className="space-y-3">
          {prescriptions.map((p, index) => {
            const carga = calculateLoad(p.exercicio, p.porcentagem_pr ?? undefined);
            return (
              <div key={p.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md opacity-80">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-400 text-xs font-bold flex items-center justify-center">{index + 1}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-bold text-[10px]">{p.bloco}</span>
                  <h3 className="text-sm font-bold text-slate-300">{p.exercicio}</h3>
                  <span className="ml-auto text-[10px] text-slate-500">{p.series}× {p.repeticoes} reps</span>
                </div>
                {carga !== null && (
                  <p className="text-xs text-slate-400">
                    Carga: <span className="text-emerald-400 font-bold">{carga.pesoAjustado} kg</span> ({p.porcentagem_pr}% do PR)
                    {carga.teorico !== carga.pesoAjustado && (
                      <span className="text-[10px] text-slate-500 ml-1">
                        (teórico: {carga.teorico.toString().replace('.', ',')} kg)
                      </span>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-start pt-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
        </div>
      </div>
    );
  }

  // ── LOADING ──
  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
      </div>
    );
  }

  // ── SEM PRESCRIÇÃO ──
  if (prescriptions.length === 0) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto pb-12">
        <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Dumbbell className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Treino Físico</span>
              <h2 className="text-base font-bold text-white">{sessionName}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 flex items-center justify-center mx-auto text-slate-400">
            <AlertCircle className="w-7 h-7 text-amber-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">
              {generalError ? 'Não foi possível abrir este treino' : 'Nenhum exercício prescrito para este treino ainda'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {generalError ||
                'Seu treinador ainda não cadastrou a lista de exercícios para esta sessão. Aguarde a publicação ou peça a prescrição para iniciar a execução.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all shadow-md"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar ao cronograma
          </button>
        </div>
      </div>
    );
  }

  // ── ACTIVE mode (com prescrições) ──────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Header + Timer */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
            <Dumbbell className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">Execução de Treino Físico</span>
            <h2 className="text-base font-bold text-white">{sessionName}</h2>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-2xl border border-slate-800">
            <Clock className={`w-4 h-4 text-emerald-400 ${timerActive ? 'animate-pulse' : ''}`} />
            <span className="text-lg font-black text-white font-mono">{formatTime(totalSeconds)}</span>
          </div>
          {!timerActive ? (
            <button
              type="button"
              onClick={handleStartTimer}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-emerald-500/20"
            >
              <Play className="w-4 h-4 fill-current" /> {hasStarted ? 'Retomar' : 'Iniciar'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePauseTimer}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all"
            >
              <Square className="w-4 h-4 fill-current" /> Pausar
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Prescriptions */}
        <div className="space-y-3">
          {prescriptions.map((p, index) => {
            const carga = calculateLoad(p.exercicio, p.porcentagem_pr ?? undefined);
            const showPlates = expandedPlates.has(p.id);
            const hasCarga = carga !== null;

            return (
              <div key={p.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-md">
                {/* Exercise header */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-400 text-xs font-bold flex items-center justify-center flex-shrink-0">{index + 1}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[10px]">{p.bloco}</span>
                    <h3 className="text-sm font-bold text-white">{p.exercicio}</h3>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    {/* Prescrição */}
                    <div className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Prescrição</span>
                      <span className="font-semibold text-slate-200">{p.series} séries de {p.repeticoes} reps</span>
                    </div>

                    {/* Carga */}
                    <div className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                        {p.usa_pr && p.porcentagem_pr ? `Carga (${p.porcentagem_pr}% do PR)` : 'Carga'}
                      </span>
                      {p.usa_pr && p.porcentagem_pr ? (
                        hasCarga ? (
                          <div className="flex flex-col">
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span className="font-black text-emerald-400 text-base leading-none">
                                {carga.pesoAjustado} kg
                              </span>
                              {carga.teorico !== carga.pesoAjustado && (
                                <span className="text-[10px] text-amber-400/90 font-medium">
                                  (aprox. de {carga.teorico.toString().replace('.', ',')} kg)
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-amber-400 text-[11px] font-medium">Cadastre seu PR na aba "Meus PRs"</span>
                        )
                      ) : (
                        <span className="text-slate-400 text-[11px]">Carga livre / Sem PR</span>
                      )}
                    </div>

                    {/* Observações */}
                    <div className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Observações</span>
                      <span className="text-slate-300 text-[11px] line-clamp-2">{p.observacoes_tecnico || 'Nenhuma'}</span>
                    </div>
                  </div>

                  {/* Plate calculator button */}
                  {hasCarga && (
                    <button
                      type="button"
                      onClick={() => togglePlates(p.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                        showPlates
                          ? 'bg-violet-500/15 border-violet-500/40 text-violet-300 hover:bg-violet-500/20'
                          : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Dumbbell className="w-3.5 h-3.5" />
                        {showPlates ? 'Ocultar montagem da barra' : `Ver montagem da barra (${carga.pesoAjustado} kg total)`}
                      </span>
                      <span className="text-[10px] font-normal">{showPlates ? '▲' : '▼'}</span>
                    </button>
                  )}
                </div>

                {/* Plate visualization panel */}
                {hasCarga && showPlates && (
                  <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] uppercase font-bold text-violet-400 tracking-wider">Montagem da Barra</p>
                      <span className="text-[10px] text-slate-500">barra olímpica 20 kg</span>
                    </div>
                    <PlateVisual
                      totalWeight={carga.pesoAjustado}
                      theoreticalWeight={carga.teorico}
                      barWeight={20}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Conclusão de treino (sem campo de feedback, vai direto para PSE) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          {!hasStarted && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
              <span>Inicie o cronômetro no topo da tela para poder concluir o treino.</span>
            </div>
          )}

          {generalError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>{generalError}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={handleFinishWorkout}
              disabled={!hasStarted || finishing}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Concluir Treino e Avaliar Esforço (PSE)</span>
              {finishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
