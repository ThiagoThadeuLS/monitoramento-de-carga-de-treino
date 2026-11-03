import React, { useEffect, useMemo, useState } from 'react';
import { Gauge, RefreshCw, Loader2, AlertCircle, Download, Info, ChevronRight, ChevronDown, TriangleAlert, Timer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { addDaysISO, todayISO } from '../../lib/date';
import { PseRecord } from '../../types';
import { useClubGroups } from '../../lib/groups';
import { fetchClubAthletes } from '../../lib/athletes';
import { useClub } from '../../lib/club';
import { AthleteSelection, EMPTY_SELECTION, GroupFilter, resolveSelection, selectionLabel } from './GroupFilter';
import { DailyStatsChart } from './DailyStatsChart';
import { MONOTONY_LIMIT, ZONE_INFO, dailyLoads, format2, formatUA, groupSeries, loadMetrics, sessionLoad } from '../../lib/load';
import { brDate, downloadCsv, fileSlug, toCsv } from '../../lib/export';

interface AthleteRow {
  id: string;
  nome: string;
  active: boolean;
}

/** Busca paginada (o Supabase devolve no máximo 1000 linhas por vez). */
async function fetchPse(from: string, to: string): Promise<PseRecord[]> {
  const rows: PseRecord[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase!
      .from('pse_records')
      .select('id, athlete_id, date, training_type, rpe_score, did_not_train, duration_minutes, created_at')
      .gte('date', from)
      .lte('date', to)
      .order('date')
      .order('id')
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as PseRecord[]));
    if (!data || data.length < 1000) return rows;
  }
}

type SortKey = 'acwr' | 'acute' | 'monotony' | 'nome';

