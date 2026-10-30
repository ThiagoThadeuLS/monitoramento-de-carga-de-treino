import React from 'react';
import { ShieldCheck, User } from 'lucide-react';

interface HeaderProps {
  currentView: 'athlete' | 'coach';
  onViewChange: (view: 'athlete' | 'coach') => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onViewChange }) => {
  const todayFormatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand Minas Tênis Clube / MTC */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <img
            src="/minas-tenis-clube.svg"
            alt="Escudo Minas Tênis Clube"
            className="w-8 h-9 sm:w-9 sm:h-10 object-contain drop-shadow-md"
          />
          <div>
            {/* Mobile: Exibe apenas MTC */}
            <h1 className="font-black text-lg tracking-wider text-white sm:hidden">
              MTC
            </h1>

            {/* Desktop: Exibe MINAS TÊNIS CLUBE */}
            <h1 className="font-extrabold text-base tracking-tight text-white hidden sm:flex items-center gap-1.5">
              MINAS <span className="text-sky-400 font-bold">TÊNIS CLUBE</span>
            </h1>

            <p className="text-[10px] text-slate-400 capitalize hidden sm:block">
              {todayFormatted} • Monitoramento de Carga
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
