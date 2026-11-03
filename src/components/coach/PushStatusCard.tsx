import React, { useEffect, useState } from 'react';
import { BellOff, BellRing, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { brDateOfStamp, timeOfStamp } from '../../lib/date';

interface Row {
  athlete_id: string;
  nome: string;
  has_password: boolean;
  active_devices: number;
  expired_devices: number;
  last_sent_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
}

const when = (iso: string | null) => (iso ? `${brDateOfStamp(iso)} ${timeOfStamp(iso)}` : '');

/** Por que o atleta não recebe (null = recebendo) */
function problem(r: Row): string | null {
  if (!r.has_password) return 'Ainda não entrou no app (não criou a senha).';
  if (r.active_devices === 0 && r.expired_devices > 0)
    return 'As notificações deste aparelho expiraram. Peça para abrir o app e tocar em "Ativar notificações".';
  if (r.active_devices === 0) return 'Nunca ativou as notificações (ou usa o app só no computador).';
  if (r.last_error_at && (!r.last_sent_at || r.last_error_at > r.last_sent_at))
    return `O último envio falhou (${when(r.last_error_at)}). O app vai pedir para ativar de novo se continuar falhando.`;
  return null;
}

/** Treinador: quem recebe os lembretes e quem não (com o motivo). */
export const PushStatusCard: React.FC = () => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    setError('');
    supabase.rpc('coach_push_status').then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) {
        setError(/coach_push_status/.test(err.message) ? 'Rode o arquivo supabase_completo.sql no Supabase para ver esta lista.' : err.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as Row[]);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (rows === null) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Conferindo as notificações dos atletas...
      </div>
    );
  }

  const withProblem = rows.map((r) => ({ r, p: problem(r) })).filter((x) => x.p);
  const ok = rows.length - withProblem.length;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${withProblem.length ? 'bg-amber-500/15' : 'bg-emerald-500/15'}`}>
          {withProblem.length ? <BellOff className="w-4 h-4 text-amber-300" /> : <BellRing className="w-4 h-4 text-emerald-300" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Notificações dos atletas</p>
          <p className="text-xs text-slate-400">
            {error || `${ok} de ${rows.length} recebendo${withProblem.length ? ` • ${withProblem.length} com problema` : ''}`}
          </p>
        </div>
        <button type="button" onClick={() => setVersion((v) => v + 1)} className="p-2 text-slate-400 hover:text-white" title="Atualizar">
          <RefreshCw className="w-4 h-4" />
        </button>
        {withProblem.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1"
          >
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {open ? 'Ocultar' : 'Ver quem'}
          </button>
        )}
      </div>

      {open && (
        <ul className="divide-y divide-slate-800 border-t border-slate-800">
          {withProblem.map(({ r, p }) => (
            <li key={r.athlete_id} className="py-2.5">
              <p className="text-sm font-semibold text-white">{r.nome}</p>
              <p className="text-xs text-amber-200/90">{p}</p>
              {r.last_error && <p className="text-[11px] text-slate-500 break-words">Erro: {r.last_error}</p>}
              {r.last_sent_at && <p className="text-[11px] text-slate-500">Último aviso entregue: {when(r.last_sent_at)}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
