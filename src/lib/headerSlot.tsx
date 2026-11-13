import React, { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Espaço no cabeçalho do topo para a tela aberta pôr os próprios botões
// (o painel da comissão põe a busca de atleta e o menu do treinador).
interface HeaderSlotValue {
  el: HTMLElement | null;
  setEl: (el: HTMLElement | null) => void;
  used: boolean;
  setUsed: (used: boolean) => void;
}

const HeaderSlotContext = createContext<HeaderSlotValue>({ el: null, setEl: () => undefined, used: false, setUsed: () => undefined });

export const HeaderSlotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [used, setUsed] = useState(false);
  return <HeaderSlotContext.Provider value={{ el, setEl, used, setUsed }}>{children}</HeaderSlotContext.Provider>;
};

/** O lugar no cabeçalho (vazio quando ninguém usa). */
export const HeaderSlot: React.FC = () => {
  const { setEl } = useContext(HeaderSlotContext);
  return <div ref={setEl} className="flex items-center gap-1.5 empty:hidden" />;
};

/** O cabeçalho tem botões de alguma tela agora? (para encolher o resto no celular) */
export const useHeaderSlotUsed = () => useContext(HeaderSlotContext).used;

/** Mostra `children` no cabeçalho do topo enquanto a tela estiver aberta. */
export const InHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { el, setUsed } = useContext(HeaderSlotContext);
  useEffect(() => {
    setUsed(true);
    return () => setUsed(false);
  }, [setUsed]);
  return el ? createPortal(children, el) : null;
};
