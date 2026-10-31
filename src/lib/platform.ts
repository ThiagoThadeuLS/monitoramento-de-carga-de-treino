import { supabase } from './supabase';

export interface ClubInvite {
  id: string;
  email: string;
  token: string | null; // só vem enquanto o convite está pendente
  status: 'pendente' | 'usado' | 'expirado' | 'cancelado';
  created_at: string;
  expires_at: string;
  used_at: string | null;
  club_nome: string | null;
}

export interface PlatformClub {
  id: string;
  nome: string;
  escudo_url: string | null;
  status: 'ativo' | 'suspenso';
  created_at: string;
  treinadores: number;
  atletas: number;
  admins: string | null;
}

export interface AccessLogEntry {
  at: string;
  owner_email: string | null;
  club_nome: string | null;
  action: 'convidou' | 'suspendeu' | 'reativou' | 'entrou_suporte' | 'saiu_suporte';
  detail: string | null;
}

const MESSAGES: Record<string, string> = {
  nao_autorizado: 'Você não tem permissão para isso.',
  email_invalido: 'Informe um e-mail válido.',
  email_ja_cadastrado: 'Este e-mail já tem uma conta na plataforma.',
  clube_nao_encontrado: 'Clube não encontrado.',
  escudo_invalido: 'Não foi possível salvar o escudo.',
  cadastro_sem_convite: 'Este convite expirou, já foi usado ou não é para este e-mail.',
};

export function platformError(err: any): string {
  const msg = String(err?.message ?? err ?? '');
  const code = Object.keys(MESSAGES).find((k) => msg.includes(k));
  if (code) return MESSAGES[code];
  if (msg.includes('Could not find the function')) return 'O painel da plataforma ainda não foi ativado no banco. Rode o arquivo supabase_plataforma.sql no Supabase.';
  if (/rate limit/i.test(msg)) return 'O Supabase bloqueou o envio de e-mails por excesso de tentativas. Desligue "Confirm email" em Authentication → Sign In / Providers → Email e tente de novo.';
  if (/Database error saving new user/i.test(msg)) return MESSAGES.cadastro_sem_convite;
  if (/already registered/i.test(msg)) return MESSAGES.email_ja_cadastrado;
  if (/signups? (not allowed|are disabled)/i.test(msg)) return 'Cadastros estão desligados no Supabase. Ligue "Allow new users to sign up" em Authentication.';
  if (/password/i.test(msg) && /(at least|weak|short)/i.test(msg)) return 'Senha fraca: use pelo menos 8 caracteres, misturando letras e números.';
  if (/exceeded the maximum allowed size|too large/i.test(msg)) return 'A imagem do escudo precisa ter no máximo 1 MB.';
  if (/mime type|invalid_mime/i.test(msg)) return 'Use uma imagem PNG, JPG, WEBP ou SVG para o escudo.';
  return `Erro: ${msg}`;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(platformError(error));
  return data as T;
}

export const clubInviteLink = (token: string) => `${window.location.origin}/?convite-clube=${token}`;

export const createClubInvite = (email: string) =>
  rpc<{ token: string; expires_at: string }>('owner_create_club_invite', { p_email: email });
export const cancelClubInvite = (id: string) => rpc<void>('owner_cancel_club_invite', { p_id: id });
export const listClubInvites = () => rpc<ClubInvite[]>('owner_list_club_invites');
export const listClubs = () => rpc<PlatformClub[]>('owner_list_clubs');
export const setClubStatus = (clubId: string, status: 'ativo' | 'suspenso') =>
  rpc<void>('owner_set_club_status', { p_club_id: clubId, p_status: status });
export const enterSupport = (clubId: string) => rpc<void>('owner_enter_support', { p_club_id: clubId });
export const exitSupport = () => rpc<void>('owner_exit_support');
export const listAccessLog = () => rpc<AccessLogEntry[]>('owner_list_access_log');
export const clubInviteInfo = (token: string) =>
  rpc<{ email: string; expires_at: string } | null>('club_invite_info', { p_token: token });

export const ESCUDO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
export const ESCUDO_MAX_BYTES = 1024 * 1024;

export function checkEscudoFile(file: File): string | null {
  if (!ESCUDO_TYPES.includes(file.type)) return 'Use uma imagem PNG, JPG, WEBP ou SVG para o escudo.';
  if (file.size > ESCUDO_MAX_BYTES) return 'A imagem do escudo precisa ter no máximo 1 MB.';
  return null;
}

/** Envia o escudo para o Storage (pasta do clube) e grava o endereço no clube. Só admin do clube. */
export async function uploadEscudo(clubId: string, file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const problem = checkEscudoFile(file);
  if (problem) throw new Error(problem);
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${clubId}/escudo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('escudos').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(platformError(error));
  const url = supabase.storage.from('escudos').getPublicUrl(path).data.publicUrl;
  await rpc<void>('club_set_escudo', { p_url: url });
  return url;
}

/**
 * Responsável aceita o convite: cria a conta (o banco cria o clube e o torna admin).
 * Devolve true se já entrou (sessão aberta), false se o Supabase exigir confirmação de e-mail.
 */
export async function acceptClubInvite(params: { token: string; email: string; password: string; nome: string; clubNome: string }) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: { data: { invite_token: params.token, nome: params.nome, club_nome: params.clubNome } },
  });
  if (error || !data.user) throw new Error(platformError(error ?? 'Não foi possível criar a conta.'));
  return Boolean(data.session);
}
