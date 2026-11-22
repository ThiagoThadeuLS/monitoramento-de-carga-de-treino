import { useEffect, useState } from 'react';
import { ClipboardList, Trophy } from 'lucide-react';
import { PhysicalWorkoutBuilder } from '../PhysicalWorkoutBuilder';
import { PhysicalRecords } from './PhysicalRecords';

/**
 * Planejamento → Prep. física: fichas dos treinos físicos e os PRs/testes do elenco.
 * As duas partes ficam montadas (trocar não perde o que estava aberto).
 */
export function PhysicalArea({ sessionId }: { sessionId?: string | null }) {
  const [view, setView] = useState<'fichas' | 'registros'>('fichas');
  // Treino aberto pela agenda: volta para as fichas
  useEffect(() => {
    if (sessionId) setView('fichas');
  }, [sessionId]);

  return (
    <div className="space-y-4">
      <div className="inline-grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800" role="tablist" aria-label="Preparação física">
        {(
          [
            { id: 'fichas', label: 'Fichas dos treinos', icon: ClipboardList },
            { id: 'registros', label: 'PRs e testes', icon: Trophy },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={view === t.id}
            onClick={() => setView(t.id)}
            className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              view === t.id ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>
      <div hidden={view !== 'fichas'}>
        <PhysicalWorkoutBuilder sessionId={sessionId} />
      </div>
      {view === 'registros' && <PhysicalRecords />}
    </div>
  );
}
