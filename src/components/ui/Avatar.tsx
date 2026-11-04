import React, { useEffect, useState } from 'react';
import { photoInitials } from '../../lib/photos';

interface AvatarProps {
  name: string;
  src?: string | null;
  /** Tamanho e espaçamento (ex.: "w-10 h-10") */
  className?: string;
  /** Tamanho das iniciais quando não há foto */
  textClassName?: string;
  /** Arredondamento (padrão: círculo) */
  roundedClassName?: string;
}

/** Foto do atleta/treinador ou, sem foto, as iniciais do nome. */
export const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  className = 'w-10 h-10',
  textClassName = 'text-xs',
  roundedClassName = 'rounded-full',
}) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  return (
    <div
      className={`${className} ${roundedClassName} bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={`Foto de ${name}`}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={`${textClassName} font-black text-slate-300 leading-none select-none`} aria-hidden="true">
          {photoInitials(name)}
        </span>
      )}
    </div>
  );
};
