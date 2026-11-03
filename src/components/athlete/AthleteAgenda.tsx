import React, { useEffect, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { AthleteCompetitionList } from './AthleteCompetitionList';
import { TrainingSchedule } from '../coach/TrainingSchedule';
import { getAthleteSchedule } from '../../lib/athleteAuth';
import { getTrainingKind, isCombatKind } from '../../lib/trainingKind';
import { getAthletePhysio } from '../../lib/physio';

interface AthleteAgendaProps {
  token: string;
  today: string;
  onSelectSession: (s: { id: string; name?: string; training_type: string }) => void;
}

export const AthleteAgenda: React.FC<AthleteAgendaProps> = ({ token, today, onSelectSession }) => {
  const [physio, setPhysio] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    getAthletePhysio(token)
      .then((d: any) => {
        if (!cancelled) setPhysio(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const activeCase = physio?.case;

  const renderExtra = (sessions: any[], dayISO: string) => {
    const list = sessions ?? [];
    if (!activeCase) return list;

    if (activeCase.full_rest) return [];

    const filtered = list.filter((s: any) => {
      const nome = s.name || s.titulo || s.title;
      const kind = getTrainingKind(nome);
      if ((activeCase.block_randori || activeCase.block_contact) && isCombatKind(kind)) {
        return false;
      }
      if (kind === 'fisico' && activeCase.allow_physical === false) return false;
      if (kind === 'tecnico' && activeCase.allow_technical === false) return false;
      return true;
    });

    const proxima = physio?.proxima_sessao || null;
    if (proxima && proxima === dayISO) {
      filtered.push({
        id: `physio-${dayISO}`,
        name: 'Fisioterapia',
        start_time: physio?.proxima_horario || null,
        end_time: null,
        local: physio?.proxima_local || null,
        training_type: 'fisio',
        virtual: true,
      });
    }

    return filtered;
  };

  return (
    <div data-tour="athlete-schedule" className="space-y-4">
      <AthleteCompetitionList token={token} today={today} />
      <TrainingSchedule
        readOnly
        listOnly
        fetchSessions={(from: string, to: string) => getAthleteSchedule(token, from, to)}
        onSelectSession={(s: any) => {
          if (s?.training_type === 'fisio' || s?.virtual) return;
          onSelectSession(s);
        }}
        renderExtra={renderExtra}
        renderSession={(s: any) => {
          if (s?.training_type === 'fisio' || s?.virtual) {
            return (
              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/40 flex items-center gap-3">
                <HeartPulse className="w-5 h-5 text-sky-400" />
                <div>
                  <p className="font-semibold text-white">Fisioterapia</p>
                  {(s.start_time || s.local) && (
                    <p className="text-xs text-sky-200">
                      {s.start_time ? s.start_time.slice(0, 5) : ''}
                      {s.start_time && s.local ? ' • ' : ''}
                      {s.local || ''}
                    </p>
                  )}
                </div>
              </div>
            );
          }
          return null;
        }}
      />
    </div>
  );
};
