import React, { useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Avatar } from './Avatar';
import { PHOTO_ACCEPT } from '../../lib/photos';

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

/** Avatar clicável: abre o seletor de imagem e envia a foto escolhida. */
export const PhotoPicker: React.FC<PhotoPickerProps> = ({
  name,
  src,
  onPick,
  onError,
  className = 'w-11 h-11',
  textClassName = 'text-sm',
  roundedClassName = 'rounded-xl',
  disabled = false,
  title,
}) => {
  const [busy, setBusy] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
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
    <label
      className={`relative group flex-shrink-0 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      title={label}
      aria-label={label}
    >
      <Avatar name={name} src={src} className={className} textClassName={textClassName} roundedClassName={roundedClassName} />
      <span
        className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border flex items-center justify-center ${
          busy ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-slate-800 border-slate-600 text-slate-200 group-hover:bg-sky-500 group-hover:text-slate-950'
        }`}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
      </span>
      <input
        type="file"
        accept={PHOTO_ACCEPT}
        className="sr-only"
        disabled={disabled || busy}
        onChange={handleFile}
      />
    </label>
  );
};
