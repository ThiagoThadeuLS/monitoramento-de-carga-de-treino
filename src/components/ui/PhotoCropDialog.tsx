import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ZoomIn } from 'lucide-react';
import { PHOTO_SIZE, encodePhoto } from '../../lib/photos';

/**
 * Ajuste da foto antes de enviar: o atleta/treinador arrasta a imagem e usa o zoom
 * até o rosto ficar no círculo. O recorte é feito no navegador e a foto sai já
 * reduzida (512 px, WEBP/JPEG) — é isso que mantém o bucket leve.
 */
interface PhotoCropDialogProps {
  file: File;
  /** Nome de quem está trocando a foto (texto de acessibilidade) */
  name?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

/** Lado da área de recorte na tela (o arquivo final sai com PHOTO_SIZE px). */
const BOX = 288;
const MAX_ZOOM = 3;

export const PhotoCropDialog: React.FC<PhotoCropDialogProps> = ({ file, name, onCancel, onConfirm }) => {
  const [src, setSrc] = useState('');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Esc fecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Escala mínima que preenche o círculo (a imagem nunca deixa borda vazia)
  const base = image ? Math.max(BOX / image.naturalWidth, BOX / image.naturalHeight) : 1;
  const scale = base * zoom;

  /** Impede arrastar a imagem para fora do círculo. */
  const clamp = (next: { x: number; y: number }, z = zoom) => {
    if (!image) return next;
    const s = base * z;
    const maxX = Math.max(0, (image.naturalWidth * s - BOX) / 2);
    const maxY = Math.max(0, (image.naturalHeight * s - BOX) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const changeZoom = (z: number) => {
    setZoom(z);
    setOffset((cur) => clamp(cur, z));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!image) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const save = async () => {
    if (!image || saving) return;
    setSaving(true);
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = PHOTO_SIZE;
      canvas.height = PHOTO_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Não foi possível preparar a imagem.');

      // Fundo claro: áreas transparentes não viram preto se o navegador cair para JPEG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Aplica o mesmo enquadramento que está na tela, já no tamanho final
      const k = PHOTO_SIZE / BOX;
      const s = scale * k;
      ctx.setTransform(s, 0, 0, s, (BOX / 2 + offset.x) * k, (BOX / 2 + offset.y) * k);
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // WEBP ou, no Safari (não gera WEBP), JPEG: a foto já sai pronta para subir
      const blob = await encodePhoto(canvas);
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      onConfirm(new File([blob], `perfil.${ext}`, { type: blob.type }));
    } catch (err: any) {
      setError(err?.message || 'Não foi possível preparar a imagem.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Ajustar foto">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-5 shadow-2xl space-y-4">
        <div>
          <h2 className="text-base font-black text-white">Ajustar foto{name ? ` de ${name.split(' ')[0]}` : ''}</h2>
          <p className="text-xs text-slate-400 mt-0.5">Arraste para enquadrar e use o zoom. A foto aparece no círculo.</p>
        </div>

        <div
          className="relative mx-auto rounded-full overflow-hidden bg-slate-950 ring-2 ring-slate-700 touch-none select-none cursor-move"
          style={{ width: BOX, height: BOX }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {src && (
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => {
                setImage(e.currentTarget);
                setZoom(1);
                setOffset({ x: 0, y: 0 });
              }}
              // Formato que este navegador não abre (ex.: HEIC no Android) ou arquivo com defeito
              onError={() => setError('Não foi possível abrir esta imagem. Tente outra foto (JPG ou PNG).')}
              className="absolute left-1/2 top-1/2 max-w-none select-none pointer-events-none"
              style={{
                width: image ? image.naturalWidth * scale : BOX,
                height: image ? image.naturalHeight * scale : BOX,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
          {!image && !error && <Loader2 className="w-7 h-7 animate-spin text-slate-500 absolute inset-0 m-auto" />}
        </div>

        <label className="flex items-center gap-3 text-slate-400">
          <ZoomIn className="w-4 h-4 flex-shrink-0" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            aria-label="Zoom da foto"
            className="w-full h-2 accent-sky-500"
          />
        </label>

        {error && (
          <p className="text-xs text-red-300 bg-red-950/50 border border-red-800 rounded-xl px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!image || saving}
            className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Salvar foto
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
