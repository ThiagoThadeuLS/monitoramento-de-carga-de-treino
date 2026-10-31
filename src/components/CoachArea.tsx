import React, { useState, useEffect } from 'react';
import { LogOut, BarChart3, Users, Loader2, LineChart, CalendarDays, Shield, AlertTriangle, UserCog, Settings2, UsersRound } from 'lucide-react';
import { exitSupport } from '../lib/platform';
import { TeamManagement } from './coach/TeamManagement';
import { GroupManagement } from './coach/GroupManagement';
import { CoachChangePassword } from './CoachChangePassword';
import { ClubCrest, ClubInfo, useClub } from '../lib/club';
import { supabase } from '../lib/supabase';
import { CoachLogin } from './CoachLogin';
import { DailyOverview } from './coach/DailyOverview';
import { PeriodAnalysis } from './coach/PeriodAnalysis';
import { TrainingSchedule } from './coach/TrainingSchedule';
import { AthleteManagement } from './coach/AthleteManagement';
import { AdversaryManagement } from './coach/AdversaryManagement';
import { Athlete } from '../types';

type CoachTab = 'overview' | 'period' | 'schedule' | 'management' | 'adversaries';
type ManagementSection = 'athletes' | 'groups' | 'team';

const COACH_TABS: { id: CoachTab; label: string; short: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Visão Geral do Dia', short: 'Dia', icon: BarChart3 },
  { id: 'period', label: 'Análise do Período', short: 'Período', icon: LineChart },
  { id: 'schedule', label: 'Cronograma', short: 'Agenda', icon: CalendarDays },
  { id: 'adversaries', label: 'Atletas Adversários', short: 'Adversários', icon: Shield },
  { id: 'management', label: 'Gestão', short: 'Gestão', icon: Settings2 },
];

type ProfileClub = ClubInfo & { status: 'ativo' | 'suspenso' };

export interface CoachProfile {
  is_owner: boolean;
  /** Dono da plataforma vendo um clube em modo suporte (somente leitura) */
  support?: { club: ProfileClub; expires_at: string } | null;
  coach: {
    nome: string;
    email: string;
    role: 'admin' | 'treinador';
    active: boolean;
    must_change_password: boolean;
    club: ProfileClub;
  } | null;
}

export const CoachArea: React.FC = () => {
  const { setClub } = useClub();
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [profileVersion, setProfileVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CoachTab>('overview');
  const [athleteToEdit, setAthleteToEdit] = useState<Athlete | null>(null);
  const [managementSection, setManagementSection] = useState<ManagementSection>('athletes');

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
      const { data: authListener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
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
            ? 'A estrutura de clubes ainda não foi ativada no banco. Rode o arquivo supabase_multiclube.sql no Supabase.'
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
  }, [userId, profileVersion]);

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setClub(null);
  };

  const reloadProfile = () => setProfileVersion((v) => v + 1);

  const handleExitSupport = async () => {
    try {
      await exitSupport();
    } finally {
      reloadProfile();
    }
  };

  const handleEditAthleteFromOverview = (athlete: Athlete) => {
    setAthleteToEdit(athlete);
    setManagementSection('athletes');
    setActiveTab('management');
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
    return <CoachLogin onLoginSuccess={checkSession} />;
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
  const tabs = COACH_TABS;
  const currentTab: CoachTab = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0].id;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Top Banner da Comissão Técnica */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <ClubCrest club={viewClub} className="w-10 h-12 flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="text-lg font-black text-white tracking-tight">Painel da Comissão Técnica</h2>
            <p className="text-xs text-slate-400 truncate">
              {viewClub.nome} • <span className="text-sky-400 font-medium">{coach!.nome}</span>{' '}
              <span className="text-slate-500">({isAdmin ? 'admin do clube' : 'treinador'})</span>
            </p>
          </div>
        </div>

        {/* Botão Sair */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700/60 text-xs font-bold transition-all ml-auto sm:ml-0"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </button>
      </div>

      {/* Navegação entre Módulos do Treinador */}
      {(
        <div className="grid grid-cols-3 sm:flex sm:flex-wrap sm:items-center gap-1.5 sm:gap-2 border-b border-slate-800 pb-2">
          {tabs.map(({ id, label, short, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                currentTab === id
                  ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Conteúdo da Aba Ativa (key: recarrega tudo ao trocar de clube/modo suporte) */}
      <div key={viewClub.id} className="space-y-6">
      {currentTab === 'overview' && (
        <DailyOverview onEditAthlete={handleEditAthleteFromOverview} />
      )}
      {currentTab === 'period' && <PeriodAnalysis />}
      {currentTab === 'schedule' && <TrainingSchedule />}
      {currentTab === 'management' && (
        <div className="space-y-4">
          {/* Seções da Gestão: atletas e grupos para todos; treinadores só para admin */}
          {(
            <div className={`grid ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'} sm:inline-flex sm:w-auto p-1 bg-slate-900/90 border border-slate-800 rounded-xl`} role="tablist" aria-label="Seções da gestão">
              {([['athletes', 'Atletas', Users], ['groups', 'Grupos', UsersRound], ['team', 'Treinadores', UserCog]] as const)
                .filter(([id]) => id !== 'team' || isAdmin)
                .map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={managementSection === id}
                  onClick={() => setManagementSection(id)}
                  className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                    managementSection === id ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
          {managementSection === 'groups' && <GroupManagement />}
          {(managementSection === 'athletes' || (managementSection === 'team' && !isAdmin)) && (
            <AthleteManagement
              athleteToEdit={athleteToEdit}
              onClearAthleteToEdit={() => setAthleteToEdit(null)}
            />
          )}
          {isAdmin && managementSection === 'team' && (
            <TeamManagement currentUserId={session.user.id} club={coach!.club} onClubChanged={reloadProfile} />
          )}
        </div>
      )}
      {currentTab === 'adversaries' && <AdversaryManagement />}
      </div>
    </div>
  );
};