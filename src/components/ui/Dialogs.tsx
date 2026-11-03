import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

// Avisos e confirmações no visual do app (no lugar de alert() e confirm() do navegador).
//   const { confirm, notify } = useDialogs();
//   if (!(await confirm({ message: 'Excluir?', danger: true }))) return;
//   notify('Salvo!', 'success');

type NoticeType = 'success' | 'error' | 'info';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ação destrutiva (botão vermelho) */
  danger?: boolean;
}

interface DialogsValue {
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  notify: (message: string, type?: NoticeType) => void;
}

const DialogsContext = createContext<DialogsValue | null>(null);

interface Notice {
  id: number;
  message: string;
  type: NoticeType;
}

const NOTICE_STYLE: Record<NoticeType, { cls: string; Icon: typeof Info }> = {
  success: { cls: 'bg-emerald-950/95 border-emerald-600 text-emerald-200', Icon: CheckCircle2 },
  error: { cls: 'bg-red-950/95 border-red-600 text-red-200', Icon: AlertCircle },
  info: { cls: 'bg-slate-900/95 border-slate-600 text-slate-200', Icon: Info },
};

export const DialogsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(0);

  const confirm = useCallback(
    (opts: ConfirmOptions | string) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...(typeof opts === 'string' ? { message: opts } : opts), resolve });
      }),
    []
  );

  const dismiss = useCallback((id: number) => setNotices((list) => list.filter((n) => n.id !== id)), []);

  const notify = useCallback(
    (message: string, type: NoticeType = 'info') => {
      const id = ++nextId.current;
      setNotices((list) => [...list.slice(-2), { id, message, type }]);
      setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4500);
    },
    [dismiss]
  );

  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  // Esc cancela (Enter aciona o botão em foco, que começa no "confirmar")
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <DialogsContext.Provider value={{ confirm, notify }}>
      {children}

      {pending && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => answer(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  pending.danger ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                }`}
              >
                {pending.danger ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              </div>
              <div className="space-y-1 min-w-0">
                <h3 id="dialog-title" className="text-base font-bold text-white">
                  {pending.title ?? (pending.danger ? 'Tem certeza?' : 'Confirmar')}
                </h3>
                <p className="text-sm text-slate-300 whitespace-pre-line">{pending.message}</p>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => answer(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition-all"
              >
                {pending.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => answer(true)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  pending.danger ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                }`}
              >
                {pending.confirmLabel ?? (pending.danger ? 'Excluir' : 'Confirmar')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 inset-x-0 z-[110] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
        {notices.map((n) => {
          const { cls, Icon } = NOTICE_STYLE[n.type];
          return (
            <div
              key={n.id}
              role={n.type === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto w-full max-w-md p-3.5 rounded-xl border shadow-2xl flex items-start gap-2.5 text-sm animate-fade-in ${cls}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="flex-1 whitespace-pre-line">{n.message}</span>
              <button type="button" onClick={() => dismiss(n.id)} className="opacity-70 hover:opacity-100" aria-label="Fechar aviso">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </DialogsContext.Provider>
  );
};

export function useDialogs(): DialogsValue {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error('useDialogs precisa estar dentro de <DialogsProvider>.');
  return ctx;
}
