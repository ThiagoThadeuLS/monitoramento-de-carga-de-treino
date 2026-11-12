import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, HeartPulse, Loader2, Link2, RefreshCw, Unlink } from 'lucide-react';
import { useDialogs } from '../ui/Dialogs';
import { brDate } from '../../lib/export';
import { brDateOfStamp } from '../../lib/date';
import {
  athleteWhoop,
  disconnectWhoop,
  startWhoopConnection,
  syncMyWhoop,
  whoopNumber,
  type WhoopStatus,
} from '../../lib/whoop';

/**
 * WHOOP no perfil do atleta: conectar a própria conta, atualizar e desconectar.
 * O atleta vê só os números dele; as dobras e o cadastro ficam com a comissão.
 */
export const WhoopCard: React.FC<{ token: string }> = ({ token }) => {
  const { notify, confirm } = useDialogs();
  const [status, setStatus] = useState<WhoopStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'conectar' | 'sync' | 'sair'>('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStatus(await athleteWhoop(token));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    athleteWhoop(token)
      .then((data) => !cancelled && setStatus(data))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const connect = async () => {
    setBusy('conectar');
    setError('');
    try {
      window.location.href = await startWhoopConnection(token);
    } catch (err) {
      setError((err as Error).message);
      setBusy('');
    }
  };

  const sync = async () => {
    setBusy('sync');
    setError('');
    try {
      await syncMyWhoop(token);
      await load();
      notify('Dados da WHOOP atualizados.', 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Desconectar o WHOOP?',
      message:
        'A comissão técnica deixa de ver seus dados da WHOOP e o que já foi importado sai do app. Você pode conectar de novo quando quiser.',
      confirmLabel: 'Desconectar',
      danger: true,
    });
    if (!ok) return;
    setBusy('sair');
    try {
      await disconnectWhoop(token);
      await load();
      notify('WHOOP desconectado.', 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const days = (status?.days ?? []).slice(0, 5);
  const last = days[0] ?? null;

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <HeartPulse className="w-5 h-5 text-rose-400" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-white text-sm">WHOOP</h2>
          <p className="text-[11px] text-slate-500">Recuperação, sono e esforço direto da sua pulseira</p>
        </div>
        {status?.connected && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            conectado
          </span>
        )}
      </header>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 text-[12px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : !status?.connected ? (
          <>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              Conecte a conta da sua pulseira WHOOP para a comissão técnica acompanhar sua recuperação e seu sono. Você
              autoriza na própria WHOOP e pode desconectar quando quiser.
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Ao conectar, você autoriza a leitura de recuperação, sono e esforço. Veja o que fazemos com esses dados na{' '}
              <a href="/privacidade#whoop" className="text-sky-300 hover:text-sky-200 underline underline-offset-2">
                Política de Privacidade
              </a>
              .
            </p>
            <button
              type="button"
              onClick={connect}
              disabled={busy === 'conectar'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 text-sm font-black disabled:opacity-50"
            >
              {busy === 'conectar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Conectar meu WHOOP
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="truncate">{status.whoop_name ? status.whoop_name : 'Conta WHOOP conectada'}</span>
              <span className="flex-shrink-0">
                {status.last_sync_at ? `atualizado ${brDateOfStamp(status.last_sync_at)}` : 'sem leitura ainda'}
              </span>
            </div>

            {last ? (
              <div className="grid grid-cols-3 gap-2">
                <Mini label="Recuperação" value={fmt(last.recovery_score, '%')} tone={recoveryTone(last.recovery_score)} />
                <Mini label="Sono" value={fmt(last.sleep_hours, ' h', 1)} />
                <Mini label="Strain" value={fmt(last.strain, '', 1)} />
              </div>
            ) : (
              <p className="text-[12px] text-slate-400">
                Nenhum dia importado ainda. A pulseira precisa ter dormido com você ao menos uma noite desde a conexão.
              </p>
            )}

            {days.length > 0 && (
              <ul className="divide-y divide-slate-800/70 rounded-xl border border-slate-800 overflow-hidden">
                {days.map((d) => (
                  <li key={d.date} className="px-3 py-2 flex items-center gap-2 text-[11px]">
                    <span className="text-slate-400 w-10 flex-shrink-0">{brDate(d.date).slice(0, 5)}</span>
                    <span className={`font-bold ${toneClass(recoveryTone(d.recovery_score))}`}>
                      {fmt(d.recovery_score, '%')}
                    </span>
                    <span className="text-slate-500 ml-auto">
                      sono {fmt(d.sleep_hours, ' h', 1)} • strain {fmt(d.strain, '', 1)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {status.last_error && (
              <p className="text-[11px] text-amber-300/90">
                A última atualização falhou. Toque em atualizar; se continuar, reconecte a WHOOP.
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={sync}
                disabled={busy !== ''}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold disabled:opacity-50"
              >
                {busy === 'sync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Atualizar
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={busy !== ''}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-500/40 text-xs font-bold disabled:opacity-50"
              >
                {busy === 'sair' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                Desconectar
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

const fmt = (value: unknown, suffix = '', digits = 0) => {
  const n = whoopNumber(value);
  if (n === null) return '—';
  return `${n.toFixed(digits).replace('.', ',')}${suffix}`;
};

type Tone = 'bom' | 'medio' | 'baixo' | 'sem';
const recoveryTone = (value: unknown): Tone => {
  const n = whoopNumber(value);
  if (n === null) return 'sem';
  if (n >= 67) return 'bom';
  if (n >= 34) return 'medio';
  return 'baixo';
};
const toneClass = (tone: Tone) =>
  tone === 'bom' ? 'text-emerald-300' : tone === 'medio' ? 'text-amber-300' : tone === 'baixo' ? 'text-rose-300' : 'text-slate-500';

const Mini: React.FC<{ label: string; value: string; tone?: Tone }> = ({ label, value, tone = 'sem' }) => (
  <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2">
    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
    <p className={`text-lg font-black ${toneClass(tone)}`}>{value}</p>
  </div>
);
