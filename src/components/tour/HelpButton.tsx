import React from 'react';
import { HelpCircle } from 'lucide-react';

/** Botão discreto para rever o tour. */
export const HelpButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    data-tour="help"
    title="Ver o tour pela plataforma"
    aria-label="Ver o tour pela plataforma"
    className="fixed z-40 right-3 w-9 h-9 rounded-full bg-slate-800/70 border border-slate-700/70 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center opacity-60 hover:opacity-100 transition-all"
    style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
  >
    <HelpCircle className="w-4 h-4" />
  </button>
);
