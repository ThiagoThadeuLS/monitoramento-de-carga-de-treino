import { forwardRef } from 'react';
import { ClubInfo } from '../../../lib/club';
import { PseRecord, PsrRecord } from '../../../types';
import { sessionLoad } from '../../../lib/load';
import { ChartRenderer, ChartKind } from './ChartRenderer';

export interface ReportMetricConfig {
  id: string;
  label: string;
  enabled: boolean;
  view: 'table' | 'chart';
  chartKind: ChartKind;
}

export interface ReportState {
  from: string;
  to: string;
  notesGerais: string;
  notesLesoes: string;
  metrics: ReportMetricConfig[];
}

interface AthleteReportData {
  athlete: { id: string; nome: string; categoria?: string | null; classe?: string | null };
  pse: PseRecord[];
  psr: PsrRecord[];
}

interface Props {
  club: ClubInfo | null;
  coachName: string;
  periodLabel: string;
  state: ReportState;
  athletesData: AthleteReportData[];
}

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const metricLabel: Record<string, string> = {
  pse_medio: 'Média de PSE por dia',
  carga_ua: 'Carga (PSE x minutos) por dia',
  psr_medio: 'PSR Médio por dia',
  fadiga: 'Fadiga por dia',
  sono: 'Sono por dia',
  dor_muscular: 'Dor Muscular por dia',
  estresse: 'Estresse por dia',
  humor: 'Humor por dia',
};

