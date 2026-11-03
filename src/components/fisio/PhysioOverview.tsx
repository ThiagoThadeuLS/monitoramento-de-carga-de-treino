import React, { useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, ChevronRight, HeartPulse, Loader2, Plus, Search } from 'lucide-react';
import { ClubAthlete } from '../../lib/athletes';
import {
  PHYSIO_RETURN_TONE,
  PHYSIO_STATUS_LABEL,
  PHYSIO_STATUS_TONE,
  PhysioCase,
  formatPhysioRegion,
  physioReturnInfo,
} from '../../lib/physio';

interface Props {
  cases: PhysioCase[];
  athletes: ClubAthlete[];
  loading: boolean;
  error: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

type Filter = 'ativos' | 'todos' | 'alta';

/** Visão geral da fisioterapia: quem está em acompanhamento e a previsão de retorno. */
export const PhysioOverview: React.FC<Props> = ({ cases, athletes, loading, error, onSelect, onCreate }) => {
  const [filter, setFilter] = useState<Filter>('ativos');
  const [search, setSearch] = useState('');

  const nameOf = useMemo(() => new Map(athletes.map((a) => [a.id, a.nome])), [athletes]);

  const active = cases.filter((c) => c.status !== 'alta');
  const late = active.filter((c) => {
    const r = physioReturnInfo(c);
    return r.state === 'atrasado' || r.state === 'atencao';
  });
  const gradual = active.filter((c) => c.status === 'retorno_gradual');

  const query = search.trim().toLowerCase();
  const visible = cases
    .filter((c) => (filter === 'todos' ? true : filter === 'alta' ? c.status === 'alta' : c.status !== 'alta'))
    .filter((c) => {
      if (!query) return true;
      const nome = nameOf.get(c.athlete_id) ?? '';
      return `${nome} ${c.regiao} ${c.restricao ?? ''}`.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (a.status === 'alta' && b.status !== 'alta') return 1;
      if (b.status === 'alta' && a.status !== 'alta') return -1;
      return (a.previsao_retorno ?? '9999-12-31').localeCompare(b.previsao_retorno ?? '9999-12-31');
    });

  if (loading) {
    return (
      <div className="py-16 flex justify-center bg-slate-900/60 border border-slate-800 rounded-2xl">
        <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Casos em acompanhamento</p>
          <p className="text-xs text-slate-400">
            Registre sessões, monte o plano do atleta e acompanhe os critérios até a liberação.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" /> Novo caso
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Ativos</p>
          <p className="text-2xl font-black text-white">{active.length}</p>
        </div>
        <div className="bg-slate-900/90 border border-amber-500/20 rounded-2xl p-3.5">
          <p className="text-[11px] uppercase tracking-wide text-amber-400/80 font-semibold">Prazo próximo</p>
          <p className="text-2xl font-black text-amber-300">{late.length}</p>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Retorno gradual</p>
          <p className="text-2xl font-black text-violet-300">{gradual.length}</p>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Altas</p>
          <p className="text-2xl font-black text-emerald-300">{cases.filter((c) => c.status === 'alta').length}</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" /> <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar atleta, região ou restrição..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ['ativos', 'Ativos'],
              ['todos', 'Todos'],
              ['alta', 'Altas'],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                filter === id ? 'bg-slate-100 text-slate-950 border-slate-100' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="py-14 text-center text-slate-400 space-y-1 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <HeartPulse className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">
            {filter === 'alta' ? 'Nenhuma alta registrada' : search ? 'Nenhum caso encontrado' : 'Nenhum caso em acompanhamento'}
          </p>
          <p className="text-xs">Abra um novo caso para começar o acompanhamento de um atleta.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map((c) => {
            const ret = physioReturnInfo(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="w-full text-left bg-slate-900/90 border border-slate-800 hover:border-slate-600 rounded-2xl p-4 space-y-2.5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{nameOf.get(c.athlete_id) ?? 'Atleta'}</p>
                      <p className="text-xs text-slate-400">{formatPhysioRegion(c.regiao, c.lado)}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0 mt-1" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold ${PHYSIO_STATUS_TONE[c.status]}`}>
                      {PHYSIO_STATUS_LABEL[c.status]}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold inline-flex items-center gap-1 ${PHYSIO_RETURN_TONE[ret.state]}`}>
                      {c.status === 'alta' ? <CheckCircle2 className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
                      {ret.label}
                    </span>
                  </div>
                  {c.restricao && (
                    <p className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2 py-1 line-clamp-2">
                      {c.restricao}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Início {c.inicio.slice(8, 10)}/{c.inicio.slice(5, 7)}
                    {c.previsao_retorno ? ` • previsão ${c.previsao_retorno.slice(8, 10)}/${c.previsao_retorno.slice(5, 7)}` : ''}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
