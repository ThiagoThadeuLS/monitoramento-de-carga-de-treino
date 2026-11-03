import { useState, useEffect } from 'react';
import { Dumbbell, Calendar, Clock, Play, Loader2 } from 'lucide-react';
import { todayISO } from '../lib/date';
import { getAthleteSchedule } from '../lib/athleteAuth';
import { TrainingSession } from '../types';
import { isPhysicalTraining } from '../data/constants';

interface AthleteWorkoutsTabProps {
  token: string;
  athleteId?: string;
  onStartWorkout: (sessionId: string, sessionName: string) => void;
}

export function AthleteWorkoutsTab({ token, onStartWorkout }: AthleteWorkoutsTabProps) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const today = todayISO();

  useEffect(() => {
    async function loadTodayPhysicalWorkouts() {
      if (!token) return;
      setLoading(true);

      try {
        const data = await getAthleteSchedule(token, today, today);
        setSessions((data || []).filter((s) => isPhysicalTraining(s.training_type)));
      } catch (err) {
        console.error('Erro ao carregar treinos físicos de hoje:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTodayPhysicalWorkouts();
  }, [token, today]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
          <Dumbbell className="w-5 h-5 text-violet-300" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Meus Treinos Físicos de Hoje</h2>
          <p className="text-xs text-slate-400">Selecione o treino prescrito para iniciar a ficha e o cronômetro</p>
        </div>
      </div>

      {loading ? (
        <div className="py-24 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-violet-400" /></div>
      ) : sessions.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <Calendar className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-white">Nenhum treino físico agendado para hoje.</p>
          <p className="text-xs text-slate-400">Confira o cronograma completo na aba "Agenda", se precisar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const nomeTreino = s.name || 'Treino Físico';
            return (
              <div key={s.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 hover:border-violet-500/50 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 font-bold text-[10px] uppercase tracking-wider">Treino Físico</span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" /> {s.start_time?.slice(0, 5)} {s.end_time ? `- ${s.end_time.slice(0, 5)}` : ''}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white">{nomeTreino}</h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => onStartWorkout(s.id, nomeTreino)}
                    className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 font-black text-xs transition-all shadow-lg shadow-violet-500/20"
                  >
                    <Play className="w-4 h-4 fill-current" /> Iniciar Treino Físico
                  </button>
                </div>

                {(s.notes || (s as any).observacoes) && (
                  <div className="bg-slate-950 border border-slate-800/80 p-3 rounded-xl text-xs text-slate-300">
                    <strong className="text-slate-400 block mb-0.5 text-[10px] uppercase">Anotações do Treinador:</strong>
                    {s.notes || (s as any).observacoes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}