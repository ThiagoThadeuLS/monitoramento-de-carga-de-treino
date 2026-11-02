import React, { useState, useEffect, useRef } from 'react';
import { Flame, HeartPulse, Scale, ShieldAlert, LogOut, Loader2, User, CalendarDays, History, Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { TERMS_VERSION, TermsGate } from './TermsGate';
import { AthleteHistory } from './AthleteHistory';
import { todayLocalISO } from '../lib/date';
import { TrainingSchedule } from './coach/TrainingSchedule';
import { AdversaryManagement } from './coach/AdversaryManagement';
import { RemindersCard } from './RemindersCard';
import { PushState, getPushState, isMobileDevice, relinkPush } from '../lib/push';
import { NotificationGate } from './NotificationGate';
import { HelpButton, Tour } from './tour/Tour';
import { athleteTourSteps } from './tour/steps';
import { athleteTutorialPending, markAthleteTutorialDone } from '../lib/tutorial';
import { useClub } from '../lib/club';
import { PseForm } from './PseForm';
import { PsrForm } from './PsrForm';
import { WeightForm } from './WeightForm';
import { AthleteLogin } from './AthleteLogin';
import { AthleteChangePassword } from './AthleteChangePassword';
import { PseRecord, PsrRecord, WeightRecord } from '../types';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  AthleteSession,
  getAthleteSchedule,
  getTermsStatus,
  logoutAthlete,
  restoreAthleteSession,
  submitPse,
  submitPsr,
  submitWeight,
} from '../lib/athleteAuth';

type AthleteTab = 'pse' | 'psr' | 'weight' | 'schedule' | 'history' | 'adversarios';

