import React, { useEffect, useState } from 'react';
import { Loader2, LogOut, Lock, Eye, AlertTriangle, BarChart3, LineChart, CalendarDays, Users, Shield, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ClubCrest, ClubInfo, useClub } from '../lib/club';
import { exitSupport } from '../lib/platform';
import { CoachLogin } from './CoachLogin';
import { PlatformPanel } from './coach/PlatformPanel';
import { DailyOverview } from './coach/DailyOverview';
import { PeriodAnalysis } from './coach/PeriodAnalysis';
import { TrainingSchedule } from './coach/TrainingSchedule';
import { AthleteManagement } from './coach/AthleteManagement';
import { AdversaryManagement } from './coach/AdversaryManagement';

/** Endereço da Área Restrita (não aparece em nenhum menu do app) */
export const RESTRICTED_PATH = '/restrito';

interface OwnerProfile {
  is_owner: boolean;
  support?: { club: ClubInfo & { status: string }; expires_at: string } | null;
}

type SupportTab = 'overview' | 'period' | 'schedule' | 'athletes' | 'adversaries';
const SUPPORT_TABS: { id: SupportTab; label: string; short: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Visão Geral do Dia', short: 'Dia', icon: BarChart3 },
  { id: 'period', label: 'Análise do Período', short: 'Período', icon: LineChart },
  { id: 'schedule', label: 'Cronograma', short: 'Agenda', icon: CalendarDays },
  { id: 'athletes', label: 'Elenco', short: 'Elenco', icon: Users },
  { id: 'adversaries', label: 'Adversários', short: 'Adversários', icon: Shield },
];

/** Área Restrita dos donos da plataforma: login, layout e navegação próprios. */
export const RestrictedArea: React.FC = () => {
  const { setClub } = useClub();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<SupportTab>('overview');

  useEffect(() => {
    document.title = 'Área Restrita • Monitoramento de Carga';
    if (!supabase) {
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

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
        setProfileError('Não foi possível verificar seu acesso. Confira se os arquivos SQL da plataforma foram aplicados.');
        setProfile({ is_owner: false });
        return;
      }
      const p = data as OwnerProfile;
      setProfile(p);
      setClub(p.is_owner && p.support ? p.support.club : null);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, version]);

  const reload = () => setVersion((v) => v + 1);

  const logout = async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setProfile(null);
    setClub(null);
  };

  const leaveSupport = async () => {
    try {
      await exitSupport();
    } finally {
      reload();
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-amber-900/50 bg-slate-950/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
              <Lock className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <p className="font-black text-sm tracking-wide text-white uppercase">Área Restrita</p>
              <p className="text-[10px] text-amber-300/80">Administração da plataforma</p>
            </div>
          </div>
          {session && (
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-xs text-slate-400">{session.user?.email}</span>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700 text-xs font-bold"
              >
                <LogOut className="w-3.5 h-3.5" /> Sair
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 pb-12">{children}</main>
    </div>
  );

  if (checking || (session && !profile)) {
    return shell(
      <div className="py-24 flex flex-col items-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <p className="text-sm">Verificando acesso...</p>
      </div>
    );
  }

  if (!session) {
    return shell(
      <CoachLogin
        onLoginSuccess={() => supabase?.auth.getSession().then(({ data }) => setSession(data.session))}
        title="Área Restrita"
        subtitle="Acesso exclusivo dos administradores da plataforma"
        emailLabel="E-mail"
        submitLabel="Entrar"
        note="🔒 Acesso monitorado. Tentativas de acesso não autorizadas são bloqueadas."
      />
    );
  }

  if (!profile!.is_owner) {
    return shell(
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-slate-900/90 border border-red-900/60 rounded-3xl p-6 space-y-4 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-sm text-slate-200 font-bold">Acesso negado</p>
          <p className="text-xs text-slate-400">{profileError || 'Esta conta não tem permissão para a Área Restrita.'}</p>
          <button type="button" onClick={logout} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold">
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </div>
    );
  }

  const support = profile!.support ?? null;

  // Modo suporte: dados do clube, somente leitura
  if (support) {
    return shell(
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <ClubCrest club={support.club} className="w-10 h-11 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-300 flex-shrink-0" /> {support.club.nome}
              </p>
              <p className="text-xs text-amber-200">
                Modo suporte • somente leitura • registrado no histórico • expira às{' '}
                {new Date(support.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={leaveSupport}
            className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Sair do modo suporte
          </button>
        </div>

        <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 sm:gap-2 border-b border-slate-800 pb-2">
          {SUPPORT_TABS.map(({ id, label, short, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold ${
                tab === id ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div key={support.club.id} className="space-y-6">
          {tab === 'overview' && <DailyOverview />}
          {tab === 'period' && <PeriodAnalysis />}
          {tab === 'schedule' && <TrainingSchedule readOnly />}
          {tab === 'athletes' && <AthleteManagement readOnly />}
          {tab === 'adversaries' && <AdversaryManagement readOnly />}
        </div>
      </div>
    );
  }

  return shell(
    <div className="max-w-6xl mx-auto px-4 py-6">
      <PlatformPanel
        onSupportChanged={() => {
          setTab('overview');
          reload();
        }}
      />
    </div>
  );
};
