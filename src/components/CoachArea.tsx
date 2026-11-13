import React, { Suspense, useEffect, useRef, useState } from 'react';
import {
  LogOut, BarChart3, Users, Loader2, LineChart, CalendarDays, Shield, AlertTriangle, UserCog, Settings2, UsersRound, Palette, Gauge,
  Dumbbell, Trophy, Home, Activity, BellRing,
} from 'lucide-react';
import { InHeader } from '../lib/headerSlot';
import { AthleteSearch, CoachMenu } from './coach/CoachMenu';
import { AnalysisFilter, AnalysisFilterValue, initialAnalysisFilter } from './coach/AnalysisFilter';
import { exitSupport } from '../lib/platform';
import { HelpButton } from './tour/HelpButton';
import { coachTourSteps } from './tour/steps';
import { coachTutorialPending, markCoachTutorialDone } from '../lib/tutorial';
import { CoachChangePassword } from './CoachChangePassword';
import { ClubInfo, useClub } from '../lib/club';
import { supabase } from '../lib/supabase';
import { CoachLogin } from './CoachLogin';
import { Athlete } from '../types';
import { uploadPhoto } from '../lib/photos';
import { useDialogs } from './ui/Dialogs';
import { lazyNamed } from '../lib/lazy';
import { useHistoryState } from '../lib/navigation';
import { useTodayISO } from '../lib/useToday';

// Cada tela do painel é baixada quando o treinador abre (o app do atleta não carrega nada disso)
const DailyOverview = lazyNamed(() => import('./coach/DailyOverview'), (m) => m.DailyOverview);
const CompetitionRiskCard = lazyNamed(() => import('./coach/CompetitionRiskCard'), (m) => m.CompetitionRiskCard);
const PeriodAnalysis = lazyNamed(() => import('./coach/PeriodAnalysis'), (m) => m.PeriodAnalysis);
const LoadAnalysis = lazyNamed(() => import('./coach/LoadAnalysis'), (m) => m.LoadAnalysis);
const TrainingSchedule = lazyNamed(() => import('./coach/TrainingSchedule'), (m) => m.TrainingSchedule);
const PhysicalWorkoutBuilder = lazyNamed(() => import('./coach/PhysicalWorkoutBuilder'), (m) => m.PhysicalWorkoutBuilder);
const BodyComposition = lazyNamed(() => import('./coach/BodyComposition'), (m) => m.BodyComposition);
const CompetitionManagement = lazyNamed(() => import('./coach/CompetitionManagement'), (m) => m.CompetitionManagement);
const AthleteManagement = lazyNamed(() => import('./coach/AthleteManagement'), (m) => m.AthleteManagement);
const GroupManagement = lazyNamed(() => import('./coach/GroupManagement'), (m) => m.GroupManagement);
const AdversaryManagement = lazyNamed(() => import('./coach/AdversaryManagement'), (m) => m.AdversaryManagement);
const TeamManagement = lazyNamed(() => import('./coach/TeamManagement'), (m) => m.TeamManagement);
const ThemeSettings = lazyNamed(() => import('./coach/ThemeSettings'), (m) => m.ThemeSettings);
const AthleteProfile = lazyNamed(() => import('./coach/AthleteProfile'), (m) => m.AthleteProfile);
const ReportBuilder = lazyNamed(() => import('./coach/report/ReportBuilder'), (m) => m.ReportBuilder);
const WeightReminderSettings = lazyNamed(() => import('./coach/WeightReminderSettings'), (m) => m.WeightReminderSettings);
const PushStatusCard = lazyNamed(() => import('./coach/PushStatusCard'), (m) => m.PushStatusCard);
const Tour = lazyNamed(() => import('./tour/Tour'), (m) => m.Tour);

type CoachAreaId = 'hoje' | 'analises' | 'planejamento' | 'elenco' | 'config';
type Icon = typeof BarChart3;

