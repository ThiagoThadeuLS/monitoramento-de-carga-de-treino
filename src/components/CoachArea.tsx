import React, { useState, useEffect } from 'react';
import { LogOut, BarChart3, Users, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CoachLogin } from './CoachLogin';
import { DailyOverview } from './coach/DailyOverview';
import { AthleteManagement } from './coach/AthleteManagement';
import { Athlete } from '../types';

export const CoachArea: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'athletes'>('overview');
  const [athleteToEdit, setAthleteToEdit] = useState<Athlete | null>(null);

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

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  };

  const handleEditAthleteFromOverview = (athlete: Athlete) => {
    setAthleteToEdit(athlete);
    setActiveTab('athletes');
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

  // Se estiver logado, exibe o painel administrativo da Comissão Técnica
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Top Banner da Comissão Técnica */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src="/minas-tenis-clube.svg"
            alt="MTC"
            className="w-10 h-12 object-contain drop-shadow"
          />
          <div>
            <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              Painel da Comissão Técnica
            </h2>
            <p className="text-xs text-slate-400">
              Conectado como: <span className="text-sky-400 font-medium">{session.user?.email}</span>
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
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'overview'
              ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Visão Geral do Dia</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('athletes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'athletes'
              ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Gestão do Elenco</span>
        </button>
      </div>

      {/* Conteúdo da Aba Ativa */}
      {activeTab === 'overview' && (
        <DailyOverview onEditAthlete={handleEditAthleteFromOverview} />
      )}
      {activeTab === 'athletes' && (
        <AthleteManagement
          athleteToEdit={athleteToEdit}
          onClearAthleteToEdit={() => setAthleteToEdit(null)}
        />
      )}
    </div>
  );
};
