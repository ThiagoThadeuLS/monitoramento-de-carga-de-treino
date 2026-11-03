import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import {
  CoachPhysioCaseDetail,
  PHYSIO_RETURN_TONE,
  PHYSIO_STATUS_LABEL,
  PHYSIO_STATUS_TONE,
  PhysioSummary,
  coachPhysioCaseDetail,
  coachPhysioSummary,
  formatPhysioRegion,
  physioReturnInfo,
} from '../../lib/physio';

const dateBR = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

const painTone = (v?: number | null) =>
  v == null ? 'text-slate-400' : v <= 3 ? 'text-emerald-300' : v <= 6 ? 'text-amber-300' : 'text-red-300';

/** Cartão da tela Hoje do treinador: quem está na fisioterapia e a previsão de retorno. */
export const PhysioSummaryCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const [rows, setRows] = useState<PhysioSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    coachPhysioSummary()
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const active = (rows ?? []).filter((r) => r.status !== 'alta');
  if (!rows || active.length === 0) return null;

  const late = active.filter((r) => {
    const info = physioReturnInfo(r);
    return info.state === 'atrasado' || info.state === 'atencao';
  });

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3">
      <button type="button" onClick={onOpen} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
            <HeartPulse className="w-5 h-5 text-sky-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Fisioterapia</p>
            <p className="text-xs text-slate-400">
              {active.length} em acompanhamento
              {late.length > 0 && <span className="text-amber-300"> • {late.length} com prazo próximo</span>}
            </p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
      </button>

      <ul className="space-y-1.5">
        {active.slice(0, 3).map((r) => {
          const ret = physioReturnInfo(r);
          return (
            <li key={r.case_id} className="flex items-center gap-2 text-xs bg-slate-950/50 border border-slate-800 rounded-xl px-3 py-2">
              <span className="font-bold text-white truncate flex-1">{r.athlete_nome}</span>
              <span className="text-slate-400 truncate hidden sm:inline">{formatPhysioRegion(r.regiao, r.lado)}</span>
              <span className={`px-2 py-0.5 rounded-md border font-bold flex-shrink-0 ${PHYSIO_RETURN_TONE[ret.state]}`}>{ret.label}</span>
            </li>
          );
        })}
      </ul>
      {active.length > 3 && <p className="text-[11px] text-slate-500 px-1">+{active.length - 3} outro{active.length - 3 > 1 ? 's' : ''} caso{active.length - 3 > 1 ? 's' : ''}</p>}
    </div>
  );
};

