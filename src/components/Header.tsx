import React from 'react';
import { ShieldCheck, User } from 'lucide-react';
import { ClubCrest, PLATFORM_NAME, clubInitials, useClub } from '../lib/club';

interface HeaderProps {
  currentView: 'athlete' | 'coach';
  onViewChange: (view: 'athlete' | 'coach') => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onViewChange }) => {
  const { club } = useClub();
  const todayFormatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Clube de quem está logado (ou a plataforma, antes do login) */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <ClubCrest club={club} className="w-8 h-9 sm:w-9 sm:h-10 flex-shrink-0" />
          <div className="min-w-0">
            {/* Celular: sigla do clube (ou o nome, quando o ícone já mostra a sigla) */}
            <h1 className="font-black text-lg tracking-wider text-white sm:hidden truncate max-w-[45vw]">
              {!club ? 'Carga' : club.escudo_url ? clubInitials(club.nome) : <span className="text-sm">{club.nome}</span>}
            </h1>

            {/* Desktop: nome completo */}
            <h1 className="font-extrabold text-base tracking-tight text-white hidden sm:block uppercase truncate">
              {club ? club.nome : PLATFORM_NAME}
            </h1>

            <p className="text-[10px] text-slate-400 capitalize hidden sm:block">
              {todayFormatted} • {club ? PLATFORM_NAME : 'Fisiologia & Preparação Física'}
            </p>
          </div>
        </div>

        {/* View Switcher (Atleta vs Treinador) */}
        <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => onViewChange('athlete')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentView === 'athlete'
                ? 'bg-sky-500 text-slate-950 shadow font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Atleta</span>
          </button>

          <button
            type="button"
            onClick={() => onViewChange('coach')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentView === 'coach'
                ? 'bg-sky-500 text-slate-950 shadow font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Treinador</span>
          </button>
        </div>
      </div>
    </header>
  );
};