/** Aba Carga: carga interna (PSE x minutos), ACWR, monotonia e strain por atleta e do grupo. */
export const LoadAnalysis: React.FC<{ onOpenProfile?: (athleteId: string) => void }> = ({ onOpenProfile }) => {
  const [ref, setRef] = useState(todayISO);
  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [pse, setPse] = useState<PseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<AthleteSelection>(EMPTY_SELECTION);
  const [sort, setSort] = useState<SortKey>('acwr');
  const [help, setHelp] = useState(false);
  const { groups } = useClubGroups();
  const { club } = useClub();
  const clubId = club?.id ?? null;

  const from = addDaysISO(ref, -55); // 28 dias de gráfico + 28 de histórico para a carga crônica

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!supabase) return;
    // Trocar a data rápido: só a última busca atualiza a tela
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([fetchClubAthletes(clubId, reloadKey > 0), fetchPse(from, ref)])
      .then(([a, p]) => {
        if (cancelled) return;
        setAthletes(a);
        setPse(p);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(
          /duration_minutes/.test(err?.message ?? '')
            ? 'A carga interna ainda não foi ativada no banco. Rode o arquivo supabase_completo.sql no Supabase.'
            : `Não foi possível carregar: ${err?.message ?? err}`
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, ref, reloadKey, clubId]);

  const selected = useMemo(() => resolveSelection(selection, groups), [selection, groups]);
  const people = useMemo(
    () => athletes.filter((a) => a.active && (!selected || selected.has(a.id))),
    [athletes, selected]
  );
  const perAthlete = useMemo(() => dailyLoads(pse), [pse]);
  const missingDuration = useMemo(() => {
    const ids = new Set(people.map((p) => p.id));
    return pse.filter((r) => !r.did_not_train && r.rpe_score && !r.duration_minutes && ids.has(r.athlete_id)).length;
  }, [pse, people]);

  const rows = useMemo(() => {
    const weekStart = addDaysISO(ref, -6);
    const weekSessions = new Map<string, number>();
    for (const r of pse) {
      if (r.date >= weekStart && r.date <= ref && sessionLoad(r) !== null) {
        weekSessions.set(r.athlete_id, (weekSessions.get(r.athlete_id) ?? 0) + 1);
      }
    }
    const list = people.map((a) => ({ ...a, m: loadMetrics(perAthlete.get(a.id), ref, weekSessions.get(a.id) ?? 0) }));
    const val = (r: (typeof list)[number]) =>
      sort === 'acwr' ? r.m.acwr ?? -1 : sort === 'acute' ? r.m.acute : sort === 'monotony' ? r.m.monotony ?? -1 : 0;
    return list.sort((x, y) => (sort === 'nome' ? x.nome.localeCompare(y.nome, 'pt-BR') : val(y) - val(x)));
  }, [people, perAthlete, pse, ref, sort]);

  const days = useMemo(() => Array.from({ length: 28 }, (_, k) => addDaysISO(ref, -(27 - k))), [ref]);
  const series = useMemo(() => groupSeries(perAthlete, people.map((p) => p.id), days), [perAthlete, people, days]);
  const groupNow = series[series.length - 1];
  const withData = rows.filter((r) => r.m.acute > 0 || r.m.chronic > 0);
  const atRisk = rows.filter((r) => r.m.zone === 'risco').length;
  const highMonotony = rows.filter((r) => (r.m.monotony ?? 0) > MONOTONY_LIMIT).length;
  const avgAcute = withData.length ? withData.reduce((a, r) => a + r.m.acute, 0) / withData.length : 0;
  const label = selected ? selectionLabel(selection, groups, athletes) : 'Todos os atletas';

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: 'Atleta', value: (r) => r.nome },
      { label: 'Data de referência', value: () => brDate(ref) },
      { label: 'Carga aguda 7 dias (UA)', value: (r) => Math.round(r.m.acute) },
      { label: 'Carga crônica semanal (UA)', value: (r) => Math.round(r.m.chronic) },
      { label: 'ACWR', value: (r) => (r.m.acwr === null ? null : Math.round(r.m.acwr * 100) / 100) },
      { label: 'Zona', value: (r) => (r.m.zone ? ZONE_INFO[r.m.zone].label : '') },
      { label: 'Monotonia', value: (r) => (r.m.monotony === null ? null : Math.round(r.m.monotony * 100) / 100) },
      { label: 'Strain', value: (r) => (r.m.strain === null ? null : Math.round(r.m.strain)) },
      { label: 'Treinos na semana', value: (r) => r.m.sessions },
      { label: 'Dados insuficientes (<3 semanas)', value: (r) => r.m.insufficient },
    ]);
    downloadCsv(fileSlug('carga', ref), csv);
  };

  const zoneBadge = (r: (typeof rows)[number]) =>
    r.m.zone ? (
      <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold whitespace-nowrap ${ZONE_INFO[r.m.zone].cls}`}>
        {format2(r.m.acwr)} • {ZONE_INFO[r.m.zone].label}
      </span>
    ) : (
      <span className="text-xs text-slate-500">—</span>
    );

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div data-tour="load-filters" className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex items-center gap-2 text-sky-400 sm:pb-2.5">
            <Gauge className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Carga interna</span>
          </div>
          <label className="block">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Até o dia</span>
            <div className="flex gap-2">
              <input
                type="date"
                value={ref}
                max={todayISO()}
                onChange={(e) => e.target.value && setRef(e.target.value)}
                className="flex-1 sm:flex-none bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="button"
                onClick={() => setRef(todayISO())}
                className="px-3 py-2 rounded-lg text-xs font-bold border bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800"
              >
                Hoje
              </button>
            </div>
          </label>
          <GroupFilter groups={groups} athletes={athletes.filter((a) => a.active)} value={selection} onChange={setSelection} className="sm:w-64" />
          <div className="flex gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={exportCsv}
              disabled={loading || !rows.length}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> Exportar
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </button>
          </div>
        </div>

        <button type="button" onClick={() => setHelp(!help)} className="flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300">
          <Info className="w-3.5 h-3.5" /> Como ler os indicadores {help ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        {help && (
          <ul className="text-xs text-slate-300 space-y-1.5 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
            <li><strong className="text-white">Carga da sessão (UA)</strong> = PSE × duração em minutos (método de Foster).</li>
            <li><strong className="text-white">Aguda</strong>: soma dos últimos 7 dias. <strong className="text-white">Crônica</strong>: média semanal dos últimos 28 dias.</li>
            <li>
              <strong className="text-white">ACWR</strong> = aguda ÷ crônica. Abaixo de 0,8: carga baixa • 0,8 a 1,3: zona ideal • 1,3 a 1,5: atenção •
              acima de 1,5: risco aumentado de lesão.
            </li>
            <li><strong className="text-white">Monotonia</strong> = média diária ÷ desvio-padrão da semana. Acima de 2: semana pouco variada.</li>
            <li><strong className="text-white">Strain</strong> = carga aguda × monotonia (estresse total da semana).</li>
            <li>Atletas com menos de 3 semanas de dados aparecem com “*”: o ACWR ainda é pouco confiável.</li>
          </ul>
        )}
      </div>

      {error ? (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <p className="text-sm">Calculando a carga...</p>
        </div>
      ) : (
        <>
          {missingDuration > 0 && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-start gap-2.5 text-amber-200 text-xs">
              <Timer className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {missingDuration} PSE sem duração no período (enviadas antes desta versão ou sem treino no cronograma) ficaram fora do cálculo de carga.
              </span>
            </div>
          )}

          {/* Resumo */}
          <div data-tour="load-cards" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card title="Carga média 7 dias" value={`${formatUA(avgAcute)} UA`} hint={`por atleta • ${label}`} />
            <Card
              title="ACWR do grupo"
              value={format2(groupNow?.acwr ?? null)}
              hint={groupNow?.acwr ? ZONE_INFO[groupNow.acwr < 0.8 ? 'baixa' : groupNow.acwr <= 1.3 ? 'ideal' : groupNow.acwr <= 1.5 ? 'atencao' : 'risco'].label : 'sem dados'}
            />
            <Card title="Em risco (ACWR > 1,5)" value={String(atRisk)} hint={`de ${rows.length} atletas`} alert={atRisk > 0} />
            <Card title="Monotonia alta (> 2)" value={String(highMonotony)} hint="semana pouco variada" alert={highMonotony > 0} />
          </div>

          <div data-tour="load-charts" className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <DailyStatsChart
              title="Carga média diária por atleta"
              subtitle={`UA (PSE × minutos) • últimos 28 dias até ${brDate(ref)}`}
              dates={days}
              scale="auto"
              unit="UA"
              lines={[{ key: 'load', label: 'Carga', color: '#3987e5', shape: 'circle', values: series.map((s) => (s.load > 0 ? s.load : null)) }]}
            />
            <DailyStatsChart
              title="ACWR do grupo"
              subtitle="Carga aguda (7 dias) ÷ crônica (28 dias)"
              dates={days}
              scale="auto"
              references={[
                { value: 0.8, label: '0,8', color: '#38bdf8' },
                { value: 1.3, label: '1,3', color: '#34d399' },
                { value: 1.5, label: '1,5 risco', color: '#f87171' },
              ]}
              lines={[{ key: 'acwr', label: 'ACWR', color: '#d95926', shape: 'square', values: series.map((s) => s.acwr) }]}
            />
          </div>

          {/* Por atleta */}
          <section data-tour="load-table" className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <header className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-white text-sm sm:text-base">Carga por atleta • até {brDate(ref)}</h3>
                <p className="text-xs text-slate-500">Toque no atleta para abrir a ficha completa.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                Ordenar por
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="acwr">ACWR</option>
                  <option value="acute">Carga 7 dias</option>
                  <option value="monotony">Monotonia</option>
                  <option value="nome">Nome</option>
                </select>
              </label>
            </header>

            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Nenhum atleta ativo nesta seleção.</p>
            ) : (
              <>
                <ul className="md:hidden divide-y divide-slate-800/60">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => onOpenProfile?.(r.id)} className="w-full text-left p-4 space-y-2 hover:bg-slate-800/40">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-white text-sm truncate">
                            {r.nome}
                            {r.m.insufficient && r.m.acwr !== null ? ' *' : ''}
                          </p>
                          {zoneBadge(r)}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                          <span>7 dias <strong className="block text-sm text-white">{formatUA(r.m.acute)}</strong></span>
                          <span>Monotonia <strong className={`block text-sm ${(r.m.monotony ?? 0) > MONOTONY_LIMIT ? 'text-amber-300' : 'text-white'}`}>{format2(r.m.monotony)}</strong></span>
                          <span>Strain <strong className="block text-sm text-white">{r.m.strain === null ? '—' : formatUA(r.m.strain)}</strong></span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block overflow-x-auto max-h-[560px] overflow-y-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider sticky top-0">
                      <tr>
                        <th className="py-3 px-4">Atleta</th>
                        <th className="py-3 px-3 text-right">Aguda (7d)</th>
                        <th className="py-3 px-3 text-right">Crônica</th>
                        <th className="py-3 px-3">ACWR</th>
                        <th className="py-3 px-3 text-right">Monotonia</th>
                        <th className="py-3 px-3 text-right">Strain</th>
                        <th className="py-3 px-4 text-right">Treinos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {rows.map((r) => (
                        <tr key={r.id} onClick={() => onOpenProfile?.(r.id)} className="hover:bg-slate-800/40 cursor-pointer">
                          <td className="py-3 px-4 font-bold text-white">
                            {r.nome}
                            {r.m.insufficient && r.m.acwr !== null ? <span className="text-slate-500" title="Menos de 3 semanas de dados"> *</span> : null}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums">{formatUA(r.m.acute)}</td>
                          <td className="py-3 px-3 text-right tabular-nums">{formatUA(r.m.chronic)}</td>
                          <td className="py-3 px-3">{zoneBadge(r)}</td>
                          <td className={`py-3 px-3 text-right tabular-nums ${(r.m.monotony ?? 0) > MONOTONY_LIMIT ? 'text-amber-300 font-bold' : ''}`}>
                            {(r.m.monotony ?? 0) > MONOTONY_LIMIT && <TriangleAlert className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
                            {format2(r.m.monotony)}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums">{r.m.strain === null ? '—' : formatUA(r.m.strain)}</td>
                          <td className="py-3 px-4 text-right tabular-nums">{r.m.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
};

const Card: React.FC<{ title: string; value: string; hint: string; alert?: boolean }> = ({ title, value, hint, alert }) => (
  <div className={`bg-slate-900/90 border rounded-2xl p-4 min-w-0 ${alert ? 'border-red-500/40' : 'border-slate-800'}`}>
    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{title}</p>
    <p className={`text-xl sm:text-2xl font-black mt-1 ${alert ? 'text-red-300' : 'text-white'}`}>{value}</p>
    <p className="text-[11px] text-slate-500 truncate">{hint}</p>
  </div>
);
