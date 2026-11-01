import React, { useState } from 'react';
import { BellRing, Bell, BellOff, Loader2, Share, PlusSquare, LogOut, RefreshCw, Smartphone } from 'lucide-react';
import { PushState, enablePush, getPushState, isIOS } from '../lib/push';

interface NotificationGateProps {
  token: string;
  state: PushState;
  onStateChange: (state: PushState) => void;
  onLogout: () => void;
}

/**
 * Celular: o atleta só usa o app depois de aceitar as notificações.
 * A permissão fica salva no aparelho (sair do app não desativa).
 */
export const NotificationGate: React.FC<NotificationGateProps> = ({ token, state, onStateChange, onLogout }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const activate = async () => {
    setBusy(true);
    setError('');
    try {
      onStateChange(await enablePush(token));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const recheck = async () => {
    setBusy(true);
    try {
      onStateChange(await getPushState());
    } finally {
      setBusy(false);
    }
  };

  const step = (n: number, children: React.ReactNode) => (
    <li className="flex items-start gap-3">
      <span className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-300 text-xs font-bold flex items-center justify-center flex-shrink-0">{n}</span>
      <span className="text-sm text-slate-200 pt-0.5">{children}</span>
    </li>
  );

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center">
            <BellRing className="w-7 h-7 text-sky-300" />
          </div>
          <h2 className="text-xl font-black text-white">Ative as notificações</h2>
          <p className="text-sm text-slate-300">
            Para usar o app, permita os lembretes: avisamos a hora de responder a PSE depois do treino, o bem-estar antes do treino e a
            pesagem.
          </p>
          <p className="text-xs text-slate-500">Você só precisa fazer isso uma vez neste aparelho.</p>
        </div>

        {state === 'off' && (
          <button
            type="button"
            onClick={activate}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bell className="w-5 h-5" />}
            Permitir notificações
          </button>
        )}

        {state === 'needs-install' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-sky-300" /> No iPhone, instale o app primeiro:
            </p>
            <ol className="space-y-2.5">
              {step(1, <>No Safari, toque em <Share className="inline w-4 h-4 text-sky-300 -mt-0.5" /> <strong>Compartilhar</strong></>)}
              {step(2, <>Escolha <PlusSquare className="inline w-4 h-4 text-sky-300 -mt-0.5" /> <strong>Adicionar à Tela de Início</strong></>)}
              {step(3, <>Abra o app pelo <strong>ícone novo</strong> na tela de início e entre de novo</>)}
              {step(4, <>Toque em <strong>Permitir notificações</strong></>)}
            </ol>
          </div>
        )}

        {state === 'denied' && (
          <div className="space-y-3">
            <p className="text-sm text-amber-300 flex items-start gap-2">
              <BellOff className="w-5 h-5 flex-shrink-0" />
              As notificações estão bloqueadas para este app. Libere e toque em "Já liberei".
            </p>
            <ol className="space-y-2.5">
              {isIOS() ? (
                <>
                  {step(1, <>Abra <strong>Ajustes</strong> do iPhone → <strong>Notificações</strong></>)}
                  {step(2, <>Encontre o app <strong>Carga</strong> e ative <strong>Permitir Notificações</strong></>)}
                </>
              ) : (
                <>
                  {step(1, <>Toque no <strong>cadeado</strong> (ou ⋮ → <strong>Informações do site</strong>) ao lado do endereço</>)}
                  {step(2, <>Em <strong>Notificações</strong>, escolha <strong>Permitir</strong></>)}
                </>
              )}
            </ol>
            <button
              type="button"
              onClick={recheck}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Já liberei
            </button>
          </div>
        )}

        {state === 'unsupported' && (
          <p className="text-sm text-amber-300">
            Este navegador não aceita notificações. Abra o link no <strong>{isIOS() ? 'Safari' : 'Google Chrome'}</strong> (não pelo navegador
            do WhatsApp ou Instagram) e entre de novo.
          </p>
        )}

        {error && <p className="text-sm text-red-300 text-center">{error}</p>}

        <button type="button" onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white">
          <LogOut className="w-3.5 h-3.5" /> Sair
        </button>
      </div>
    </div>
  );
};
