import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Estado de navegação (aba, tela aberta) guardado no histórico do navegador:
 * o botão "voltar" do celular volta para a tela anterior em vez de sair do app.
 * O endereço da página não muda. Cada `key` é independente (ex.: 'aba' e 'tela').
 */
export function useHistoryState<T>(key: string, initial: T): [T, (value: T) => void] {
  const read = (): T => {
    const st = window.history.state as Record<string, unknown> | null;
    return st && key in st ? (st[key] as T) : initial;
  };
  const [value, setValue] = useState<T>(read);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    // Primeira entrada: grava o valor inicial sem criar um passo novo no histórico
    const st = (window.history.state as Record<string, unknown> | null) ?? {};
    if (!(key in st)) window.history.replaceState({ ...st, [key]: valueRef.current }, '');
    const onPop = (e: PopStateEvent) => {
      const s = e.state as Record<string, unknown> | null;
      setValue(s && key in s ? (s[key] as T) : initial);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // `initial` só vale na primeira vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T) => {
      if (JSON.stringify(next) === JSON.stringify(valueRef.current)) return;
      const st = (window.history.state as Record<string, unknown> | null) ?? {};
      window.history.pushState({ ...st, [key]: next }, '');
      valueRef.current = next;
      setValue(next);
    },
    [key]
  );

  return [value, set];
}