export const ReportPreview = forwardRef<HTMLDivElement, Props>(({ club, coachName, periodLabel, state, athletesData }, ref) => {
  const enabled = state.metrics.filter((m) => m.enabled);

  const buildChartData = (athleteId: string, metricId: string) => {
    const data = athletesData.find((a) => a.athlete.id === athleteId);
    if (!data) return [];

    if (metricId === 'pse_medio') {
      const map = new Map<string, number[]>();
      for (const r of data.pse) {
        if (r.did_not_train || r.rpe_score == null) continue;
        const arr = map.get(r.date) ?? [];
        arr.push(r.rpe_score);
        map.set(r.date, arr);
      }
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, arr]) => ({ date: brDate(date), valor: Number((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2)) }));
    }

    if (metricId === 'carga_ua') {
      const map = new Map<string, number[]>();
      for (const r of data.pse) {
        const c = sessionLoad(r);
        if (c == null) continue;
        const arr = map.get(r.date) ?? [];
        arr.push(c);
        map.set(r.date, arr);
      }
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, arr]) => ({ date: brDate(date), valor: Math.round(arr.reduce((s, v) => s + v, 0)) }));
    }

    if (metricId === 'psr_medio') {
      return [...data.psr]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ date: brDate(r.date), valor: Number(r.psr_score) }));
    }
    if (metricId === 'fadiga') {
      return [...data.psr].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: brDate(r.date), valor: Number(r.fatigue_score) }));
    }
    if (metricId === 'sono') {
      return [...data.psr].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: brDate(r.date), valor: Number(r.sleep_score) }));
    }
    if (metricId === 'dor_muscular') {
      return [...data.psr].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: brDate(r.date), valor: Number(r.muscle_soreness_score) }));
    }
    if (metricId === 'estresse') {
      return [...data.psr].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: brDate(r.date), valor: Number(r.stress_score) }));
    }
    if (metricId === 'humor') {
      return [...data.psr].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: brDate(r.date), valor: Number(r.mood_score) }));
    }
    return [];
  };

  return (
    <div ref={ref} style={{ width: 1100, maxWidth: 1100, background: '#ffffff', color: '#0f172a', fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <div style={{ padding: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {club?.escudo_url ? (
              <img src={club.escudo_url} alt="Escudo" style={{ height: 72, width: 'auto' }} crossOrigin="anonymous" />
            ) : (
              <div style={{ height: 72, width: 72, borderRadius: 14, background: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 22 }}>
                {(club?.nome || 'CL').slice(0, 3).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{club?.nome || 'Clube'}</div>
              <div style={{ fontSize: 12, color: '#475569' }}>Relatório de Carga, Bem-Estar e Acompanhamento</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b' }}>Exportado por</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{coachName}</div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Período: {periodLabel}</div>
          </div>
        </div>

        {(state.notesGerais || state.notesLesoes) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {state.notesGerais && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Anotações gerais</div>
                <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{state.notesGerais}</div>
              </div>
            )}
            {state.notesLesoes && (
              <div style={{ border: '1px solid #fecaca', borderRadius: 16, padding: 18, background: '#fef2f2' }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, color: '#991b1b' }}>Anotações sobre lesões</div>
                <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#7f1d1d' }}>{state.notesLesoes}</div>
              </div>
            )}
          </div>
        )}

        {athletesData.map((item, idx) => (
          <div key={item.athlete.id} style={{ pageBreakAfter: idx < athletesData.length - 1 ? 'always' : 'auto', marginBottom: 40 }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 18, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b' }}>Atleta</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{item.athlete.nome}</div>
                {(item.athlete.categoria || item.athlete.classe) && (
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{[item.athlete.categoria, item.athlete.classe].filter(Boolean).join(' • ')}</div>
                )}
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: '#475569' }}>
                <div>{item.pse.length} registros de PSE</div>
                <div>{item.psr.length} registros de PSR</div>
              </div>
            </div>

            {enabled.map((metric) => {
              const chartData = buildChartData(item.athlete.id, metric.id);
              return (
                <div key={metric.id} style={{ border: '1px solid #e2e8f0', borderRadius: 18, marginBottom: 18, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{metricLabel[metric.id] || metric.label}</div>
                    <div style={{ fontSize: 11, color: '#475569' }}>{metric.view === 'chart' ? `Gráfico • ${metric.chartKind}` : 'Tabela'}</div>
                  </div>
                  <div style={{ padding: 18 }}>
                    {metric.view === 'chart' ? (
                      <ChartRenderer kind={metric.chartKind} data={chartData.map((d) => ({ ...d, valor: d.valor }))} dataKey="valor" xKey="date" height={280} />
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            <th style={{ textAlign: 'left', padding: '8px 10px', border: '1px solid #e2e8f0' }}>Data</th>
                            <th style={{ textAlign: 'center', padding: '8px 10px', border: '1px solid #e2e8f0' }}>{metricLabel[metric.id] || metric.label}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chartData.map((row, i) => (
                            <tr key={i}>
                              <td style={{ padding: '7px 10px', border: '1px solid #e2e8f0' }}>{row.date}</td>
                              <td style={{ padding: '7px 10px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700 }}>{row.valor}</td>
                            </tr>
                          ))}
                          {chartData.length === 0 && (
                            <tr>
                              <td colSpan={2} style={{ padding: '10px', textAlign: 'center', color: '#94a3b8' }}>Sem dados no período</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              );
            })}

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Detalhamento PSE / PSR</div>
              </div>
              <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>PSE</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ textAlign: 'left', padding: '7px 8px', border: '1px solid #e2e8f0' }}>Data</th>
                        <th style={{ textAlign: 'left', padding: '7px 8px', border: '1px solid #e2e8f0' }}>Tipo</th>
                        <th style={{ textAlign: 'center', padding: '7px 8px', border: '1px solid #e2e8f0' }}>PSE</th>
                        <th style={{ textAlign: 'center', padding: '7px 8px', border: '1px solid #e2e8f0' }}>Min</th>
                        <th style={{ textAlign: 'center', padding: '7px 8px', border: '1px solid #e2e8f0' }}>UA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.pse
                        .slice()
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map((r, i) => (
                          <tr key={i}>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{brDate(r.date)}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{r.training_type || '-'}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{r.did_not_train ? '—' : r.rpe_score ?? '-'}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{r.did_not_train ? '—' : r.duration_minutes ?? '-'}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{r.did_not_train ? '—' : sessionLoad(r) ?? '-'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>PSR</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ textAlign: 'left', padding: '7px 8px', border: '1px solid #e2e8f0' }}>Data</th>
                        <th style={{ textAlign: 'center', padding: '7px 8px', border: '1px solid #e2e8f0' }}>Recup.</th>
                        <th style={{ textAlign: 'center', padding: '7px 8px', border: '1px solid #e2e8f0' }}>Fadiga</th>
                        <th style={{ textAlign: 'center', padding: '7px 8px', border: '1px solid #e2e8f0' }}>Sono</th>
                        <th style={{ textAlign: 'center', padding: '7px 8px', border: '1px solid #e2e8f0' }}>Dor</th>
                        <th style={{ textAlign: 'center', padding: '7px 8px', border: '1px solid #e2e8f0' }}>Estresse</th>
                        <th style={{ textAlign: 'center', padding: '7px 8px', border: '1px solid #e2e8f0' }}>Humor</th>
                        <th style={{ textAlign: 'center', padding: '7px 8px', border: '1px solid #e2e8f0' }}>PSR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.psr
                        .slice()
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map((r, i) => (
                          <tr key={i}>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{brDate(r.date)}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{r.psr_score}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{r.fatigue_score}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{r.sleep_score}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{r.muscle_soreness_score}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{r.stress_score}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{r.mood_score}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 800 }}>{r.psr_score}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

ReportPreview.displayName = 'ReportPreview';
