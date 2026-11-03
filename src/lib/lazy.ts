import { ComponentType, lazy } from 'react';

/**
 * Carrega uma tela só quando ela aparece (o app inicial fica menor).
 * Funciona com exportação nomeada: lazyNamed(() => import('./X'), (m) => m.X).
 */
export function lazyNamed<M, P = any>(load: () => Promise<M>, pick: (m: M) => ComponentType<P>) {
  return lazy(() => load().then((m) => ({ default: pick(m) })));
}
