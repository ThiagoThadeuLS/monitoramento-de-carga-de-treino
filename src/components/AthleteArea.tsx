import React, { useState, useEffect } from 'react';
import { Flame, HeartPulse, Scale, ShieldAlert, LogOut, Loader2, User, CalendarDays } from 'lucide-react';
import { TrainingSchedule } from './coach/TrainingSchedule';
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
  logoutAthlete,
  restoreAthleteSession,
  submitPse,
  submitPsr,
  submitWeight,
} from '../lib/athleteAuth';

type AthleteTab = 'pse' | 'psr' | 'weight' | 'schedule';

const ATHLETE_TABS: { id: AthleteTab; label: string; short: string; icon: typeof Flame; active: string }[] = [
  { id: 'pse', label: 'PSE (Esforço)', short: 'PSE', icon: Flame, active: 'bg-orange-500 text-slate-950 shadow-md shadow-orange-500/20' },
  { id: 'psr', label: 'PSR (Bem-Estar)', short: 'PSR', icon: HeartPulse, active: 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' },
  { id: 'weight', label: 'Peso', short: 'Peso', icon: Scale, active: 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20' },
  { id: 'schedule', label: 'Cronograma', short: 'Agenda', icon: CalendarDays, active: 'bg-violet-500 text-slate-950 shadow-md shadow-violet-500/20' },
];

export const AthleteArea: React.FC = () => {
  const [session, setSession] = useState<AthleteSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AthleteTab>('pse');

  // Retoma a sessão salva neste aparelho (atleta não precisa logar todo dia)
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

  const { athlete } = session;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* 1. Atleta logado */}
      <div className="w-full bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-xl backdrop-blur flex items-center justify-between gap-3">
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

      {/* 2. Abas */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl">
        {ATHLETE_TABS.map(({ id, label, short, icon: Icon, active }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`py-3 px-1 sm:px-2 rounded-xl text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all ${
              activeTab === id ? active : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* 3. Cronograma (somente leitura) ou formulário ativo */}
      {activeTab === 'schedule' ? (
        <TrainingSchedule
          readOnly
          listOnly
          fetchSessions={(from, to) => getAthleteSchedule(session.token, from, to)}
        />
      ) : (
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur">
        {activeTab === 'pse' && (
          <PseForm athleteId={athlete.id} athleteName={athlete.nome} onSubmit={handlePseSubmit} />
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
