import React, { useState, useEffect } from 'react';
import { Flame, HeartPulse, Scale, ShieldAlert } from 'lucide-react';
import { AthleteSelector } from './AthleteSelector';
import { PseForm } from './PseForm';
import { PsrForm } from './PsrForm';
import { WeightForm } from './WeightForm';
import { Athlete, PseRecord, PsrRecord, WeightRecord } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { INITIAL_MOCK_ATHLETES } from '../data/mockAthletes';

export const AthleteArea: React.FC = () => {
  const [athletes, setAthletes] = useState<Athlete[]>(INITIAL_MOCK_ATHLETES);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(() => {
    return localStorage.getItem('last_selected_athlete_id') || '';
  });
  const [activeTab, setActiveTab] = useState<'pse' | 'psr' | 'weight'>('pse');
  const [loadingAthletes, setLoadingAthletes] = useState(false);

  // Carrega atletas do Supabase se configurado, caso contrário usa a lista inicial
  useEffect(() => {
    async function loadAthletes() {
      if (!isSupabaseConfigured || !supabase) return;

      setLoadingAthletes(true);
      try {
        const { data, error } = await supabase
          .from('athletes')
          .select('*')
          .eq('active', true)
          .order('nome');

        if (!error && data && data.length > 0) {
          setAthletes(data);
        }
      } catch (err) {
        console.warn('Usando atletas locais:', err);
      } finally {
        setLoadingAthletes(false);
      }
    }

    loadAthletes();
  }, []);

  const handleSelectAthlete = (id: string) => {
    setSelectedAthleteId(id);
    localStorage.setItem('last_selected_athlete_id', id);
  };

  const currentAthlete = athletes.find((a) => a.id === selectedAthleteId);

  // Submissão de PSE
  const handlePseSubmit = async (record: Omit<PseRecord, 'id' | 'created_at'>): Promise<boolean> => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('pse_records').insert([record]);
        if (error) throw error;
        return true;
      } catch (err) {
        console.error('Erro ao salvar no Supabase:', err);
        return false;
      }
    } else {
      // Mock local storage para testes antes da conexão do Supabase
      console.log('Gravado localmente (Modo Demonstração):', record);
      await new Promise((r) => setTimeout(r, 600));
      return true;
    }
  };

  // Submissão de PSR
  const handlePsrSubmit = async (record: Omit<PsrRecord, 'id' | 'created_at'>): Promise<boolean> => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('psr_records').insert([record]);
        if (error) throw error;
        return true;
      } catch (err) {
        console.error('Erro ao salvar no Supabase:', err);
        return false;
      }
    } else {
      console.log('Gravado localmente (Modo Demonstração):', record);
      await new Promise((r) => setTimeout(r, 600));
      return true;
    }
  };

  // Submissão de Peso
  const handleWeightSubmit = async (record: Omit<WeightRecord, 'id' | 'created_at'>): Promise<boolean> => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('weight_records').insert([record]);
        if (error) throw error;
        return true;
      } catch (err) {
        console.error('Erro ao salvar no Supabase:', err);
        return false;
      }
    } else {
      console.log('Gravado localmente (Modo Demonstração):', record);
      await new Promise((r) => setTimeout(r, 600));
      return true;
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Banner de Demonstração caso o Supabase ainda não tenha chaves */}
      {!isSupabaseConfigured && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-amber-300 text-xs sm:text-sm">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-bold">Modo de Pré-visualização Ativo:</span> As credenciais do Supabase ainda não foram adicionadas no arquivo <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-200">.env</code>. Os dados estão sendo simulados na tela para você testar tudo agora mesmo!
          </div>
        </div>
      )}

      {/* 1. Seletor do Atleta */}
      <AthleteSelector
        athletes={athletes}
        selectedAthleteId={selectedAthleteId}
        onSelectAthlete={handleSelectAthlete}
        loading={loadingAthletes}
      />

      {/* 2. Abas de Seleção de Questionário */}
      <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('pse')}
          className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all ${
            activeTab === 'pse'
              ? 'bg-orange-500 text-slate-950 shadow-md shadow-orange-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>PSE (Esforço)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('psr')}
          className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all ${
            activeTab === 'psr'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <HeartPulse className="w-4 h-4" />
          <span>PSR (Bem-Estar)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('weight')}
          className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all ${
            activeTab === 'weight'
              ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Controle de Peso</span>
        </button>
      </div>

      {/* 3. Área do Formulário Ativo */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur">
        {activeTab === 'pse' && (
          <PseForm
            athleteId={selectedAthleteId}
            athleteName={currentAthlete?.nome}
            onSubmit={handlePseSubmit}
          />
        )}

        {activeTab === 'psr' && (
          <PsrForm
            athleteId={selectedAthleteId}
            athleteName={currentAthlete?.nome}
            onSubmit={handlePsrSubmit}
          />
        )}

        {activeTab === 'weight' && (
          <WeightForm
            athleteId={selectedAthleteId}
            athleteName={currentAthlete?.nome}
            onSubmit={handleWeightSubmit}
          />
        )}
      </div>
    </div>
  );
};
