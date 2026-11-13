import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, HeartPulse, Loader2, RefreshCw } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { brDate } from '../../lib/export';
import { brDateOfStamp } from '../../lib/date';
import { WhoopAthlete, listWhoopAthletes, recoveryTone, whoopNumber } from '../../lib/whoop';


const num = (value: unknown, suffix = '', digits = 0) => {
  const v = whoopNumber(value);
  return v === null ? '—' : `${v.toFixed(digits).replace('.', ',')}${suffix}`;
};

/**
 * Elenco → WHOOP: todos os atletas que conectaram a pulseira, com os números do último dia.
 * Tocar no atleta abre a ficha, que mostra os gráficos de 30 dias.
 */
export const WhoopAthletes: React.FC<{ onOpenProfile: (athleteId: string) => void }> = ({ onOpenProfile }) => {
  const [list, setList] = useState<WhoopAthlete[] | null>(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError('');
    listWhoopAthletes(reloadKey > 0)
      .then((rows) => !cancelled && setList(rows))
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
        setList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setList(null);
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <HeartPulse className="w-4 h-4 text-rose-400" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white">Atletas com WHOOP {list && list.length > 0 && <span className="text-slate-400 font-semibold">• {list.length}</span>}</h3>
          <p className="text-[11px] text-slate-500">Último dia lido da pulseira. Toque no atleta para ver os gráficos na ficha.</p>
        </div>
        <button type="button" onClick={reload} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200" title="Atualizar" aria-label="Atualizar lista">
          <RefreshCw className={`w-4 h-4 ${list === null ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {list === null ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
        </div>
      ) : error ? (
        <p className="m-4 flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </p>
      ) : list.length === 0 ? (
        <div className="py-10 px-4 text-center space-y-1.5">
          <HeartPulse className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">Nenhum atleta conectou o WHOOP ainda</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            O atleta conecta pelo app em <strong className="text-slate-300">Perfil → WHOOP</strong>. Depois disso ele aparece aqui, com a etiqueta
            WHOOP nas listas e os números na ficha.
          </p>
        </div>
      ) : (
        <>
          {/* Celular */}
          <ul className="md:hidden divide-y divide-slate-800/60">
            {list.map((a) => {
              const d = a.last_day;
              return (
                <li key={a.athlete_id}>
                  <button type="button" onClick={() => onOpenProfile(a.athlete_id)} className="w-full text-left p-4 space-y-2 hover:bg-slate-800/40">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={a.nome} src={a.photo_url} className="w-10 h-10" textClassName="text-xs" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-white text-sm truncate">{a.nome}</p>
                        <p className="text-[11px] text-slate-500">{d ? `Último dia: ${brDate(d.date).slice(0, 5)}` : 'Sem dias importados'}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                    {d && (
                      <div className="grid grid-cols-4 gap-2 text-[11px] text-slate-400">
                        <span>Recup.<strong className={`block text-sm ${recoveryTone(whoopNumber(d.recovery_score))}`}>{num(d.recovery_score, '%')}</strong></span>
                        <span>HRV<strong className="block text-sm text-white">{num(d.hrv_ms, ' ms')}</strong></span>
                        <span>Sono<strong className="block text-sm text-white">{num(d.sleep_hours, ' h', 1)}</strong></span>
                        <span>Strain<strong className="block text-sm text-white">{num(d.strain, '', 1)}</strong></span>
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Computador */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950 border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Atleta</th>
                  <th className="py-3 px-3">Último dia</th>
                  <th className="py-3 px-3 text-right">Recuperação</th>
                  <th className="py-3 px-3 text-right">Média 7 dias</th>
                  <th className="py-3 px-3 text-right">HRV</th>
                  <th className="py-3 px-3 text-right">FC repouso</th>
                  <th className="py-3 px-3 text-right">Sono</th>
                  <th className="py-3 px-3 text-right">Strain</th>
                  <th className="py-3 px-4">Leitura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {list.map((a) => {
                  const d = a.last_day;
                  return (
                    <tr key={a.athlete_id} onClick={() => onOpenProfile(a.athlete_id)} className="hover:bg-slate-800/40 cursor-pointer">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={a.nome} src={a.photo_url} className="w-9 h-9" textClassName="text-[11px]" />
                          <div className="min-w-0">
                            <p className="font-bold text-white leading-tight">
                              {a.nome}
                            </p>
                            <p className="text-[11px] text-slate-500">{[a.classe, a.categoria].filter(Boolean).join(' • ')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs">{d ? brDate(d.date).slice(0, 5) : '—'}</td>
                      <td className={`py-3 px-3 text-right font-black tabular-nums ${recoveryTone(whoopNumber(d?.recovery_score))}`}>{num(d?.recovery_score, '%')}</td>
                      <td className={`py-3 px-3 text-right tabular-nums ${recoveryTone(a.recovery_7d)}`}>{num(a.recovery_7d, '%')}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{num(d?.hrv_ms, ' ms')}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{num(d?.resting_hr, ' bpm')}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{num(d?.sleep_hours, ' h', 1)}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{num(d?.strain, '', 1)}</td>
                      <td className="py-3 px-4 text-[11px]">
                        {a.sync_error ? (
                          <span className="text-amber-300">Falhou • peça para reconectar</span>
                        ) : a.last_sync_at ? (
                          <span className="text-slate-400">{brDateOfStamp(a.last_sync_at)}</span>
                        ) : (
                          <span className="text-slate-500">Ainda não leu</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
