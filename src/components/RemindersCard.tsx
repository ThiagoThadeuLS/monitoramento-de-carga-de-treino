import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2, Share, PlusSquare, X } from 'lucide-react';
import { PushState, enablePush, getPushState } from '../lib/push';

interface RemindersCardProps {
  token: string;
}

const DISMISS_KEY = 'lembretes_card_fechado';

/** Card na área do atleta para ativar os lembretes de PSE, bem-estar e peso. */
export const RemindersCard: React.FC<RemindersCardProps> = ({ token }) => {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  const activate = async () => {
    setBusy(true);
    setError('');
    try {
      setState(await enablePush(token));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* sem armazenamento: fecha só nesta visita */
    }
  };

  if (!state || state === 'unsupported') return null;

  // Ativo: fica permanente neste aparelho
  if (state === 'on') {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 font-semibold">
        <BellRing className="w-4 h-4" /> Lembretes ativados neste aparelho
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div className="relative p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 space-y-3">
      <button type="button" onClick={dismiss} className="absolute top-3 right-3 p-1 text-slate-500 hover:text-white" title="Agora não">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="w-9 h-9 rounded-xl bg-sky-500/20 flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-sky-300" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Receba lembretes no celular</p>
          <p className="text-xs text-slate-300">
            Avisamos quando for hora de responder a PSE depois do treino, o bem-estar antes do treino e a pesagem.
          </p>
        </div>
      </div>

      {state === 'needs-install' && (
        <div className="text-xs text-slate-200 bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-1.5">
          <p className="font-semibold text-white">No iPhone, adicione o app à tela de início primeiro:</p>
          <p className="flex items-center gap-1.5">1. Toque em <Share className="w-3.5 h-3.5 text-sky-300" /> <strong>Compartilhar</strong> no Safari</p>
          <p className="flex items-center gap-1.5">2. Escolha <PlusSquare className="w-3.5 h-3.5 text-sky-300" /> <strong>Adicionar à Tela de Início</strong></p>
          <p>3. Abra o app pelo ícone novo e ative os lembretes aqui.</p>
        </div>
      )}

      {state === 'denied' && (
        <p className="text-xs text-amber-300 flex items-start gap-2">
          <BellOff className="w-4 h-4 flex-shrink-0" />
          As notificações estão bloqueadas para este app. Libere nas configurações do navegador/celular e volte aqui.
        </p>
      )}

      {state === 'off' && (
        <button
          type="button"
          onClick={activate}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />} Ativar lembretes
        </button>
      )}

      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
};
