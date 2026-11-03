import { useEffect, useState } from 'react';
import { todayISO } from './date';

/**
 * "Hoje" (horário de Brasília) que se atualiza sozinho: o app instalado pode ficar aberto
 * de um dia para o outro. Confere a cada minuto e quando o app volta para a tela.
 */
export function useTodayISO(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const check = () => setToday((cur) => {
      const now = todayISO();
      return now === cur ? cur : now;
    });
    const id = setInterval(check, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);
  return today;
}