const ATHLETE_TABS: { id: AthleteTab; label: string; short: string; icon: typeof Flame; active: string }[] = [
  { id: 'pse', label: 'PSE (Esforço)', short: 'PSE', icon: Flame, active: 'bg-orange-500 text-slate-950 shadow-md shadow-orange-500/20' },
  { id: 'psr', label: 'PSR (Bem-Estar)', short: 'PSR', icon: HeartPulse, active: 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' },
  { id: 'weight', label: 'Peso', short: 'Peso', icon: Scale, active: 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20' },
  { id: 'schedule', label: 'Cronograma', short: 'Agenda', icon: CalendarDays, active: 'bg-violet-500 text-slate-950 shadow-md shadow-violet-500/20' },
  { id: 'adversarios', label: 'Adversários', short: 'Rivais', icon: Shield, active: 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' },
  { id: 'history', label: 'Histórico', short: 'Hist.', icon: History, active: 'bg-slate-200 text-slate-950 shadow-md shadow-slate-200/20' },
];

// Aba pedida pelo link da notificação (?aba=...), lida uma única vez quando o app abre
const INITIAL_TAB: AthleteTab | null = (() => {
  const map: Record<string, AthleteTab> = { pse: 'pse', psr: 'psr', peso: 'weight', agenda: 'schedule', adversarios: 'adversarios' };
  return map[new URLSearchParams(window.location.search).get('aba') ?? ''] ?? null;
})();

const MOBILE = isMobileDevice();

export const AthleteArea: React.FC = () => {
  const [session, setSession] = useState<AthleteSession | null>(null);
  const { setClub } = useClub();

  // Referência para o container de abas roláveis com setas
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsScrollRef.current) {
      const { scrollLeft, clientWidth } = tabsScrollRef.current;
      const offset = direction === 'left' ? -clientWidth / 2 : clientWidth / 2;
      tabsScrollRef.current.scrollTo({ left: scrollLeft + offset, behavior: 'smooth' });
    }
  };

  // Notificações neste aparelho: confere o estado e religa ao atleta que entrou (sem perguntar de novo)
  const [pushState, setPushState] = useState<PushState | null>(null);
  const passwordToken = session && !session.mustChangePassword ? session.token : null;

  // Termo de uso dos dados (LGPD): aceito uma vez, antes de usar o app
  const [terms, setTerms] = useState<{ accepted_at: string | null; version: string | null } | null>(null);
  useEffect(() => {
    setTerms(null);
    if (!passwordToken) return;
    let cancelled = false;
    getTermsStatus(passwordToken)
      .then((t) => !cancelled && setTerms(t))
      .catch(() => !cancelled && setTerms({ accepted_at: null, version: null }));
    return () => {
      cancelled = true;
    };
  }, [passwordToken]);
  const termsOk = !!terms?.accepted_at && terms.version === TERMS_VERSION;
  const readyToken = passwordToken && termsOk ? passwordToken : null;

  // Duração dos treinos de hoje (sugestão no campo de duração da PSE)
  const [scheduledDurations, setScheduledDurations] = useState<Record<string, number>>({});
  const [suggestedType, setSuggestedType] = useState<string | undefined>();
  useEffect(() => {
    if (!readyToken) return;
    const today = todayLocalISO();
    getAthleteSchedule(readyToken, today, today)
      .then((list) => {
        const now = new Date().toTimeString().slice(0, 5);
        const map: Record<string, number> = {};
        // o treino daquele tipo que já começou mais recentemente (senão, o primeiro do dia)
        const sorted = [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
        for (const t of sorted) {
          const [h1, m1] = t.start_time.split(':').map(Number);
          const [h2, m2] = (t.end_time ?? '').split(':').map(Number);
          const min = t.end_time ? h2 * 60 + m2 - (h1 * 60 + m1) : 90;
          if (min > 0 && (map[t.training_type] === undefined || t.start_time.slice(0, 5) <= now)) map[t.training_type] = min;
        }
        setScheduledDurations(map);
        const started = sorted.filter((t) => t.start_time.slice(0, 5) <= now);
        setSuggestedType((started[started.length - 1] ?? sorted[0])?.training_type);
      })
      .catch(() => undefined);
  }, [readyToken]);

  // Tour: aparece sozinho no primeiro acesso; depois, pelo botão "?"
  const [tutorial, setTutorial] = useState(false);
  const readyAthleteId = readyToken ? session!.athlete.id : null;
  useEffect(() => {
    if (!readyToken || !readyAthleteId) return;
    let cancelled = false;
    athleteTutorialPending(readyToken, readyAthleteId).then((p) => !cancelled && p && setTutorial(true));
    return () => {
      cancelled = true;
    };
  }, [readyToken, readyAthleteId]);
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
        if (st === 'on') relinkPush(readyToken);
      })
      .catch(() => !cancelled && setPushState('unsupported'));
    return () => {
      cancelled = true;
    };
  }, [readyToken]);

  // Cabeçalho mostra o clube do atleta logado
  useEffect(() => {
    setClub(session?.club ?? null);
  }, [session?.club?.id]);
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured);
  const [notice, setNotice] = useState<string | null>(null);
  // Ao tocar numa notificação o app abre com ?aba=pse|psr|peso (lido uma vez ao carregar)
  const [activeTab, setActiveTab] = useState<AthleteTab>(INITIAL_TAB ?? 'pse');
  useEffect(() => {
    if (INITIAL_TAB) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  // Retoma a sessão salva neste aparelho (atleta não precisa logar todo dia)
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    restoreAthleteSession()
      .then(setSession)
      .catch((err) => setNotice(err.message))
      .finally(() => setCheckingSession(false));
  }, []);

  const handleLogout = async () => {
    // As notificações continuam ativas no aparelho (permanente); só a sessão é encerrada
    if (session) await logoutAthlete(session.token).catch(() => undefined);
    setSession(null);
    setActiveTab('pse');
  };

  // Envia o registro; o banco identifica o atleta pelo token da sessão
  const submitWith = async <T,>(
    send: (token: string, record: T) => Promise<void>,
    { athlete_id: _ignored, ...record }: T & { athlete_id: string }
  ): Promise<boolean> => {
    if (!session) return false;
    try {
      await send(session.token, record as unknown as T);
      return true;
    } catch (err: any) {
      console.error('Erro ao salvar no Supabase:', err);
      if (err.code === 'sessao_invalida' || err.code === 'troca_de_senha_pendente') {
        setNotice(err.message);
        setSession(null);
      } else if (err.code === 'termo_pendente') {
        setTerms({ accepted_at: null, version: null });
      }
      return false;
    }
  };

  const handlePseSubmit = (record: Omit<PseRecord, 'id' | 'created_at'>) => submitWith(submitPse, record);
  const handlePsrSubmit = (record: Omit<PsrRecord, 'id' | 'created_at'>) => submitWith(submitPsr, record);
  const handleWeightSubmit = (record: Omit<WeightRecord, 'id' | 'created_at'>) => submitWith(submitWeight, record);

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

  // Primeiro acesso (ou senha resetada pelo treinador): troca obrigatória
  if (session.mustChangePassword) {
    return (
      <AthleteChangePassword
        session={session}
        onPasswordChanged={setSession}
        onLogout={handleLogout}
      />
    );
  }

  // Termo de uso dos dados (LGPD)
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

  // Celular: só usa o app depois de aceitar as notificações
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <HelpButton onClick={() => setTutorial(true)} />
      {tutorial && <Tour steps={athleteTourSteps(athlete.nome, setActiveTab)} onClose={finishTutorial} />}
      {/* 1. Atleta logado */}
      <div data-tour="athlete-card" className="w-full bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-xl backdrop-blur flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white truncate">{athlete.nome}</p>
            <p className="text-xs text-slate-400">
              {[athlete.classe && `Classe ${athlete.classe}`, athlete.categoria].filter(Boolean).join(' • ') || 'Atleta'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700/60 text-xs font-bold transition-all flex-shrink-0"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </button>
      </div>

      {/* Lembretes no celular */}
      {/* Computador: lembretes opcionais (no celular já são obrigatórios) */}
      {!MOBILE && <RemindersCard token={session.token} />}

      {/* 2. Abas com setas de rolagem lateral */}
      <div className="relative flex items-center p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl">
        {/* Seta Esquerda */}
        <button
          type="button"
          onClick={() => scrollTabs('left')}
          className="absolute left-0 z-10 p-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-300 rounded-full shadow-md border border-slate-700 backdrop-blur-sm -ml-2 sm:flex items-center justify-center transition-all hidden"
          title="Rolar para esquerda"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Container rolável das abas */}
        <div
          ref={tabsScrollRef}
          data-tour="athlete-tabs"
          className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none px-2 sm:px-6 w-full scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {ATHLETE_TABS.map(({ id, label, short, icon: Icon, active }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`py-3 px-3 sm:px-4 rounded-xl text-[11px] sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all flex-shrink-0 ${
                activeTab === id ? active : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="sm:hidden truncate">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Seta Direita */}
        <button
          type="button"
          onClick={() => scrollTabs('right')}
          className="absolute right-0 z-10 p-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-300 rounded-full shadow-md border border-slate-700 backdrop-blur-sm -mr-2 sm:flex items-center justify-center transition-all hidden"
          title="Rolar para direita"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 3. Conteúdo das abas */}
      {activeTab === 'history' ? (
        <div data-tour="athlete-history">
          <AthleteHistory
            token={session.token}
            athleteId={athlete.id}
            clubName={session.club?.nome ?? 'seu clube'}
            termsAcceptedAt={terms.accepted_at}
            onCorrect={(k) => setActiveTab(k === 'pse' ? 'pse' : k === 'psr' ? 'psr' : 'weight')}
          />
        </div>
      ) : activeTab === 'schedule' ? (
        <div data-tour="athlete-schedule">
          <TrainingSchedule
            readOnly
            listOnly
            fetchSessions={(from, to) => getAthleteSchedule(session.token, from, to)}
          />
        </div>
      ) : activeTab === 'adversarios' ? (
        <div data-tour="athlete-adversaries">
          <AdversaryManagement />
        </div>
      ) : (
      <div data-tour="athlete-form" className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur">
        {activeTab === 'pse' && (
          <PseForm athleteId={athlete.id} athleteName={athlete.nome} onSubmit={handlePseSubmit} scheduledDurations={scheduledDurations} suggestedType={suggestedType} />
        )}
        {activeTab === 'psr' && (
          <PsrForm athleteId={athlete.id} athleteName={athlete.nome} onSubmit={handlePsrSubmit} />
        )}
        {activeTab === 'weight' && (
          <WeightForm athleteId={athlete.id} athleteName={athlete.nome} onSubmit={handleWeightSubmit} />
        )}
      </div>
      )}
    </div>
  );
};