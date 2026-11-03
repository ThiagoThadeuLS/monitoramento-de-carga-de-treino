import React, { useState } from 'react';
import { Search, Users } from 'lucide-react';
import { ClubAthlete } from '../../lib/athletes';

interface Props {
  athletes: ClubAthlete[];
  loading: boolean;
  error: string;
}

/** Elenco do clube em modo somente leitura: a fisioterapia consulta, não cadastra. */
export const PhysioAthletes: React.FC<Props> = ({ athletes, loading, error }) => {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const visible = athletes
    .filter((a) => !query || `${a.nome} ${a.classe ?? ''} ${a.categoria ?? ''}`.toLowerCase().includes(query))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
        <p className="text-sm font-bold text-white">Atletas do clube</p>
        <p className="text-xs text-slate-400">
          Consulta rápida do elenco. Cadastro, edição de dados e senhas continuam com a comissão técnica.
        </p>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar atleta, classe ou categoria..."
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      {loading ? (
        <div className="py-14 text-center text-slate-500 text-sm">Carregando atletas...</div>
      ) : visible.length === 0 ? (
        <div className="py-14 text-center text-slate-400 space-y-1 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Users className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">Nenhum atleta encontrado</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visible.map((a) => (
            <li key={a.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{a.nome}</p>
                <p className="text-xs text-slate-400 truncate">
                  {[a.classe && `Classe ${a.classe}`, a.categoria].filter(Boolean).join(' • ') || 'Sem classe/categoria'}
                </p>
              </div>
              {!a.active && (
                <span className="text-[10px] px-2 py-0.5 rounded-md border bg-slate-800 text-slate-400 border-slate-700 font-bold flex-shrink-0">
                  Inativo
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
