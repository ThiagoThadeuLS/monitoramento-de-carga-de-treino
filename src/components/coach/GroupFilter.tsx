import React, { useEffect, useRef, useState } from 'react';
import { UsersRound, ChevronDown, Search, X } from 'lucide-react';
import { AthleteGroup, AthleteRef } from '../../lib/groups';

/** Seleção do filtro: grupos e/ou atletas específicos (vazio = todos os atletas). */
export interface AthleteSelection {
  groupIds: string[];
  athleteIds: string[];
}

export const EMPTY_SELECTION: AthleteSelection = { groupIds: [], athleteIds: [] };

/** Atletas incluídos na seleção (união dos grupos + atletas marcados); null = todos. */
export function resolveSelection(sel: AthleteSelection, groups: AthleteGroup[]): Set<string> | null {
  if (sel.groupIds.length === 0 && sel.athleteIds.length === 0) return null;
  const ids = new Set(sel.athleteIds);
  for (const g of groups) if (sel.groupIds.includes(g.id)) g.members.forEach((m) => ids.add(m));
  return ids;
}

/** Texto curto da seleção, ex.: "Pesados + 2 atletas". */
export function selectionLabel(sel: AthleteSelection, groups: AthleteGroup[], athletes: AthleteRef[]): string {
  const parts = [
    ...sel.groupIds.map((id) => groups.find((g) => g.id === id)?.nome).filter(Boolean),
    ...(sel.athleteIds.length === 1
      ? [athletes.find((a) => a.id === sel.athleteIds[0])?.nome ?? '1 atleta']
      : sel.athleteIds.length > 1
      ? [`${sel.athleteIds.length} atletas`]
      : []),
  ];
  return parts.length ? parts.join(' + ') : 'Todos os atletas';
}

interface GroupFilterProps {
  groups: AthleteGroup[];
  athletes: AthleteRef[];
  value: AthleteSelection;
  onChange: (value: AthleteSelection) => void;
  className?: string;
}

/** Filtro "Atletas" (grupos e/ou pessoas) da Visão do Dia e da Análise do Período. */
export const GroupFilter: React.FC<GroupFilterProps> = ({ groups, athletes, value, onChange, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const count = value.groupIds.length + value.athleteIds.length;
  const toggle = (key: keyof AthleteSelection, id: string) =>
    onChange({ ...value, [key]: value[key].includes(id) ? value[key].filter((x) => x !== id) : [...value[key], id] });
  const filtered = athletes.filter((a) => a.nome.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div ref={ref} className={`relative ${className}`}>
      <span className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
        <UsersRound className="w-3 h-3" /> Atletas
      </span>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 bg-slate-950 border rounded-lg px-3 py-2 text-sm font-semibold text-left focus:outline-none focus:ring-2 focus:ring-sky-500 ${
          count ? 'border-violet-500/60 text-violet-200' : 'border-slate-700 text-white'
        }`}
      >
        <span className="truncate">{selectionLabel(value, groups, athletes)}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 left-0 w-[min(22rem,calc(100vw-2rem))] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Marque grupos e/ou atletas. Sem nada marcado: todos.</p>
            <button type="button" onClick={() => setOpen(false)} className="p-1 text-slate-500 hover:text-white" title="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">Grupos</p>
            {groups.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum grupo criado (Gestão → Grupos).</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => {
                  const on = value.groupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle('groupIds', g.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                        on ? 'bg-violet-500/20 text-violet-200 border-violet-500/60' : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                    >
                      {on ? '✓ ' : ''}{g.nome} <span className="font-normal opacity-70">({g.members.length})</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">
              Atletas específicos {value.athleteIds.length > 0 && `(${value.athleteIds.length})`}
            </p>
            <div className="relative mb-1.5">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar atleta..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800/70">
              {filtered.map((a) => {
                const on = value.athleteIds.includes(a.id);
                return (
                  <li key={a.id}>
                    <label className={`flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer text-xs ${on ? 'bg-violet-500/10 text-white' : 'text-slate-300 hover:bg-slate-800/60'}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle('athleteIds', a.id)} className="w-3.5 h-3.5 accent-violet-500" />
                      {a.nome}
                    </label>
                  </li>
                );
              })}
              {filtered.length === 0 && <li className="px-2.5 py-3 text-xs text-slate-500">Nenhum atleta encontrado.</li>}
            </ul>
          </div>

          <div className="flex justify-between pt-1">
            <button type="button" onClick={() => onChange(EMPTY_SELECTION)} disabled={!count} className="text-xs font-bold text-slate-400 hover:text-white disabled:opacity-40">
              Limpar (todos)
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold">
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
