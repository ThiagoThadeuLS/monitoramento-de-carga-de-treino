import React, { useEffect, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { listWhoopAthletes } from '../../lib/whoop';

/** Ids dos atletas do clube com o WHOOP conectado (vazio enquanto carrega ou se falhar). */
export function useWhoopConnected(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    listWhoopAthletes()
      .then((list) => !cancelled && setIds(new Set(list.map((a) => a.athlete_id))))
      .catch(() => !cancelled && setIds(new Set()));
    return () => {
      cancelled = true;
    };
  }, []);
  return ids;
}

/** Etiqueta "WHOOP": avisa que a ficha do atleta tem recuperação, sono e strain da pulseira. */
export const WhoopTag: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    title="Conectado ao WHOOP: a ficha tem recuperação, HRV, sono e strain"
    className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/40 align-middle whitespace-nowrap ${className}`}
  >
    <HeartPulse className="w-2.5 h-2.5" /> WHOOP
  </span>
);
