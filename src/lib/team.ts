import { createDetachedClient, supabase } from './supabase';

export interface TeamMember {
  user_id: string;
  nome: string;
  email: string;
  role: 'admin' | 'treinador';
  active: boolean;
  must_change_password: boolean;
  created_at: string;
}

const MESSAGES: Record<string, string> = {
  nao_autorizado: 'Só o administrador do clube pode fazer isso.',
  nome_obrigatorio: 'Informe o nome do treinador.',
  email_invalido: 'Informe um e-mail válido.',
  email_ja_cadastrado: 'Este e-mail já tem uma conta na plataforma.',
  papel_invalido: 'Papel inválido.',
  ultimo_admin: 'O clube precisa ter pelo menos um administrador ativo.',
  cadastro_sem_convite: 'O convite expirou ou não é válido. Tente cadastrar de novo.',
};

export function teamError(err: any): string {
  const msg = String(err?.message ?? err ?? '');
  const code = Object.keys(MESSAGES).find((k) => msg.includes(k));
  if (code) return MESSAGES[code];
  if (msg.includes('Could not find the function')) return 'A gestão de equipe ainda não foi ativada no banco. Rode o arquivo supabase_completo.sql no Supabase.';
  if (/signups? (not allowed|are disabled)/i.test(msg)) return 'Cadastros estão desligados no Supabase. Ligue "Allow new users to sign up" em Authentication.';
  if (/rate limit/i.test(msg)) return 'O Supabase bloqueou o envio de e-mails por excesso de tentativas. Desligue "Confirm email" em Authentication → Sign In / Providers → Email e tente de novo.';
  if (/Database error saving new user/i.test(msg)) return MESSAGES.cadastro_sem_convite;
  if (/already registered/i.test(msg)) return MESSAGES.email_ja_cadastrado;
  return `Erro: ${msg}`;
}

/** Senha temporária legível, sem caracteres ambíguos (0/O, 1/l/I). Ex.: K7m-p2Qx-9Rt */
export function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(9);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 3)}-${chars.slice(3, 6)}-${chars.slice(6, 9)}`;
}

export async function listTeam(): Promise<TeamMember[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('coaches')
    .select('user_id, nome, email, role, active, must_change_password, created_at')
    .order('nome');
  if (error) throw new Error(teamError(error));
  return (data ?? []) as TeamMember[];
}

/**
 * Cadastra um treinador no clube do admin logado:
 * 1. o banco cria um convite interno de uso único (15 min);
 * 2. este navegador cria a conta com a senha temporária + o código do convite;
 * 3. o banco confere o convite e liga a conta ao clube.
 * Devolve a senha temporária para o admin repassar.
 */
export async function addCoach(nome: string, email: string, role: 'admin' | 'treinador'): Promise<string> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data: token, error } = await supabase.rpc('club_add_coach', { p_nome: nome, p_email: email, p_role: role });
  if (error) throw new Error(teamError(error));

  const password = generateTempPassword();
  const detached = createDetachedClient();
  const { data, error: signUpError } = await detached.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { invite_token: token, nome } },
  });
  if (signUpError || !data.user) {
    await supabase.rpc('club_cancel_coach_invite', { p_token: token });
    throw new Error(teamError(signUpError ?? 'Não foi possível criar a conta.'));
  }
  await detached.auth.signOut().catch(() => undefined);
  return password;
}

export async function setCoachRole(userId: string, role: 'admin' | 'treinador') {
  const { error } = await supabase!.rpc('club_set_coach_role', { p_user_id: userId, p_role: role });
  if (error) throw new Error(teamError(error));
}

export async function setCoachActive(userId: string, active: boolean) {
  const { error } = await supabase!.rpc('club_set_coach_active', { p_user_id: userId, p_active: active });
  if (error) throw new Error(teamError(error));
}

/** Troca a senha do treinador logado e libera o acesso (fim da senha temporária). */
export async function changeOwnPassword(newPassword: string) {
  const { error } = await supabase!.auth.updateUser({ password: newPassword });
  if (error) {
    if (/should be different/i.test(error.message)) throw new Error('A nova senha precisa ser diferente da senha temporária.');
    if (/at least|weak|short/i.test(error.message)) throw new Error('Senha fraca: use pelo menos 8 caracteres, misturando letras e números.');
    throw new Error(`Erro ao trocar a senha: ${error.message}`);
  }
  const { error: flagError } = await supabase!.rpc('coach_password_changed');
  if (flagError) throw new Error(teamError(flagError));
}
