import { useCallback, useEffect, useState } from 'react';
import { AthleteCompetitionResult, listAthleteCompetitionResults } from '../../lib/competitions';

/**
 * Competições passadas do atleta + resultado registrado.
 * Recarrega junto com o "Hoje" (refreshKey) ou depois de salvar um resultado (reload).
 */
export function useAthleteCompetitionResults(token: string | null, refreshKey = 0) {
  const [rows, setRows] = useState<AthleteCompetitionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!token) {
      setRows([]);
      setLoading(false);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    listAthleteCompetitionResults(token)
      .then((list) => !cancelled && setRows(list))
      .catch((err: any) => {
        // Banco ainda sem a parte de resultados: a seção simplesmente não aparece.
        if (!cancelled) setError(err?.message ?? 'Não foi possível carregar os resultados.');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey, version]);

  return { rows, loading, error, reload };
}
