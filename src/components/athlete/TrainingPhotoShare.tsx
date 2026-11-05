import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Download, Image as ImageIcon, Loader2, RefreshCw, Share2, X } from 'lucide-react';
import { PLATFORM_NAME } from '../../lib/club';
import { useDialogs } from '../ui/Dialogs';
import type { StoryPerson } from '../../lib/storyCard';
import type { PostLayout, StickerAssets, StickerStyle, TrainingStickerData } from '../../lib/trainingSticker';

type Libs = { sticker: typeof import('../../lib/trainingSticker'); story: typeof import('../../lib/storyCard') };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** A figurinha fica acima da barra de resposta do Instagram (parte de baixo do Story) */
const SAFE_BOTTOM = 0.86;

/**
 * Foto pós-treino com a figurinha do treino por cima (Story 1080 × 1920).
 * 1) convite: tirar foto ou escolher da galeria; 2) ajuste: arrastar a foto e a figurinha,
 * tamanho, cor e mostrar/esconder as notas; 3) compartilhar (Instagram, WhatsApp...) ou salvar.
 */
export const TrainingShareDialog: React.FC<{ info: TrainingStickerData; person: StoryPerson; onClose: () => void }> = ({ info, person, onClose }) => {
  const { notify } = useDialogs();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [libs, setLibs] = useState<Libs | null>(null);
  const [assets, setAssets] = useState<StickerAssets | null>(null);
  const [style, setStyle] = useState<StickerStyle>({ estilo: 'escuro', notas: true });
  const [sticker, setSticker] = useState<{ canvas: HTMLCanvasElement; url: string } | null>(null);
  const [photo, setPhoto] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const [layout, setLayout] = useState<PostLayout>({ fotoX: 50, fotoY: 50, cx: 0.5, cy: 0.7, largura: 0.82 });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{ mode: 'figurinha' | 'foto'; x: number; y: number; start: PostLayout } | null>(null);
  const placed = useRef(false);
  const photoUrl = useRef('');

  // O código do desenho só é baixado aqui
  useEffect(() => {
    let cancelled = false;
    Promise.all([import('../../lib/trainingSticker'), import('../../lib/storyCard')])
      .then(async ([sticker, story]) => {
        const a = await sticker.loadStickerAssets(person.escudo);
        if (cancelled) return;
        setLibs({ sticker, story });
        setAssets(a);
      })
      .catch(() => !cancelled && setError('Não foi possível preparar a figurinha. Tente de novo.'));
    return () => {
      cancelled = true;
    };
  }, [person.escudo]);

  // Figurinha (refaz ao trocar a cor ou mostrar/esconder as notas)
  useEffect(() => {
    if (!libs || !assets) return;
    let cancelled = false;
    let url = '';
    (async () => {
      let canvas = libs.sticker.renderSticker(info, style, assets, PLATFORM_NAME);
      let blob: Blob;
      try {
        blob = await libs.story.canvasToBlob(canvas);
      } catch {
        // Escudo sem permissão "suja" o desenho: refaz sem ele
        canvas = libs.sticker.renderSticker(info, style, { logo: assets.logo }, PLATFORM_NAME);
        blob = await libs.story.canvasToBlob(canvas);
      }
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setSticker({ canvas, url });
      const aspect = canvas.height / canvas.width;
      setLayout((l) => {
        // Primeira vez: embaixo, acima da área que o Instagram cobre; depois só mantém dentro do Story
        const halfH = (l.largura * aspect * 1080) / 1920 / 2;
        const cy = placed.current ? l.cy : SAFE_BOTTOM - halfH;
        placed.current = true;
        return { ...l, ...libs.sticker.clampSticker(l.cx, cy, l.largura, aspect) };
      });
    })().catch(() => !cancelled && setError('Não foi possível montar a figurinha.'));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [libs, assets, info, style]);

  // Imagem final pronta antes do toque em "Compartilhar" (o celular exige abrir direto no toque)
  useEffect(() => {
    setFile(null);
    if (!libs || !photo || !sticker) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      libs.sticker
        .renderTrainingPost(photo.img, sticker.canvas, layout)
        .then((blob) => !cancelled && setFile(new File([blob], 'meu-treino.jpg', { type: 'image/jpeg' })))
        .catch(() => !cancelled && setError('Não foi possível montar a imagem.'));
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [libs, photo, sticker, layout]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(
    () => () => {
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    },
    []
  );

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.type && !f.type.startsWith('image/')) {
      setError('Escolha uma foto.');
      return;
    }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
      photoUrl.current = url;
      setPhoto({ url, img });
      setLayout((l) => ({ ...l, fotoX: 50, fotoY: 50 }));
      setError('');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError('Não foi possível abrir esta foto. Tente outra (JPG ou PNG).');
    };
    img.src = url;
  };

  const aspect = sticker ? sticker.canvas.height / sticker.canvas.width : 0.7;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!photo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const mode = (e.target as HTMLElement).dataset.figurinha ? 'figurinha' : 'foto';
    drag.current = { mode, x: e.clientX, y: e.clientY, start: layout };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const frame = frameRef.current;
    if (!d || !frame || !photo || !libs) return;
    const rect = frame.getBoundingClientRect();
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.mode === 'figurinha') {
      const next = libs.sticker.clampSticker(d.start.cx + dx / rect.width, d.start.cy + dy / rect.height, d.start.largura, aspect);
      setLayout({ ...d.start, ...next });
    } else {
      // Enquadramento da foto: arrastar mostra a parte que ficou de fora
      const r = libs.sticker.coverRect(photo.img.naturalWidth, photo.img.naturalHeight, rect.width, rect.height, 50, 50);
      const overX = r.w - rect.width;
      const overY = r.h - rect.height;
      setLayout({
        ...d.start,
        fotoX: overX > 1 ? clamp(d.start.fotoX - (dx / overX) * 100, 0, 100) : 50,
        fotoY: overY > 1 ? clamp(d.start.fotoY - (dy / overY) * 100, 0, 100) : 50,
      });
    }
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const changeSize = (largura: number) =>
    setLayout((l) => (libs ? { ...l, largura, ...libs.sticker.clampSticker(l.cx, l.cy, largura, aspect) } : l));

  const canShare = !!(file && libs?.story.canShareFile(file));
  const save = () => {
    if (!file || !libs) return;
    libs.story.downloadFile(file);
    notify('Imagem salva. Agora é só postar no Instagram ou mandar no WhatsApp.', 'success');
  };
  const share = async () => {
    if (!file || !libs || busy) return;
    setBusy(true);
    const result = await libs.story.shareFile(file);
    setBusy(false);
    if (result === 'compartilhado') onClose();
    else if (result === 'indisponivel') save();
  };

  const inputs = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={pick} />
    </>
  );

  const toggle = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-bold border ${active ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-900 text-slate-300 border-slate-700'}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Compartilhar o treino"
    >
      {inputs}
      {!photo ? (
        // 1) Convite: foto do treino com a figurinha
        <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-5 space-y-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-white">Treino registrado! 💪</h2>
              <p className="text-xs text-slate-400 mt-0.5">Tire uma foto e poste com a figurinha do treino.</p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="rounded-2xl bg-gradient-to-b from-slate-700 to-slate-800 p-3 flex justify-center">
            {sticker ? (
              <img src={sticker.url} alt="Figurinha do treino" className="w-full max-w-[300px]" />
            ) : (
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 my-10" />
            )}
          </div>
          {error && <p className="text-xs text-red-300">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> Tirar foto
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold flex items-center justify-center gap-2"
            >
              <ImageIcon className="w-4 h-4" /> Galeria
            </button>
          </div>
          <button type="button" onClick={onClose} className="w-full text-xs font-bold text-slate-400 hover:text-white py-1">
            Agora não
          </button>
        </div>
      ) : (
        // 2) Ajuste e 3) compartilhar
        <div className="w-full max-w-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-black text-white">Postar o treino</h2>
            <div className="flex gap-2">
              {/* Sem "capture": o celular oferece câmera ou galeria */}
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Outra foto
              </button>
              <button type="button" onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            ref={frameRef}
            className="relative mx-auto max-w-full overflow-hidden rounded-2xl bg-black touch-none select-none cursor-move"
            style={{ height: 'min(60vh, 600px)', aspectRatio: '9 / 16' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              src={photo.url}
              alt="Sua foto"
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ objectPosition: `${layout.fotoX}% ${layout.fotoY}%` }}
            />
            {sticker && (
              <img
                src={sticker.url}
                alt="Figurinha do treino"
                data-figurinha="1"
                draggable={false}
                className="absolute"
                style={{
                  left: `${layout.cx * 100}%`,
                  top: `${layout.cy * 100}%`,
                  width: `${layout.largura * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.35))',
                }}
              />
            )}
          </div>
          <p className="text-[11px] text-slate-400 text-center">Arraste a figurinha e a foto para ajustar.</p>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-3">
            <label className="flex items-center gap-3 text-xs text-slate-300">
              <span className="w-16 flex-shrink-0 font-bold">Tamanho</span>
              <input
                type="range"
                min={0.5}
                max={0.95}
                step={0.01}
                value={layout.largura}
                onChange={(e) => changeSize(Number(e.target.value))}
                className="w-full accent-sky-500"
                aria-label="Tamanho da figurinha"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setStyle((s) => ({ ...s, estilo: 'escuro' }))} className={toggle(style.estilo === 'escuro')}>
                Escura
              </button>
              <button type="button" onClick={() => setStyle((s) => ({ ...s, estilo: 'claro' }))} className={toggle(style.estilo === 'claro')}>
                Clara
              </button>
              <button type="button" onClick={() => setStyle((s) => ({ ...s, notas: !s.notas }))} className={`ml-auto ${toggle(style.notas)}`}>
                {style.notas ? 'Notas: mostrando' : 'Notas: escondidas'}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-300 text-center">{error}</p>}

          <div className="flex gap-2">
            {canShare && (
              <button
                type="button"
                onClick={share}
                disabled={busy}
                className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Compartilhar
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!file}
              className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 ${
                canShare ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-sky-500 hover:bg-sky-400 text-slate-950 font-black'
              }`}
            >
              {file ? <Download className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />} Salvar imagem
            </button>
          </div>
          <p className="text-[11px] text-slate-500 text-center">A imagem é feita no seu celular e só sai dele se você escolher onde postar.</p>
        </div>
      )}
    </div>,
    document.body
  );
};
