import React from 'react';
import { Building2, Globe2 } from 'lucide-react';
import { TipoOrigem } from './types';

/** Painel que sobe de baixo no celular e vira modal no computador. */
export const Sheet: React.FC<{ onClose: () => void; label: string; children: React.ReactNode }> = ({ onClose, label, children }) => (
  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>
);

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">{label}</span>
    {children}
  </label>
);

export const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 sm:p-3 min-w-0">
    <p className="text-[10px] uppercase font-bold text-slate-500">{label}</p>
    <p className="text-[13px] sm:text-sm font-bold text-white mt-0.5 [overflow-wrap:anywhere]">{value}</p>
  </div>
);

export const OriginIcon: React.FC<{ tipo: TipoOrigem; className?: string }> = ({ tipo, className }) =>
  tipo === 'pais' ? <Globe2 className={className} /> : <Building2 className={className} />;

/** Selo de quem cadastrou a ficha ou escreveu a observação. */
export const AuthorBadge: React.FC<{ tipo?: 'atleta' | 'tecnico'; prefix?: string; long?: boolean; className?: string }> = ({
  tipo,
  prefix = '',
  long = false,
  className = '',
}) => (
  <span
    className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
      tipo === 'tecnico' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
    } ${className}`}
  >
    {prefix}
    {tipo === 'tecnico' ? (long ? 'Comissão Técnica' : 'Técnico') : 'Atleta'}
  </span>
);
