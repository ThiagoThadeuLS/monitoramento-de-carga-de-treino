import React, { useEffect, useState } from 'react';
import { Download, MoreVertical, PlusSquare, Share, Smartphone, CheckCircle2 } from 'lucide-react';
import { canPromptInstall, isIOS, onInstallChange, promptInstall } from '../lib/push';
import { ClubCrest, PLATFORM_NAME } from '../lib/club';

/** Celular pelo navegador: o sistema só funciona como app instalado. */
export const InstallGate: React.FC = () => {
  const [canInstall, setCanInstall] = useState(canPromptInstall());
  const [installed, setInstalled] = useState(false);
  useEffect(() => onInstallChange(() => setCanInstall(canPromptInstall())), []);
  const ios = isIOS();

  const install = async () => {
    if (await promptInstall()) setInstalled(true);
    setCanInstall(canPromptInstall());
  };

  const step = (n: number, children: React.ReactNode) => (
    <li className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-300 text-xs font-bold flex items-center justify-center flex-shrink-0">{n}</span>
      <span className="text-sm text-slate-200 pt-1">{children}</span>
    </li>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
        <div className="text-center space-y-3">
          <ClubCrest club={null} className="w-14 h-14 mx-auto" />
          <h1 className="text-xl font-black text-white">Baixe o app {PLATFORM_NAME}</h1>
          <p className="text-sm text-slate-300">
            No celular, o sistema funciona só pelo aplicativo. Instale uma vez e abra sempre pelo ícone na tela inicial.
          </p>
        </div>

        {installed ? (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-200 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
            <span>App instalado! Feche o navegador e abra o app <strong>Carga</strong> pelo ícone na tela inicial.</span>
          </div>
        ) : ios ? (
          <ol className="space-y-3">
            {step(1, <>No <strong>Safari</strong>, toque em <Share className="inline w-4 h-4 text-sky-300 -mt-0.5" /> <strong>Compartilhar</strong></>)}
            {step(2, <>Escolha <PlusSquare className="inline w-4 h-4 text-sky-300 -mt-0.5" /> <strong>Adicionar à Tela de Início</strong></>)}
            {step(3, <>Abra o app <strong>Carga</strong> pelo ícone novo</>)}
          </ol>
        ) : canInstall ? (
          <button
            type="button"
            onClick={install}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-base"
          >
            <Download className="w-5 h-5" /> Baixar app
          </button>
        ) : (
          <ol className="space-y-3">
            {step(1, <>No <strong>Chrome</strong>, toque em <MoreVertical className="inline w-4 h-4 text-sky-300 -mt-0.5" /> no canto superior direito</>)}
            {step(2, <>Escolha <strong>Instalar app</strong> (ou <strong>Adicionar à tela inicial</strong>)</>)}
            {step(3, <>Abra o app <strong>Carga</strong> pelo ícone novo</>)}
          </ol>
        )}

        <p className="text-xs text-slate-500 text-center flex items-center justify-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5" /> Já instalou? Abra pelo ícone do app, não pelo navegador.
        </p>
        <p className="text-[11px] text-slate-600 text-center">No computador, o sistema abre normalmente pelo navegador.</p>
      </div>
    </div>
  );
};
