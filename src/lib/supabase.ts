import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('placeholder')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export class NothingDeletedError extends Error {
  constructor() {
    super('Nada foi excluído: o registro não existe mais ou você não tem permissão (modo somente leitura?).');
  }
}

/**
 * Exclui pelo id e confere se apagou mesmo. Com as regras de acesso (RLS), o Supabase
 * não devolve erro quando a regra impede a exclusão: só apaga 0 linhas.
 */
export async function deleteById(table: string, id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error) throw new Error(/row-level security/.test(error.message) ? new NothingDeletedError().message : error.message);
  if (!data || data.length === 0) throw new NothingDeletedError();
}

/**
 * Cliente separado e descartável para criar a conta de OUTRA pessoa (convite)
 * sem derrubar a sessão de quem está logado: não guarda nem renova sessão.
 */
export function createDetachedClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'convite-temporario' },
  });
}
