import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, Share2, X } from 'lucide-react';
import { PLATFORM_NAME } from '../../lib/club';
import { useDialogs } from '../ui/Dialogs';
import { TrainingShareDialog } from './TrainingPhotoShare';
import type { StoryCard, StoryPerson } from '../../lib/storyCard';
import type { TrainingStickerData } from '../../lib/trainingSticker';

interface ShareStoryValue {
  /** Abre a prévia do cartão (Stories) com o botão de compartilhar */
  openStory: (card: StoryCard) => void;
  /** Abre a foto pós-treino com a figurinha do treino */
  openTrainingShare: (info: TrainingStickerData) => void;
}

type Opened = { kind: 'cartao'; card: StoryCard } | { kind: 'treino'; info: TrainingStickerData };

const ShareStoryContext = createContext<ShareStoryValue | null>(null);

/** Compartilhar cartões: só existe na área do atleta (fora dela, null e os botões somem). */
export const useShareStory = () => useContext(ShareStoryContext);

/** Marca no histórico do navegador enquanto a prévia está aberta ("voltar" fecha) */
const HISTORY_MARK = 'compartilhar';

const FILE_NAME: Record<StoryCard['kind'], string> = {
  pr: 'meu-recorde',
  sequencia: 'minha-sequencia',
  resumo: 'meu-resumo',
  competicao: 'contagem-competicao',
  selo: 'minha-conquista',
};

export const ShareStoryProvider: React.FC<{
  person: StoryPerson;
  /** Pedido de fora (ex.: PSE recém-enviada): abre a foto pós-treino assim que chega */
  trainingRequest?: TrainingStickerData | null;
  onTrainingRequestHandled?: () => void;
  children: React.ReactNode;
}> = ({ person, trainingRequest, onTrainingRequestHandled, children }) => {
  const [opened, setOpened] = useState<Opened | null>(null);

  const open = useCallback((next: Opened) => {
    const st = (window.history.state as Record<string, unknown> | null) ?? {};
    if (!st[HISTORY_MARK]) window.history.pushState({ ...st, [HISTORY_MARK]: true }, '');
    setOpened(next);
  }, []);
  const openStory = useCallback((card: StoryCard) => open({ kind: 'cartao', card }), [open]);
  const openTrainingShare = useCallback((info: TrainingStickerData) => open({ kind: 'treino', info }), [open]);

  useEffect(() => {
    if (!trainingRequest) return;
    openTrainingShare(trainingRequest);
    onTrainingRequestHandled?.();
  }, [trainingRequest, openTrainingShare, onTrainingRequestHandled]);

  useEffect(() => {
    if (!opened) return;
    const onPop = () => setOpened(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [opened]);

  /** Fechou pelo botão: tira o passo que a tela criou no histórico */
  const close = useCallback(() => {
    if ((window.history.state as Record<string, unknown> | null)?.[HISTORY_MARK]) window.history.back();
    setOpened(null);
  }, []);

  const value = useMemo(() => ({ openStory, openTrainingShare }), [openStory, openTrainingShare]);
  return (
    <ShareStoryContext.Provider value={value}>
      {children}
      {opened?.kind === 'cartao' && <ShareStoryDialog card={opened.card} person={person} onClose={close} />}
      {opened?.kind === 'treino' && <TrainingShareDialog info={opened.info} person={person} onClose={close} />}
    </ShareStoryContext.Provider>
  );
};

type StoryLib = typeof import('../../lib/storyCard');

const ShareStoryDialog: React.FC<{ card: StoryCard; person: StoryPerson; onClose: () => void }> = ({ card, person, onClose }) => {
  const { notify } = useDialogs();
  const [lib, setLib] = useState<StoryLib | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);

  // Monta a imagem no próprio celular (o código do desenho só é baixado aqui)
  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setFile(null);
    setUrl('');
    setError('');
    import('../../lib/storyCard')
      .then(async (m) => {
        const blob = await m.renderStory(card, person, PLATFORM_NAME);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLib(m);
        setFile(new File([blob], `${FILE_NAME[card.kind]}.png`, { type: 'image/png' }));
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setError('Não foi possível montar a imagem. Tente de novo.'));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [card, person]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canShare = !!(file && lib?.canShareFile(file));

  const save = () => {
    if (!file || !lib) return;
    lib.downloadFile(file);
    notify('Imagem salva. Agora é só postar no Instagram ou mandar no WhatsApp.', 'success');
  };

  // A janela de compartilhar abre direto no toque (a imagem já está pronta)
  const share = async () => {
    if (!file || !lib || sharing) return;
    setSharing(true);
    const result = await lib.shareFile(file);
    setSharing(false);
    if (result === 'compartilhado') onClose();
    else if (result === 'indisponivel') save();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Compartilhar"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-white">Compartilhar</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="mx-auto max-w-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 flex items-center justify-center"
          style={{ height: 'min(62vh, 620px)', aspectRatio: '9 / 16' }}
        >
          {url ? (
            <img src={url} alt="Prévia da imagem para compartilhar" className="w-full h-full object-contain" />
          ) : error ? (
            <p className="text-xs text-red-300 p-4 text-center">{error}</p>
          ) : (
            <Loader2 className="w-7 h-7 animate-spin text-slate-500" />
          )}
        </div>

        <p className="text-[11px] text-slate-400 text-center">A imagem é feita no seu celular e só sai dele se você escolher onde postar.</p>

        <div className="flex gap-2">
          {canShare && (
            <button
              type="button"
              onClick={share}
              disabled={sharing}
              className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Compartilhar
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
            <Download className="w-4 h-4" /> Salvar imagem
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
