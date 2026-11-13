import React, { useEffect, useRef, useState } from 'react';
import { LogOut, Search, Settings2, X } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { PhotoPicker } from '../ui/PhotoPicker';
import { ClubAthlete, fetchClubAthletes } from '../../lib/athletes';
import { WhoopTag, useWhoopConnected } from './WhoopTag';

/** Fecha o painel ao clicar fora ou apertar Esc. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

const panel = 'absolute right-0 top-full mt-2 z-50 w-[min(20rem,calc(100vw-2rem))] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl';

/** Busca de atleta no cabeçalho: digita o nome e abre a ficha. */
export const AthleteSearch: React.FC<{ clubId: string; onOpen: (athleteId: string) => void }> = ({ clubId, onOpen }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [list, setList] = useState<ClubAthlete[]>([]);
  const whoopIds = useWhoopConnected();
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchClubAthletes(clubId)
      .then((rows) => !cancelled && setList(rows))
      .catch(() => !cancelled && setList([]));
    return () => {
      cancelled = true;
    };
  }, [open, clubId]);

  const q = query.trim().toLowerCase();
  const found = list.filter((a) => !q || a.nome.toLowerCase().includes(q)).slice(0, 8);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="Buscar atleta"
        aria-label="Buscar atleta"
        className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center"
      >
        <Search className="w-4 h-4" />
      </button>
      {open && (
        <div className={`${panel} p-3 space-y-2`}>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && found[0]) {
                  onOpen(found[0].id);
                  setOpen(false);
                }
              }}
              placeholder="Nome do atleta..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {found.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    onOpen(a.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-800 text-left"
                >
                  <Avatar name={a.nome} src={a.photo_url} className="w-8 h-8" textClassName="text-[10px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white truncate">
                      {a.nome} {whoopIds.has(a.id) && <WhoopTag />}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {[a.classe, a.categoria].filter(Boolean).join(' • ')}
                      {a.active === false && ' • inativo'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {found.length === 0 && <li className="px-2 py-3 text-xs text-slate-500">Nenhum atleta encontrado.</li>}
          </ul>
          <p className="text-[10px] text-slate-500 px-1">Abre a ficha com carga, ACWR, PSE, PSR e peso.</p>
        </div>
      )}
    </div>
  );
};

interface CoachMenuProps {
  nome: string;
  photoUrl?: string | null;
  isAdmin: boolean;
  clubName: string;
  onPickPhoto: (file: File) => Promise<void>;
  onPhotoError: (message: string) => void;
  onSettings: () => void;
  onLogout: () => void;
}

/** Foto do treinador no cabeçalho: abre o menu com papel, configurações e sair. */
export const CoachMenu: React.FC<CoachMenuProps> = ({ nome, photoUrl, isAdmin, clubName, onPickPhoto, onPhotoError, onSettings, onLogout }) => {
  const [open, setOpen] = useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const item = 'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-left';

  return (
    <div ref={ref} className="relative" data-tour="coach-menu">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Menu do treinador"
        title={nome}
        className={`rounded-full ring-2 transition-colors ${open ? 'ring-sky-400' : 'ring-slate-800 hover:ring-slate-600'}`}
      >
        <Avatar name={nome} src={photoUrl} className="w-9 h-9" textClassName="text-[11px]" />
      </button>
      {open && (
        <div className={`${panel} p-2`}>
          <div className="flex items-center gap-3 p-2 pb-3 border-b border-slate-800 mb-1">
            <PhotoPicker
              name={nome}
              src={photoUrl}
              onPick={onPickPhoto}
              onError={onPhotoError}
              className="w-12 h-12"
              textClassName="text-sm"
              title="Trocar minha foto"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{nome}</p>
              <p className="text-xs text-slate-400 truncate">
                {isAdmin ? 'Admin do clube' : 'Treinador'} • {clubName}
              </p>
            </div>
            <button type="button" onClick={close} className="ml-auto p-1 text-slate-500 hover:text-white" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
            className={`${item} text-slate-200 hover:bg-slate-800`}
          >
            <Settings2 className="w-4 h-4 text-slate-400" /> Configurações do clube
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className={`${item} text-slate-300 hover:bg-red-500/15 hover:text-red-300`}
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      )}
    </div>
  );
};
