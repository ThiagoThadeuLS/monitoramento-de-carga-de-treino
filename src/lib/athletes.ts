import { supabase } from './supabase';

/** Atleta como as telas de análise precisam (sem CPF nem celular: dado pessoal só no cadastro). */
export interface ClubAthlete {
  id: string;
  nome: string;
  classe?: string | null;
  categoria?: string | null;
  sexo?: string | null;
  photo_url?: string | null;
  active: boolean;
}

const TTL_MS = 2 * 60 * 1000;
let cache: { club: string; at: number; promise: Promise<ClubAthlete[]> } | null = null;

/**
 * Lista de atletas do clube em uso (ativos e inativos), guardada por 2 minutos:
 * trocar de aba não busca de novo. `club` é o id do clube na tela (troca de clube = nova busca).
 */
export function fetchClubAthletes(club: string | null | undefined, force = false): Promise<ClubAthlete[]> {
  if (!supabase) return Promise.resolve([]);
  const key = club ?? '';
  if (!force && cache && cache.club === key && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = (async () => {
    const { data, error } = await supabase!
      .from('athletes')
      .select('id, nome, classe, categoria, sexo, photo_url, active')
      .order('nome');
    if (error) throw error;
    return ((data ?? []) as ClubAthlete[]).map((a) => ({ ...a, active: a.active !== false }));
  })();
  cache = { club: key, at: Date.now(), promise };
  // Erro não fica guardado: a próxima tela tenta de novo
  promise.catch(() => {
    if (cache?.promise === promise) cache = null;
  });
  return promise;
}

export interface AthleteBirthday {
  id: string;
  nome: string;
  /** AAAA-MM-DD */
  birth_date: string;
}

let birthdayCache: { club: string; at: number; promise: Promise<AthleteBirthday[]> } | null = null;

/**
 * Datas de nascimento dos atletas do clube (só quem já preencheu). Consulta separada
 * e tolerante: se o banco ainda não tem a coluna, devolve lista vazia em vez de
 * derrubar as telas que só precisam da lista de atletas.
 */
export function fetchAthleteBirthdays(club: string | null | undefined, force = false): Promise<AthleteBirthday[]> {
  if (!supabase) return Promise.resolve([]);
  const key = club ?? '';
  if (!force && birthdayCache && birthdayCache.club === key && Date.now() - birthdayCache.at < TTL_MS) {
    return birthdayCache.promise;
  }
  const promise = (async () => {
    const { data, error } = await supabase!
      .from('athletes')
      .select('id, nome, birth_date')
      .not('birth_date', 'is', null)
      .order('nome');
    if (error) return [];
    return ((data ?? []) as AthleteBirthday[]).filter((a) => !!a.birth_date);
  })();
  birthdayCache = { club: key, at: Date.now(), promise };
  promise.catch(() => {
    if (birthdayCache?.promise === promise) birthdayCache = null;
  });
  return promise;
}

/** Depois de cadastrar, editar, inativar ou excluir atleta. */
export function invalidateClubAthletes() {
  cache = null;
  birthdayCache = null;
}