/** As 4 áreas do painel (+ configurações no menu do treinador) e as seções de cada uma */
const AREAS: {
  id: CoachAreaId;
  label: string;
  icon: Icon;
  adminOnly?: boolean;
  subs: { id: string; label: string; icon: Icon; adminOnly?: boolean }[];
}[] = [
  { id: 'hoje', label: 'Hoje', icon: Home, subs: [{ id: '', label: 'Hoje', icon: BarChart3 }] },
  {
    id: 'analises',
    label: 'Análises',
    icon: LineChart,
    subs: [
      { id: 'periodo', label: 'Período', icon: LineChart },
      { id: 'carga', label: 'Carga interna', icon: Gauge },
      { id: 'relatorio', label: 'Relatório', icon: BarChart3 },
    ],
  },
  {
    id: 'planejamento',
    label: 'Planejamento',
    icon: CalendarDays,
    subs: [
      { id: 'agenda', label: 'Agenda', icon: CalendarDays },
      { id: 'fisica', label: 'Prep. física', icon: Dumbbell },
      { id: 'competicoes', label: 'Competições', icon: Trophy },
    ],
  },
  {
    id: 'elenco',
    label: 'Elenco',
    icon: Users,
    subs: [
      { id: 'atletas', label: 'Atletas', icon: Users },
      { id: 'grupos', label: 'Grupos', icon: UsersRound },
      { id: 'corpo', label: 'Composição corporal', icon: Activity },
      { id: 'adversarios', label: 'Adversários', icon: Shield },
    ],
  },
  {
    id: 'config',
    label: 'Configurações',
    icon: Settings2,
    // Fica fora das 4 abas: abre pelo menu do treinador (foto no cabeçalho)
    adminOnly: false,
    subs: [
      { id: 'treinadores', label: 'Treinadores', icon: UserCog, adminOnly: true },
      { id: 'cores', label: 'Cores', icon: Palette, adminOnly: true },
      { id: 'notificacoes', label: 'Notificações', icon: BellRing },
    ],
  },
];

const Spinner = () => (
  <div className="py-16 flex justify-center">
    <Loader2 className="w-7 h-7 animate-spin text-sky-400" />
  </div>
);

type ProfileClub = ClubInfo & { status: 'ativo' | 'suspenso' };

export interface CoachProfile {
  is_owner: boolean;
  /** Dono da plataforma vendo um clube em modo suporte (somente leitura) */
  support?: { club: ProfileClub; expires_at: string } | null;
  coach: {
    nome: string;
    email: string;
    photo_url?: string | null;
    role: 'admin' | 'treinador';
    active: boolean;
    must_change_password: boolean;
    club: ProfileClub;
  } | null;
}