/** Elenco → Fisioterapia: visão somente leitura dos casos (sem notas clínicas privadas). */
export const PhysioManagement: React.FC = () => {
  const [rows, setRows] = useState<PhysioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CoachPhysioCaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    coachPhysioSummary()
      .then((r) => !cancelled && setRows(r))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (caseId: string) => {
    if (openId === caseId) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(caseId);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await coachPhysioCaseDetail(caseId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const visible = rows.filter((r) => !onlyActive || r.status !== 'alta');

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Fisioterapia</p>
          <p className="text-xs text-slate-400">
            Restrições, previsão de retorno, dor e critérios. As notas clínicas ficam só com a fisioterapia.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOnlyActive((v) => !v)}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold border flex-shrink-0 ${
            onlyActive ? 'bg-slate-100 text-slate-950 border-slate-100' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          {onlyActive ? 'Só em acompanhamento' : 'Todos os casos'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
        </div>
      ) : visible.length === 0 ? (
        <div className="py-14 text-center text-slate-400 space-y-1 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <HeartPulse className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">Nenhum atleta na fisioterapia</p>
          <p className="text-xs">Quando a fisioterapia abrir um caso, ele aparece aqui e na tela Hoje.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => {
            const ret = physioReturnInfo(r);
            const open = openId === r.case_id;
            return (
              <li key={r.case_id} className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
                <button type="button" onClick={() => toggle(r.case_id)} className="w-full text-left p-4 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white truncate">{r.athlete_nome}</p>
                      <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold ${PHYSIO_STATUS_TONE[r.status]}`}>
                        {PHYSIO_STATUS_LABEL[r.status]}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold inline-flex items-center gap-1 ${PHYSIO_RETURN_TONE[ret.state]}`}>
                        {r.status === 'alta' ? <CheckCircle2 className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
                        {ret.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{formatPhysioRegion(r.regiao, r.lado)}</p>
                    {r.restricao && <p className="text-xs text-amber-200 mt-1">Restrição: {r.restricao}</p>}
                  </div>
                  <ChevronRight className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>

                {open && (
                  <div className="border-t border-slate-800 p-4 pt-3 space-y-3 bg-slate-950/30">
                    {detailLoading ? (
                      <div className="py-6 flex justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
                      </div>
                    ) : !detail ? (
                      <p className="text-xs text-slate-500">Não foi possível carregar o caso.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
                            <p className="text-slate-500">Última dor (repouso / mov.)</p>
                            <p className="font-semibold">
                              <span className={painTone(r.dor_ultima)}>{r.dor_ultima ?? '—'}</span>
                              <span className="text-slate-500"> / </span>
                              <span className={painTone(r.dor_movimento_ultima)}>{r.dor_movimento_ultima ?? '—'}</span>
                            </p>
                          </div>
                          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
                            <p className="text-slate-500">Última sessão</p>
                            <p className="text-slate-200 font-semibold">{dateBR(r.ultima_sessao)}</p>
                          </div>
                          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
                            <p className="text-slate-500">Critérios</p>
                            <p className="text-slate-200 font-semibold">
                              {r.criterios_cumpridos}/{r.criterios_total}
                            </p>
                          </div>
                          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
                            <p className="text-slate-500">Exercícios ativos</p>
                            <p className="text-slate-200 font-semibold">{r.prescricoes_ativas}</p>
                          </div>
                        </div>

                        {detail.case.observacoes_treinador && (
                          <p className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2">
                            <ShieldAlert className="w-3.5 h-3.5 inline mr-1.5 text-sky-400" />
                            {detail.case.observacoes_treinador}
                          </p>
                        )}

                        {detail.criteria.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                              <ClipboardList className="w-3.5 h-3.5" /> Critérios de retorno
                            </p>
                            <ul className="space-y-1">
                              {detail.criteria.map((cr) => (
                                <li key={cr.id} className="flex items-center gap-2 text-xs">
                                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${cr.cumprido ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-600'}`}>
                                    {cr.cumprido && <CheckCircle2 className="w-3 h-3" />}
                                  </span>
                                  <span className={cr.cumprido ? 'text-slate-400 line-through' : 'text-slate-200'}>{cr.descricao}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {detail.prescriptions.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                              <Dumbbell className="w-3.5 h-3.5" /> Plano atual
                            </p>
                            <ul className="space-y-1">
                              {detail.prescriptions.map((p) => (
                                <li key={p.id} className="text-xs text-slate-300">
                                  <span className="font-semibold text-white">{p.nome}</span>
                                  {(p.series || p.repeticoes || p.frequencia) && (
                                    <span className="text-slate-500">
                                      {' '}
                                      • {[p.series && `${p.series}x`, p.repeticoes, p.frequencia].filter(Boolean).join(' ')}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {detail.sessions.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Evolução da dor (últimas sessões)</p>
                            <div className="flex items-end gap-1.5 h-16">
                              {detail.sessions.slice(-14).map((s, i) => {
                                const h = Math.max(4, ((s.dor_movimento ?? 0) / 10) * 100);
                                return (
                                  <div key={`${s.date}-${i}`} className="flex-1 flex flex-col items-center justify-end gap-0.5" title={`${dateBR(s.date)} • dor ${s.dor_movimento ?? '—'}`}>
                                    <span className="text-[9px] text-slate-400">{s.dor_movimento ?? '—'}</span>
                                    <div
                                      className={`w-full rounded-t ${(s.dor_movimento ?? 0) >= 7 ? 'bg-red-400/80' : (s.dor_movimento ?? 0) >= 4 ? 'bg-amber-400/80' : 'bg-emerald-400/80'}`}
                                      style={{ height: `${h}%` }}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <p className="text-[10px] text-slate-600">
                          Início {dateBR(detail.case.inicio)}
                          {detail.case.retorno_real ? ` • alta em ${dateBR(detail.case.retorno_real)}` : ''}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
