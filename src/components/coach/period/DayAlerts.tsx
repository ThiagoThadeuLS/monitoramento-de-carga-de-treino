import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Ban, ChevronRight, Flame, HeartPulse, Loader2, RefreshCw, StickyNote, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { todayISO } from '../../../lib/date';
import { PseRecord, PsrRecord } from '../../../types';
import { MOBILE_PREVIEW, PSE_LIMIT, PSR_LIMIT, PSR_VARIABLES, brDate, byCreated, timeOf } from './shared';

interface Props {
  /** null = todos os atletas */
  selected: Set<string> | null;
  nameOf: (athleteId: string) => string;
}

/** Alertas de um único dia (independente do período dos gráficos): PSE alta, quem não treinou e PSR baixa. */
export const DayAlerts: React.FC<Props> = ({ selected, nameOf }) => {
  const [tableDay, setTableDay] = useState(todayISO);
  const [dayPse, setDayPse] = useState<PseRecord[]>([]);
  const [dayPsr, setDayPsr] = useState<PsrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAllPse, setShowAllPse] = useState(false);
  const [reasonOpen, setReasonOpen] = useState<PseRecord | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!supabase || !tableDay) return;
    const db = supabase;
    // Trocar o dia rápido: só a última busca atualiza a tela
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([db.from('pse_records').select('*').eq('date', tableDay), db.from('psr_records').select('*').eq('date', tableDay)])
      .then(([pseRes, psrRes]) => {
        if (cancelled) return;
        const failed = pseRes.error ?? psrRes.error;
        if (failed) throw failed;
        setDayPse(pseRes.data ?? []);
        setDayPsr(psrRes.data ?? []);
        setShowAllPse(false);
      })
      .catch((err) => {
        console.error('Erro ao carregar dia:', err);
        if (!cancelled) setError(`Não foi possível carregar os dados do dia: ${err?.message ?? err}`);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tableDay, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const dayPseG = useMemo(() => dayPse.filter((r) => !selected || selected.has(r.athlete_id)), [dayPse, selected]);
  const dayPsrG = useMemo(() => dayPsr.filter((r) => !selected || selected.has(r.athlete_id)), [dayPsr, selected]);

  const highPse = useMemo(
    () =>
      dayPseG
        .filter((r) => !r.did_not_train && (r.rpe_score ?? 0) > PSE_LIMIT)
        .sort((a, b) => (b.rpe_score ?? 0) - (a.rpe_score ?? 0) || byCreated(a, b)),
    [dayPseG]
  );

  // PSR com ao menos uma variável abaixo de 5, agrupada por atleta
  const lowPsrByAthlete = useMemo(() => {
    const groups = new Map<string, PsrRecord[]>();
    for (const r of dayPsrG) {
      if (!PSR_VARIABLES.some((v) => (r[v.key] as number) < PSR_LIMIT)) continue;
      const list = groups.get(r.athlete_id) ?? [];
      list.push(r);
      groups.set(r.athlete_id, list);
    }
    return [...groups.entries()]
      .map(([athleteId, records]) => ({ athleteId, records: records.sort(byCreated) }))
      .sort((a, b) => nameOf(a.athleteId).localeCompare(nameOf(b.athleteId), 'pt-BR'));
  }, [dayPsrG, nameOf]);
  const lowPsrCount = lowPsrByAthlete.reduce((sum, g) => sum + g.records.length, 0);

  // Quem marcou "não treinei" no dia (com o motivo informado)
  const notTrained = useMemo(
    () =>
      dayPseG
        .filter((r) => r.did_not_train)
        .sort((a, b) => nameOf(a.athlete_id).localeCompare(nameOf(b.athlete_id), 'pt-BR') || byCreated(a, b)),
    [dayPseG, nameOf]
  );

  return (
    <>
      <div data-tour="period-day" className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <AlertCircle className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-sm font-bold text-white">Alertas do dia</p>
            <p className="text-xs text-slate-400">As tabelas abaixo mostram apenas o dia escolhido.</p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <label className="block flex-1 sm:flex-none">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Dia</span>
            <input
              type="date"
              value={tableDay}
              onChange={(e) => setTableDay(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
            />
          </label>
          <button
            type="button"
            onClick={() => setTableDay(todayISO())}
            className="px-3 py-2 rounded-lg text-xs font-bold border bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            title="Atualizar"
            aria-label="Atualizar alertas do dia"
            className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <p className="text-sm">Carregando dados do dia...</p>
        </div>
      ) : (
        <>
          {/* Tabela: PSE acima de 6 */}
          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <header className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
              <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                PSE acima de {PSE_LIMIT} • {brDate(tableDay)}
              </h3>
              <span className="text-xs text-slate-400 flex-shrink-0">
                {highPse.length} {highPse.length === 1 ? 'registro' : 'registros'}
              </span>
            </header>

            {highPse.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Nenhum PSE acima de {PSE_LIMIT} neste dia.</p>
            ) : (
              <>
                {/* Celular: cartões */}
                <ul className="sm:hidden divide-y divide-slate-800/60">
                  {(showAllPse ? highPse : highPse.slice(0, MOBILE_PREVIEW)).map((r) => (
                    <li key={r.id} className="p-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-white text-sm truncate">{nameOf(r.athlete_id)}</p>
                        <p className="text-xs text-slate-400">
                          Enviado às {timeOf(r.created_at)} • {r.training_type || 'Treino'}
                        </p>
                        {r.observations && <p className="text-xs text-slate-500 mt-1 italic">“{r.observations}”</p>}
                      </div>
                      <PseBadge value={r.rpe_score!} />
                    </li>
                  ))}
                </ul>
                {highPse.length > MOBILE_PREVIEW && (
                  <button
                    type="button"
                    onClick={() => setShowAllPse(!showAllPse)}
                    className="sm:hidden w-full py-3 border-t border-slate-800 text-xs font-bold text-sky-400 hover:bg-slate-800/40"
                  >
                    {showAllPse ? 'Mostrar menos' : `Mostrar todos (${highPse.length})`}
                  </button>
                )}

                {/* Computador: tabela */}
                <div className="hidden sm:block overflow-x-auto max-h-[480px] overflow-y-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider sticky top-0">
                      <tr>
                        <th className="py-3 px-4">Envio</th>
                        <th className="py-3 px-3">Atleta</th>
                        <th className="py-3 px-3">Tipo de treino</th>
                        <th className="py-3 px-3">PSE</th>
                        <th className="py-3 px-4">Observações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {highPse.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 text-xs whitespace-nowrap">{timeOf(r.created_at)}</td>
                          <td className="py-3 px-3 font-bold text-white">{nameOf(r.athlete_id)}</td>
                          <td className="py-3 px-3 text-xs">{r.training_type || '—'}</td>
                          <td className="py-3 px-3">
                            <PseBadge value={r.rpe_score!} />
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-400 max-w-xs">{r.observations || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* Tabela: quem não treinou (toque para ver o motivo) */}
          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <header className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                  <Ban className="w-4 h-4 text-amber-400" />
                  Não treinaram • {brDate(tableDay)}
                </h3>
                <p className="text-xs text-slate-500">Toque no atleta para ver o motivo.</p>
              </div>
              <span className="text-xs text-slate-400 flex-shrink-0">
                {notTrained.length} {notTrained.length === 1 ? 'atleta' : 'atletas'}
              </span>
            </header>

            {notTrained.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Ninguém marcou "não treinei" neste dia.</p>
            ) : (
              <ul className="divide-y divide-slate-800/60">
                {notTrained.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setReasonOpen(r)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-white text-sm truncate">{nameOf(r.athlete_id)}</p>
                        <p className="text-xs text-slate-400 truncate">
                          Enviado às {timeOf(r.created_at)} • {r.observations?.trim() || 'sem motivo informado'}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1 flex-shrink-0">
                        <StickyNote className="w-3.5 h-3.5" /> Ver motivo
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {reasonOpen && <ReasonDialog record={reasonOpen} name={nameOf(reasonOpen.athlete_id)} onClose={() => setReasonOpen(null)} />}

          {/* Tabela: variáveis da PSR abaixo de 5, por atleta */}
          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <header className="p-4 border-b border-slate-800 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-emerald-400" />
                  PSR abaixo de {PSR_LIMIT} por atleta • {brDate(tableDay)}
                </h3>
                <span className="text-xs text-slate-400 flex-shrink-0">
                  {lowPsrByAthlete.length} {lowPsrByAthlete.length === 1 ? 'atleta' : 'atletas'} • {lowPsrCount}{' '}
                  {lowPsrCount === 1 ? 'resposta' : 'respostas'}
                </span>
              </div>
              <p className="text-xs text-slate-500">Valores abaixo de {PSR_LIMIT} aparecem destacados em vermelho.</p>
            </header>

            {lowPsrByAthlete.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Nenhuma variável da PSR abaixo de {PSR_LIMIT} neste dia.</p>
            ) : (
              <>
                {/* Celular: um cartão por atleta, só as variáveis em alerta */}
                <ul className="sm:hidden divide-y divide-slate-800/60">
                  {lowPsrByAthlete.map(({ athleteId, records }) => (
                    <li key={athleteId} className="p-4 space-y-2">
                      <p className="font-bold text-white text-sm">{nameOf(athleteId)}</p>
                      {records.map((r) => (
                        <div key={r.id} className="flex items-start gap-3">
                          <span className="text-xs text-slate-400 w-12 flex-shrink-0 pt-1">{timeOf(r.created_at)}</span>
                          <div className="flex flex-wrap gap-1.5">
                            {PSR_VARIABLES.filter((v) => (r[v.key] as number) < PSR_LIMIT).map((v) => (
                              <span
                                key={v.key}
                                className="text-[11px] px-2 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/30 font-semibold"
                              >
                                {v.label}: {r[v.key] as number}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>

                {/* Computador: tabela completa, agrupada por atleta */}
                <div className="hidden sm:block overflow-x-auto max-h-[560px] overflow-y-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider sticky top-0">
                      <tr>
                        <th className="py-3 px-4">Atleta</th>
                        <th className="py-3 px-3">Envio</th>
                        {PSR_VARIABLES.map((v) => (
                          <th key={v.key} className="py-3 px-2 text-center" title={v.label}>
                            <span className="hidden lg:inline">{v.label}</span>
                            <span className="lg:hidden">{v.short}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lowPsrByAthlete.map(({ athleteId, records }) =>
                        records.map((r, i) => (
                          <tr key={r.id} className={`hover:bg-slate-800/40 transition-colors ${i === 0 ? 'border-t border-slate-700' : ''}`}>
                            {i === 0 && (
                              <td rowSpan={records.length} className="py-3 px-4 font-bold text-white align-top">
                                {nameOf(athleteId)}
                                <span className="block text-[11px] font-normal text-slate-500">
                                  {records.length} {records.length === 1 ? 'resposta' : 'respostas'}
                                </span>
                              </td>
                            )}
                            <td className="py-2.5 px-3 text-xs whitespace-nowrap">{timeOf(r.created_at)}</td>
                            {PSR_VARIABLES.map((v) => {
                              const value = r[v.key] as number;
                              const low = value < PSR_LIMIT;
                              return (
                                <td key={v.key} className="py-2.5 px-2 text-center">
                                  <span
                                    className={`inline-block min-w-[2rem] px-1.5 py-0.5 rounded-md text-xs ${
                                      low ? 'bg-red-500/15 text-red-300 border border-red-500/30 font-bold' : 'text-slate-500'
                                    }`}
                                    aria-label={low ? `${v.label} ${value}, abaixo de ${PSR_LIMIT}` : undefined}
                                  >
                                    {value}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
};

/** Motivo de não ter treinado */
const ReasonDialog: React.FC<{ record: PseRecord; name: string; onClose: () => void }> = ({ record, name, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Motivo de ${name}`}
      className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-amber-300 font-semibold flex items-center gap-1">
            <Ban className="w-3.5 h-3.5" /> Não treinou • {brDate(record.date)}
          </p>
          <h3 className="text-lg font-bold text-white break-words">{name}</h3>
          <p className="text-xs text-slate-400">Enviado às {timeOf(record.created_at)}</p>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white flex-shrink-0" title="Fechar">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-5 overflow-y-auto">
        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 flex items-center gap-1">
          <StickyNote className="w-3.5 h-3.5" /> Motivo informado pelo atleta
        </p>
        {record.observations?.trim() ? (
          <p className="text-sm text-slate-200 whitespace-pre-wrap break-words bg-slate-950 border border-slate-800 rounded-xl p-3">{record.observations}</p>
        ) : (
          <p className="text-sm text-slate-500 italic">Sem motivo informado (resposta enviada antes da regra que tornou o motivo obrigatório).</p>
        )}
      </div>
    </div>
  </div>
);

const PseBadge: React.FC<{ value: number }> = ({ value }) => (
  <span
    className={`inline-block text-xs px-2.5 py-1 rounded-lg border font-bold whitespace-nowrap ${
      value >= 8 ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    }`}
  >
    {value} / 10
  </span>
);
