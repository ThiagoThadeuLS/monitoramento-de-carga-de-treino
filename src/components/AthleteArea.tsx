import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { lazyNamed } from '../lib/lazy';
import { ArrowLeft, CalendarDays, HelpCircle, History, Home, Loader2, LogOut, Shield, ShieldAlert, Trophy } from 'lucide-react';
import { TERMS_VERSION, TermsGate } from './TermsGate';
import { isPhysicalTraining, PHYSICAL_TRAINING } from '../data/constants';
import { useDialogs } from './ui/Dialogs';
import { RemindersCard } from './RemindersCard';
import { PushState, getPushState, isMobileDevice, relinkPush } from '../lib/push';
import { NotificationGate } from './NotificationGate';
import { athleteTourSteps } from './tour/steps';
import { athleteTutorialPending, markAthleteTutorialDone } from '../lib/tutorial';
import { useClub } from '../lib/club';
import { PseForm } from './PseForm';
import { PsrForm } from './PsrForm';
import { WeightForm } from './WeightForm';
import { AthleteLogin } from './AthleteLogin';
import { AthleteChangePassword } from './AthleteChangePassword';
import { AthleteToday, TodayAction, sessionMinutes } from './athlete/AthleteToday';
import { AthleteCompetitionList } from './athlete/AthleteCompetitionList';
import { Avatar } from './ui/Avatar';
import { PseRecord, PsrRecord, WeightRecord } from '../types';
import { isSupabaseConfigured } from '../lib/supabase';
import { useHistoryState } from '../lib/navigation';
import { useTodayISO } from '../lib/useToday';
import { nowTimeHM } from '../lib/date';
import {
  AthleteHome,
  AthleteSession,
  getAthleteHome,
  getAthleteSchedule,
  getTermsStatus,
  logoutAthlete,
  restoreAthleteSession,
  submitPse,
  submitPsr,
  submitWeight,
} from '../lib/athleteAuth';

// Telas abertas de vez em quando: baixadas só quando o atleta abre (app mais leve)
const named = lazyNamed;
const loadSchedule = () => import('./coach/TrainingSchedule');
const loadAdversaries = () => import('./coach/AdversaryManagement');
const loadHistory = () => import('./AthleteHistory');
const loadPrs = () => import('./AthletePrView');
const loadWorkout = () => import('./AthletePhysicalWorkoutExecution');
const loadCompetition = () => import('./AthleteCompetitionCard');
const loadTour = () => import('./tour/Tour');
const TrainingSchedule = named(loadSchedule, (m) => m.TrainingSchedule);
const AdversaryManagement = named(loadAdversaries, (m) => m.AdversaryManagement);
const AthleteHistory = named(loadHistory, (m) => m.AthleteHistory);
const AthletePrView = named(loadPrs, (m) => m.AthletePrView);
const AthletePhysicalWorkoutExecution = named(loadWorkout, (m) => m.AthletePhysicalWorkoutExecution);
const AthleteCompetitionCard = named(loadCompetition, (m) => m.AthleteCompetitionCard);
const Tour = named(loadTour, (m) => m.Tour);

type View = 'hoje' | 'agenda' | 'historico' | 'prs' | 'rivais';

/** Tela aberta por cima da área (formulário ou ficha do treino físico) */
type Overlay =
  | { kind: 'psr' }
  | { kind: 'peso' }
  | { kind: 'pse'; trainingType?: string; duration?: number }
  | { kind: 'treino'; id: string; name: string }
  | null;

const VIEWS: { id: View; label: string; icon: typeof Home }[] = [
  { id: 'hoje', label: 'Hoje', icon: Home },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'historico', label: 'Histórico', icon: History },
  { id: 'prs', label: 'PRs', icon: Trophy },
  { id: 'rivais', label: 'Rivais', icon: Shield },
];

// Link dos lembretes (/?aba=...): abre direto o formulário certo
const INITIAL = (() => {
  const aba = new URLSearchParams(window.location.search).get('aba') ?? '';
  const overlay: Overlay =
    aba === 'pse' ? { kind: 'pse' } : aba === 'psr' ? { kind: 'psr' } : aba === 'peso' ? { kind: 'peso' } : null;
  const view: View =
    aba === 'agenda' ? 'agenda' : aba === 'prs' ? 'prs' : aba === 'adversarios' ? 'rivais' : aba === 'historico' ? 'historico' : 'hoje';
  return { aba, overlay, view };
})();