export const CoachArea: React.FC<{ recovery?: boolean }> = ({ recovery = false }) => {
  const [recoveryMode, setRecoveryMode] = useState(recovery);
  const { setClub } = useClub();
  const { notify } = useDialogs();
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [profileVersion, setProfileVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [athleteToEdit, setAthleteToEdit] = useState<Athlete | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [workoutSession, setWorkoutSession] = useState<string | null>(null);
  /** Período e atletas das Análises: o mesmo filtro vale para Período, Carga interna e Relatório */
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilterValue>(initialAnalysisFilter);
  const today = useTodayISO();

  // Área e seção ficam no histórico: o "voltar" do navegador volta para a tela anterior
  const [nav, setNav] = useHistoryState<{ area: CoachAreaId; sub?: string }>('treinador_nav', { area: 'hoje' });
  const lastSub = useRef<Partial<Record<CoachAreaId, string>>>({});
  const go = (area: CoachAreaId, sub?: string) => {
    const next = sub ?? lastSub.current[area];
    if (next) lastSub.current[area] = next;
    setNav({ area, sub: next });
  };
  // Telas já abertas ficam montadas (voltar a elas é instantâneo, sem buscar tudo de novo)
  const visitedRef = useRef(new Set<string>());

  const checkSession = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
    } catch (err) {
      console.error('Erro ao verificar sessão:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSession();

    if (supabase) {
      const { data: authListener } = supabase.auth.onAuthStateChange((event, currentSession) => {
        if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
        setSession(currentSession);
      });

      return () => {
        authListener.subscription.unsubscribe();
      };
    }
  }, []);

  // Perfil do treinador (clube, papel). Sem perfil não há acesso aos dados.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!supabase || !userId) {
      setProfile(null);
      setClub(null);
      return;
    }
    let cancelled = false;
    setProfileError('');
    supabase.rpc('my_profile').then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Erro ao carregar perfil:', error);
        setProfileError(
          error.message?.includes('my_profile')
            ? 'A estrutura de clubes ainda não foi ativada no banco. Rode o arquivo supabase_completo.sql no Supabase.'
            : 'Não foi possível carregar seu perfil. Tente novamente.'
        );
        setProfile({ is_owner: false, coach: null });
        return;
      }
      const p = data as CoachProfile;
      setProfile(p);
      const usable = p.coach && p.coach.active && p.coach.club.status === 'ativo';
      // Modo suporte é da Área Restrita: aqui o cabeçalho nunca mostra o clube em suporte
      setClub(!p.support && usable ? p.coach!.club : null);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, profileVersion, setClub]);

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setClub(null);
  };

  const reloadProfile = () => setProfileVersion((v) => v + 1);

  // Tour: primeiro acesso de cada treinador (depois, pelo botão "?")
  const [tutorial, setTutorial] = useState(false);
  const tutorialReady =
    !!userId && !!profile?.coach && !profile.support && profile.coach.active && profile.coach.club.status === 'ativo' && !profile.coach.must_change_password;
  useEffect(() => {
    if (!tutorialReady || !userId) return;
    let cancelled = false;
    coachTutorialPending(userId).then((p) => !cancelled && p && setTutorial(true));
    return () => {
      cancelled = true;
    };
  }, [tutorialReady, userId]);
  const finishTutorial = () => {
    setTutorial(false);
    if (userId) markCoachTutorialDone(userId).catch(() => undefined);
  };

  const handleExitSupport = async () => {
    try {
      await exitSupport();
    } finally {
      reloadProfile();
    }
  };

  const handleEditAthleteFromOverview = (athlete: Athlete) => {
    setAthleteToEdit(athlete);
    go('elenco', 'atletas');
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
        <p className="text-sm font-medium">Verificando credenciais...</p>
      </div>
    );
  }

  // Se não estiver logado, exibe a tela de login
  if (!session) {
    return (
      <CoachLogin
        onLoginSuccess={checkSession}
        notice={recoveryMode ? 'O link para criar uma senha nova expirou ou já foi usado. Peça outro em "Esqueci minha senha".' : undefined}
      />
    );
  }

  // Veio do e-mail "esqueci minha senha": cria a senha nova antes de entrar
  if (recoveryMode) {
    return (
      <CoachChangePassword
        nome={session.user?.email ?? ''}
        title="Crie sua senha nova"
        subtitle={`Conta ${session.user?.email ?? ''}. Depois de salvar, você entra direto no painel.`}
        onChanged={() => {
          setRecoveryMode(false);
          window.history.replaceState(null, '', window.location.pathname);
          reloadProfile();
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (!profile) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
        <p className="text-sm font-medium">Carregando seu clube...</p>
      </div>
    );
  }

  const support = profile.support ?? null;
  const coach = profile.coach;
  const coachUsable = !!coach && coach.active && coach.club.status === 'ativo';

  // Primeiro acesso com senha temporária: troca obrigatória antes de ver qualquer dado
  if (!support && coachUsable && coach!.must_change_password) {
    return <CoachChangePassword nome={coach!.nome} onChanged={reloadProfile} onLogout={handleLogout} />;
  }

  // Modo suporte ativo (Área Restrita): o painel do clube fica bloqueado até sair do suporte,
  // senão os dados do clube em suporte apareceriam aqui
  if (support) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-slate-900/90 border border-amber-900/60 rounded-3xl p-6 space-y-4 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <p className="text-sm text-slate-200">
            Esta conta está em <strong>modo suporte</strong> no clube {support.club.nome}. Saia do modo suporte para usar o painel do seu clube.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button type="button" onClick={handleExitSupport} className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold">
              Sair do modo suporte
            </button>
            <button type="button" onClick={handleLogout} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold">
              <LogOut className="w-4 h-4" /> Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sem clube utilizável: mostra o motivo (donos sem clube usam a Área Restrita)
  const blocked =
    profileError ||
    (coachUsable
      ? ''
      : !coach
      ? 'Sua conta não está vinculada a nenhum clube. Fale com o administrador do seu clube.'
      : !coach.active
      ? 'Sua conta de treinador foi desativada pelo administrador do clube.'
      : `O acesso do clube ${coach.club.nome} está suspenso. Fale com o suporte da plataforma.`);

  if (blocked) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-4 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <p className="text-sm text-slate-300">{blocked}</p>
          <p className="text-xs text-slate-500">Conectado como {session.user?.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </div>
    );
  }

  const viewClub = coach!.club;
  const isAdmin = coach!.role === 'admin';
  const areaDef = AREAS.find((a) => a.id === nav.area && (!a.adminOnly || isAdmin)) ?? AREAS[0];
  const subs = areaDef.subs.filter((s) => !s.adminOnly || isAdmin);
  const sub = subs.find((s) => s.id === nav.sub) ?? subs[0];
  const paneKey = `${areaDef.id}/${sub?.id ?? ''}`;

  visitedRef.current.add(paneKey);
  const visited = visitedRef.current;

  const pane = (key: string, content: React.ReactNode) =>
    visited.has(key) ? (
      <div key={key} hidden={paneKey !== key}>
        <Suspense fallback={<Spinner />}>{content}</Suspense>
      </div>
    ) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <HelpButton onClick={() => setTutorial(true)} />
      {tutorial && (
        <Suspense fallback={null}>
          <Tour steps={coachTourSteps(coach!.nome, isAdmin, (area, s) => go(area as CoachAreaId, s))} onClose={finishTutorial} />
        </Suspense>
      )}
      {/* No cabeçalho do topo: busca de atleta e menu do treinador (foto, configurações, sair) */}
      <InHeader>
        <AthleteSearch clubId={viewClub.id} onOpen={setProfileId} />
        <CoachMenu
          nome={coach!.nome}
          photoUrl={coach!.photo_url}
          isAdmin={isAdmin}
          clubName={viewClub.nome}
          onPickPhoto={async (file) => {
            if (!userId) return;
            await uploadPhoto('coach', userId, viewClub.id, file);
            notify('Foto atualizada.', 'success');
            reloadProfile();
          }}
          onPhotoError={(message) => notify(message, 'error')}
          onSettings={() => go('config')}
          onLogout={handleLogout}
        />
      </InHeader>

      {/* Áreas: 4 fixas (as configurações abrem pelo menu do treinador) */}
      <nav data-tour="coach-tabs" className="grid grid-cols-4 gap-1 p-1 bg-slate-900/90 border border-slate-800 rounded-2xl">
        {AREAS.filter((a) => a.id !== 'config').map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            aria-current={areaDef.id === id ? 'page' : undefined}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 py-2.5 rounded-xl text-[11px] sm:text-sm font-bold transition-all ${
              areaDef.id === id ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </nav>

      {areaDef.id === 'config' && (
        <h2 className="text-sm font-black text-white uppercase tracking-wide flex items-center gap-2 px-1">
          <Settings2 className="w-4 h-4 text-sky-400" /> Configurações do clube
        </h2>
      )}

      {/* Seções da área (quando tem mais de uma) */}
      {subs.length > 1 && (
        <div data-tour="coach-subtabs" className="flex gap-1.5 overflow-x-auto scrollbar-none" role="tablist" style={{ scrollbarWidth: 'none' }}>
          {subs.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={sub?.id === s.id}
              onClick={() => go(areaDef.id, s.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border flex-shrink-0 transition-colors ${
                sub?.id === s.id ? 'bg-slate-100 text-slate-950 border-slate-100' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Conteúdo (key: recarrega tudo ao trocar de clube). Telas já abertas ficam montadas. */}
      <div key={viewClub.id} data-tour="coach-content" className="space-y-6">
        {pane(
          'hoje/',
          <div className="space-y-4">
            <CompetitionRiskCard today={today} onOpen={() => go('planejamento', 'competicoes')} />
            <DailyOverview onEditAthlete={handleEditAthleteFromOverview} onOpenProfile={setProfileId} onOpenNotifications={() => go('elenco', 'atletas')} />
          </div>
        )}
        {/* Análises: um filtro só (período e atletas) para as três abas */}
        {areaDef.id === 'analises' && <AnalysisFilter value={analysisFilter} onChange={setAnalysisFilter} section={sub?.id ?? ''} />}
        {pane('analises/periodo', <PeriodAnalysis filter={analysisFilter} />)}
        {pane('analises/carga', <LoadAnalysis filter={analysisFilter} onOpenProfile={setProfileId} />)}
        {pane('analises/relatorio', <ReportBuilder coachName={coach!.nome} filter={analysisFilter} />)}
        {pane('planejamento/agenda', <TrainingSchedule onOpenWorkout={(id: string) => { setWorkoutSession(id); go('planejamento', 'fisica'); }} />)}
        {pane('planejamento/fisica', <PhysicalWorkoutBuilder sessionId={workoutSession} />)}
        {pane('planejamento/competicoes', <CompetitionManagement />)}
        {pane(
          'elenco/atletas',
          <div className="space-y-4">
            <PushStatusCard />
            <AthleteManagement athleteToEdit={athleteToEdit} onClearAthleteToEdit={() => setAthleteToEdit(null)} onOpenProfile={setProfileId} />
          </div>
        )}
        {pane('elenco/grupos', <GroupManagement />)}
        {pane('elenco/corpo', <BodyComposition />)}
        {pane('elenco/adversarios', <AdversaryManagement />)}
        {isAdmin && pane('config/treinadores', <TeamManagement currentUserId={session.user.id} club={coach!.club} onClubChanged={reloadProfile} />)}
        {isAdmin && pane('config/cores', <ThemeSettings />)}
        {pane('config/notificacoes', <WeightReminderSettings />)}
      </div>
      {profileId && (
        <Suspense fallback={null}>
          <AthleteProfile athleteId={profileId} onClose={() => setProfileId(null)} />
        </Suspense>
      )}
    </div>
  );
};
