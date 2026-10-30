import React from 'react';
import { User, ChevronDown } from 'lucide-react';
import { Athlete } from '../types';

interface AthleteSelectorProps {
  athletes: Athlete[];
  selectedAthleteId: string;
  onSelectAthlete: (id: string) => void;
  loading?: boolean;
}

export const AthleteSelector: React.FC<AthleteSelectorProps> = ({
  athletes,
  selectedAthleteId,
  onSelectAthlete,
  loading = false,
}) => {
  const selectedAthlete = athletes.find((a) => a.id === selectedAthleteId);

  return (
    <div className="w-full bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-xl backdrop-blur">
      <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
        <User className="w-4 h-4" />
        Identificação do Atleta
      </label>

      <div className="relative">
        <select
          value={selectedAthleteId}
          onChange={(e) => onSelectAthlete(e.target.value)}
          disabled={loading}
          className="w-full appearance-none bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 pr-10 text-white font-medium text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all cursor-pointer disabled:opacity-50"
        >
          <option value="" disabled>
            {loading ? 'Carregando atletas...' : '👉 Selecione seu nome na lista...'}
          </option>
          {athletes.map((athlete) => (
            <option key={athlete.id} value={athlete.id} className="bg-slate-900 text-white py-2">
              {athlete.nome} {athlete.classe ? `- Classe ${athlete.classe}` : ''}
            </option>
          ))}
        </select>
        
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
          <ChevronDown className="w-5 h-5" />
        </div>
      </div>

      {selectedAthlete ? (
        <div className="mt-3 pt-2.5 border-t border-slate-700/50 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{selectedAthlete.nome}</span>
            {selectedAthlete.classe && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Classe {selectedAthlete.classe}
              </span>
            )}
          </div>
          <span className="text-emerald-400 font-medium text-[11px] flex items-center gap-1">
            ✓ Atleta selecionado
          </span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-400/90 font-medium">
          ⚠️ Por favor, selecione seu nome acima para habilitar o envio.
        </p>
      )}
    </div>
  );
};