const MOBILE = isMobileDevice();

const Spinner = () => (
  <div className="py-16 flex justify-center">
    <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
  </div>
);

export const AthleteArea: React.FC = () => {
  const [session, setSession] = useState<AthleteSession | null>(null);
  const { setClub } = useClub();
  const { notify } = useDialogs();
  const today = useTodayISO();

  const [view, setViewRaw] = useHistoryState<View>('atleta_aba', INITIAL.view);
  const [overlay, setOverlayRaw] = useHistoryState<Overlay>('atleta_tela', INITIAL.overlay);
  const currentView: View = VIEWS.some((v) => v.id === view) ? view : 'hoje';
  // Abas já abertas ficam montadas (trocar de volta é instantâneo)
  const [visited, setVisited] = useState<Set<View>>(() => new Set<View>(['hoje', currentView]));
  const setView = (v: View) => {
    setVisited((cur) => (cur.has(v) ? cur : new Set(cur).add(v)));
    setViewRaw(v);
  };
  useEffect(() => {
    setVisited((cur) => (cur.has(currentView) ? cur : new Set(cur).add(currentView)));
  }, [currentView]);

  // Fechar a tela aberta: volta no histórico quantos passos ela abriu (o "voltar" do celular
  // volta um de cada vez). Ex.: ficha do treino -> PSE = 2 passos.
  const overlayDepth = useRef(0);
  const openOverlay = (o: Overlay) => {
    overlayDepth.current += 1;
    setOverlayRaw(o);
  };
  const closeOverlay = useCallback(() => {
    const depth = overlayDepth.current;
    overlayDepth.current = 0;
    if (depth > 0) window.history.go(-depth);
    else setOverlayRaw(null);
  }, [setOverlayRaw]);
  useEffect(() => {
    const onPop = () => {
      overlayDepth.current = Math.max(0, overlayDepth.current - 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (INITIAL.aba) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  const [pushState, setPushState] = useState<PushState | null>(null);
  const passwordToken = session && !session.mustChangePassword ? session.token : null;

  // Termo de uso: já vem com a sessão (bancos antigos: busca à parte)
  const [terms, setTerms] = useState<{ accepted_at: string | null; version: string | null } | null>(null);
  const sessionTerms = session?.terms;
  useEffect(() => {
    if (!passwordToken) {
      setTerms(null);
      return;
    }
    if (sessionTerms) {
      setTerms(sessionTerms);
      return;
    }
    let cancelled = false;
    setTerms(null);
    getTermsStatus(passwordToken)
      .then((t) => !cancelled && setTerms(t))
      .catch(() => !cancelled && setTerms({ accepted_at: null, version: null }));
    return () => {
      cancelled = true;
    };
  }, [passwordToken, sessionTerms]);
  const termsOk = !!terms?.accepted_at && terms.version === TERMS_VERSION;
  const readyToken = passwordToken && termsOk ? passwordToken : null;

  // Tela "Hoje": uma consulta só; recarrega ao enviar algo, ao virar o dia e ao voltar para o app
  const [home, setHome] = useState<AthleteHome | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState('');
  const [homeVersion, setHomeVersion] = useState(0);
  const reloadHome = useCallback(() => setHomeVersion((v) => v + 1), []);
  useEffect(() => {
    if (!readyToken) {
      setHome(null);
      return;
    }
    let cancelled = false;
    setHomeLoading(true);
    setHomeError('');
    getAthleteHome(readyToken)
      .then((h) => !cancelled && setHome(h))
      .catch((err) => {
        if (cancelled) return;
        setHomeError(
          err?.code === 'migracao_pendente' ? 'A tela "Hoje" ainda não foi ativada no banco. Avise a comissão técnica.' : err?.message ?? 'Não foi possível carregar.'
        );
        if (err?.code === 'sessao_invalida') setSession(null);
      })
      .finally(() => !cancelled && setHomeLoading(false));
    return () => {
      cancelled = true;
    };
  }, [readyToken, homeVersion, today]);
  useEffect(() => {
    if (!readyToken) return;
    const onVisible = () => document.visibilityState === 'visible' && reloadHome();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [readyToken, reloadHome]);

  // Depois de carregar o "Hoje", baixa as outras telas em segundo plano (troca de aba sem espera)
  useEffect(() => {
    if (!home) return;
    const t = window.setTimeout(() => {
      [loadSchedule, loadHistory, loadWorkout, loadCompetition, loadAdversaries, loadPrs].forEach((l) => l().catch(() => undefined));
    }, 1500);
    return () => window.clearTimeout(t);
  }, [home]);

  const [tutorial, setTutorial] = useState(false);
  const readyAthleteId = readyToken ? session!.athlete.id : null;
  const tutorialFlag = session?.tutorialPending;
  useEffect(() => {
    if (!readyToken || !readyAthleteId || tutorialFlag === false) return;
    let cancelled = false;
    athleteTutorialPending(readyToken, readyAthleteId).then((p) => !cancelled && p && setTutorial(true));
    return () => {
      cancelled = true;
    };
  }, [readyToken, readyAthleteId, tutorialFlag]);
  const finishTutorial = () => {
    setTutorial(false);
    if (readyToken && readyAthleteId) markAthleteTutorialDone(readyToken, readyAthleteId).catch(() => undefined);
  };

  useEffect(() => {
    if (!readyToken) return;
    let cancelled = false;
    getPushState()
      .then((st) => {
        if (cancelled) return;
        setPushState(st);
        // Assinatura recusada pelo serviço de notificações: volta a pedir para ativar
        if (st === 'on') {
          relinkPush(readyToken).then((r: any) => {
            if (!cancelled && r === 'expired') setPushState('off');
          });
        }
      })
      .catch(() => !cancelled && setPushState('unsupported'));
    return () => {
      cancelled = true;
    };
  }, [readyToken]);

  const sessionClub = session?.club ?? null;
  useEffect(() => {
    setClub(sessionClub);
  }, [sessionClub, setClub]);
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    restoreAthleteSession()
      .then(setSession)
      .catch((err) => setNotice(err.message))
      .finally(() => setCheckingSession(false));
  }, []);

  const handleLogout = async () => {
    if (session) await logoutAthlete(session.token).catch(() => undefined);
    setSession(null);
    setHome(null);
    setOverlayRaw(null);
    setViewRaw('hoje');
  };

  /** Envia a resposta. Devolve null se deu certo, ou a mensagem de erro para o formulário. */
  const submitWith = async <T,>(
    send: (token: string, record: T) => Promise<void>,
    { athlete_id: _ignored, ...record }: T & { athlete_id: string }
  ): Promise<string | null> => {
    if (!session) return 'Sua sessão expirou. Entre novamente.';
    try {
      await send(session.token, record as unknown as T);
      return null;
    } catch (err: any) {
      if (err.code === 'sessao_invalida' || err.code === 'troca_de_senha_pendente') {
        setNotice(err.message);
        setSession(null);
      } else if (err.code === 'termo_pendente') {
        setTerms({ accepted_at: null, version: null });
      }
      return err?.message || 'Erro ao registrar resposta. Tente novamente.';
    }
  };

  // Deu certo: atualiza o "Hoje" e fecha o formulário depois de mostrar a confirmação
  const [weightVersion, setWeightVersion] = useState(0);
  const afterSubmit = (error: string | null, kind?: 'peso') => {
    if (!error) {
      reloadHome();
      if (kind === 'peso') setWeightVersion((v) => v + 1);
      window.setTimeout(closeOverlay, 1200);
    }
    return error;
  };
  const handlePseSubmit = async (record: Omit<PseRecord, 'id' | 'created_at'>) => afterSubmit(await submitWith(submitPse, record));
  const handlePsrSubmit = async (record: Omit<PsrRecord, 'id' | 'created_at'>) => afterSubmit(await submitWith(submitPsr, record));
  const handleWeightSubmit = async (record: Omit<WeightRecord, 'id' | 'created_at'>) => afterSubmit(await submitWith(submitWeight, record), 'peso');

  if (!isSupabaseConfigured) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-amber-300 text-sm">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-bold">Supabase não configurado.</span> Adicione as credenciais no arquivo{' '}
            <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-200">.env</code> para liberar o login dos atletas.
          </div>
        </div>
      </div>
    );
  }

  if (checkingSession) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        <p className="text-sm font-medium">Carregando...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <>
        {notice && (
          <div className="max-w-md mx-auto px-4 pt-6 -mb-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-amber-300 text-xs">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 text-amber-400" />
              <span>{notice}</span>
            </div>
          </div>
        )}
        <AthleteLogin
          onLoginSuccess={(s) => {
            setNotice(null);
            setSession(s);
          }}
        />
      </>
    );
  }

  if (session.mustChangePassword) {
    return <AthleteChangePassword session={session} onPasswordChanged={setSession} onLogout={handleLogout} />;
  }

  if (!terms) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }
  if (!termsOk) {
    return (
      <TermsGate
        token={session.token}
        clubName={session.club?.nome ?? 'seu clube'}
        onAccepted={() => setTerms({ accepted_at: new Date().toISOString(), version: TERMS_VERSION })}
        onLogout={handleLogout}
      />
    );
  }

  if (MOBILE && pushState !== 'on') {
    if (pushState === null) {
      return (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        </div>
      );
    }
    return <NotificationGate token={session.token} state={pushState} onStateChange={setPushState} onLogout={handleLogout} />;
  }

  const { athlete } = session;
  const token = session.token;

  // Duração programada de cada tipo de treino de hoje (sugestão na PSE)
  const scheduledDurations: Record<string, number> = {};
  for (const s of home?.sessions ?? []) {
    const min = sessionMinutes(s);
    if (min && scheduledDurations[s.training_type] === undefined) scheduledDurations[s.training_type] = min;
  }

  const onTodayAction = (a: TodayAction) => openOverlay(a);

  // PSE sem treino escolhido: sugere o último treino de hoje que já começou
  const now = nowTimeHM();
  const started = (home?.sessions ?? []).filter((s) => s.start_time.slice(0, 5) <= now);
  const autoType = (started[started.length - 1] ?? home?.sessions[0])?.training_type;

  const overlayTitle =
    overlay?.kind === 'psr'
      ? 'Bem-estar (PSR)'
      : overlay?.kind === 'peso'
      ? 'Peso'
      : overlay?.kind === 'pse'
      ? 'PSE (esforço do treino)'
      : '';

  const renderOverlay = () => {
    if (!overlay) return null;
    if (overlay.kind === 'treino') {
      return (
        <AthletePhysicalWorkoutExecution
          token={token}
          athleteId={athlete.id}
          sessionId={overlay.id}
          sessionName={overlay.name}
          onFinishAndGoToPse={(durationMinutes: number) => {
            reloadHome();
            // Ficha concluída: abre a PSE com a duração cronometrada
            openOverlay({ kind: 'pse', trainingType: PHYSICAL_TRAINING, duration: durationMinutes });
          }}
          onBack={closeOverlay}
        />
      );
    }
    return (
      <div className="space-y-4">
        <button type="button" onClick={closeOverlay} className="flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Voltar
          <span className="text-slate-500 font-medium">• {overlayTitle}</span>
        </button>
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur">
          {overlay.kind === 'pse' && (
            <PseForm
              athleteId={athlete.id}
              athleteName={athlete.nome}
              onSubmit={handlePseSubmit}
              scheduledDurations={scheduledDurations}
              suggestedType={overlay.trainingType ?? autoType}
              skipTrainingType={overlay.trainingType}
              initialDuration={overlay.duration}
            />
          )}
          {overlay.kind === 'psr' && <PsrForm athleteId={athlete.id} athleteName={athlete.nome} onSubmit={handlePsrSubmit} />}
          {overlay.kind === 'peso' && (
            <WeightForm athleteId={athlete.id} athleteName={athlete.nome} lastWeight={home?.lastWeight?.weight ?? null} onSubmit={handleWeightSubmit} />
          )}
        </div>
      </div>
    );
  };

  const pane = (id: View, content: React.ReactNode) =>
    visited.has(id) ? (
      <div hidden={currentView !== id || !!overlay}>
        <Suspense fallback={<Spinner />}>{content}</Suspense>
      </div>
    ) : null;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-28 space-y-5">
      {tutorial && (
        <Suspense fallback={null}>
          <Tour steps={athleteTourSteps(athlete.nome, (v) => { setOverlayRaw(null); setView(v); })} onClose={finishTutorial} />
        </Suspense>
      )}

      <div data-tour="athlete-card" className="w-full bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3.5 shadow-xl backdrop-blur flex items-center gap-3">
        <Avatar
          name={athlete.nome}
          src={athlete.photo_url}
          className="w-10 h-10"
          textClassName="text-sm"
          roundedClassName="rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white truncate">{athlete.nome}</p>
          <p className="text-xs text-slate-400">
            {[athlete.classe && `Classe ${athlete.classe}`, athlete.categoria].filter(Boolean).join(' • ') || 'Atleta'}
          </p>
        </div>
        <button
          type="button"
          data-tour="help"
          onClick={() => setTutorial(true)}
          className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white border border-slate-700/60 flex-shrink-0"
          title="Como usar o app"
          aria-label="Como usar o app"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700/60 text-xs font-bold transition-all flex-shrink-0"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </button>
      </div>

      {!MOBILE && <RemindersCard token={token} />}

      <Suspense fallback={<Spinner />}>
        {overlay && renderOverlay()}

        {pane(
          'hoje',
          <AthleteToday
            home={home}
            loading={homeLoading}
            error={homeError}
            onReload={reloadHome}
            onAction={onTodayAction}
            competitionCard={
              <Suspense fallback={null}>
                <AthleteCompetitionCard
                  token={readyToken}
                  refreshKey={weightVersion}
                  weighedToday={!!home?.weight}
                  canRegisterWeight={!!home?.weighDay}
                  onRegisterWeight={() => openOverlay({ kind: 'peso' })}
                />
              </Suspense>
            }
          />
        )}

        {pane(
          'agenda',
          <div data-tour="athlete-schedule" className="space-y-4">
            <AthleteCompetitionList token={token} today={today} />
            <TrainingSchedule
              readOnly
              listOnly
              fetchSessions={(from: string, to: string) => getAthleteSchedule(token, from, to)}
              onSelectSession={(s: { id: string; name?: string; training_type: string }) => {
                if (isPhysicalTraining(s.training_type)) openOverlay({ kind: 'treino', id: s.id, name: s.name || 'Treino Físico' });
                else notify('Só os treinos físicos têm ficha de execução.', 'info');
              }}
            />
          </div>
        )}

        {pane(
          'historico',
          <div data-tour="athlete-history">
            <AthleteHistory
              token={token}
              athleteId={athlete.id}
              clubName={session.club?.nome ?? 'seu clube'}
              termsAcceptedAt={terms.accepted_at}
              onCorrect={(k: 'pse' | 'psr' | 'peso') => {
                reloadHome();
                openOverlay(k === 'pse' ? { kind: 'pse' } : k === 'psr' ? { kind: 'psr' } : { kind: 'peso' });
              }}
            />
          </div>
        )}

        {pane(
          'prs',
          <div data-tour="athlete-prs">
            <AthletePrView token={token} />
          </div>
        )}

        {pane(
          'rivais',
          <div data-tour="athlete-adversaries">
            <AdversaryManagement athleteToken={token} />
          </div>
        )}
      </Suspense>

      {/* Navegação fixa embaixo */}
      <nav
        data-tour="athlete-nav"
        className="fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-2xl mx-auto grid grid-cols-5">
          {VIEWS.map(({ id, label, icon: Icon }) => {
            const active = currentView === id && !overlay;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (overlay) {
                    overlayDepth.current = 0;
                    setOverlayRaw(null);
                  }
                  setView(id);
                }}
                className={`py-2.5 flex flex-col items-center gap-1 text-[11px] font-bold transition-colors ${
                  active ? 'text-sky-400' : 'text-slate-400 hover:text-white'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
