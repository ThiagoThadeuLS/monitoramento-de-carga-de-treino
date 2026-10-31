import React, { createContext, useContext, useState } from 'react';
import { Activity } from 'lucide-react';

// Nome da plataforma (aparece antes do login e para quem não tem clube)
export const PLATFORM_NAME = 'Monitoramento de Carga';

export interface ClubInfo {
  id: string;
  nome: string;
  escudo_url?: string | null;
}

interface ClubContextValue {
  club: ClubInfo | null;
  setClub: (club: ClubInfo | null) => void;
}

const ClubContext = createContext<ClubContextValue>({ club: null, setClub: () => undefined });

/** Guarda o clube de quem está logado (treinador ou atleta) para o cabeçalho e as telas. */
export const ClubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [club, setClub] = useState<ClubInfo | null>(null);
  return <ClubContext.Provider value={{ club, setClub }}>{children}</ClubContext.Provider>;
};

export const useClub = () => useContext(ClubContext);

/** Sigla do clube para telas estreitas (ex.: "Minas Tênis Clube" -> "MTC"). */
export function clubInitials(nome: string): string {
  const words = nome.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w));
  return (words.length ? words : nome.split(/\s+/)).map((w) => w[0]).join('').toUpperCase().slice(0, 4);
}

/** Escudo do clube, ou o ícone da plataforma quando não há clube/escudo. */
export const ClubCrest: React.FC<{ club: ClubInfo | null; className?: string }> = ({ club, className = 'w-9 h-10' }) =>
  club?.escudo_url ? (
    <img src={club.escudo_url} alt={`Escudo ${club.nome}`} className={`${className} object-contain drop-shadow-md`} />
  ) : club ? (
    <div className={`${className} rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-300 font-black text-xs`}>
      {clubInitials(club.nome)}
    </div>
  ) : (
    <div className={`${className} rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center`}>
      <Activity className="w-1/2 h-1/2 text-sky-300" />
    </div>
  );
