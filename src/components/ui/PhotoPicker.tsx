import React, { useEffect, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Avatar } from './Avatar';
import { PHOTO_ACCEPT, checkPhotoFile } from '../../lib/photos';
import { PhotoCropDialog } from './PhotoCropDialog';

/** Marca no histórico do navegador enquanto o ajuste da foto está aberto */
const HISTORY_MARK = 'ajusteFoto';

interface PhotoPickerProps {
  name: string;
  src?: string | null;
  onPick: (file: File) => Promise<void>;
  onError?: (message: string) => void;
  className?: string;
  textClassName?: string;
  roundedClassName?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * Avatar clicável (círculo): abre o seletor de imagem, deixa o atleta/treinador
 * ajustar o enquadramento (arrastar + zoom) e só então envia a foto.
 */
export const PhotoPicker: React.FC<PhotoPickerProps> = ({
  name,
  src,
  onPick,
  onError,
  className = 'w-11 h-11',
  textClassName = 'text-sm',
  roundedClassName = 'rounded-full',
  disabled = false,
  title,
}) => {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<File | null>(null);

  // "Voltar" do celular fecha o ajuste da foto (em vez de sair da tela de trás)
  useEffect(() => {
    if (!pending) return;
    const onPop = () => setPending(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [pending]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = checkPhotoFile(file);
    if (problem) {
      onError?.(problem);
      return;
    }
    window.history.pushState({ ...((window.history.state as Record<string, unknown> | null) ?? {}), [HISTORY_MARK]: true }, '');
    setPending(file);
  };

  /** Fechou pelo botão: tira o passo que o ajuste criou no histórico (o "voltar" fecha sozinho). */
  const closeDialog = () => {
    const st = window.history.state as Record<string, unknown> | null;
    if (st?.[HISTORY_MARK]) window.history.back();
    setPending(null);
  };

  const save = async (file: File) => {
    closeDialog();
    setBusy(true);
    try {
      await onPick(file);
    } catch (err: any) {
      onError?.(err?.message || 'Não foi possível salvar a foto.');
    } finally {
      setBusy(false);
    }
  };

  const label = title ?? `Trocar foto de ${name}`;

  return (
    <>
      <label
        className={`relative group flex-shrink-0 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        title={label}
        aria-label={label}
      >
        <Avatar name={name} src={src} className={className} textClassName={textClassName} roundedClassName={roundedClassName} />
        <span
          className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full border flex items-center justify-center ${
            busy ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-slate-800 border-slate-600 text-slate-200 group-hover:bg-sky-500 group-hover:text-slate-950'
          }`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        </span>
        <input
          type="file"
          accept={PHOTO_ACCEPT}
          className="sr-only"
          disabled={disabled || busy}
          onChange={handleFile}
        />
      </label>

      {pending && (
        <PhotoCropDialog file={pending} name={name} onCancel={closeDialog} onConfirm={save} />
      )}
    </>
  );
};
