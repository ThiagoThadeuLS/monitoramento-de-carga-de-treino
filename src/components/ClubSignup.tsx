import React, { useEffect, useState } from 'react';
import { Building2, ImagePlus, Lock, Mail, User, AlertCircle, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ClubCrest } from '../lib/club';
import { acceptClubInvite, checkEscudoFile, clubInviteInfo, platformError, uploadEscudo } from '../lib/platform';

interface ClubSignupProps {
  token: string;
  /** Clube criado e conta logada: abre o painel do treinador */
  onDone: () => void;
}

/** Página do convite de clube: o responsável cria o clube (nome + escudo) e a própria conta. */
export const ClubSignup: React.FC<ClubSignupProps> = ({ token, onDone }) => {
  const [invite, setInvite] = useState<{ email: string; expires_at: string } | null | undefined>(undefined);
  const [clubNome, setClubNome] = useState('');
  const [nome, setNome] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [escudo, setEscudo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    clubInviteInfo(token)
      .then(setInvite)
      .catch((err) => {
        setInvite(null);
        setError(err.message);
      });
  }, [token]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pickEscudo = (file: File | undefined) => {
    setError('');
    if (!file) return;
    const problem = checkEscudoFile(file);
    if (problem) return setError(problem);
    if (preview) URL.revokeObjectURL(preview);
    setEscudo(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    if (!clubNome.trim()) return setError('Informe o nome do clube.');
    if (!nome.trim()) return setError('Informe seu nome.');
    if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    if (password !== confirm) return setError('As senhas não conferem.');

    setSaving(true);
    setError('');
    try {
      // Garante que a conta nova não herda uma sessão antiga aberta neste navegador
      await supabase?.auth.signOut().catch(() => undefined);
      const loggedIn = await acceptClubInvite({ token, email: invite.email, password, nome: nome.trim(), clubNome: clubNome.trim() });
      if (!loggedIn) {
        setNeedsConfirm(true);
        return;
      }
      if (escudo) {
        try {
          const { data } = await supabase!.rpc('my_profile');
          await uploadEscudo(data.coach.club.id, escudo);
        } catch (err: any) {
          // o clube já foi criado; o escudo pode ser enviado depois na aba Equipe
          setWarning(`Clube criado, mas o escudo não foi enviado (${platformError(err)}). Você pode enviar depois na aba Equipe.`);
          setTimeout(onDone, 4000);
          return;
        }
      }
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-base';

  if (invite === undefined) {
    return (
      <div className="py-24 flex flex-col items-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
        <p className="text-sm">Abrindo convite...</p>
      </div>
    );
  }

  if (invite === null || needsConfirm) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 text-center space-y-3">
          {needsConfirm ? (
            <>
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="text-sm text-slate-200">Conta criada! Confirme seu e-mail pelo link enviado e depois entre como treinador.</p>
            </>
          ) : (
            <>
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
              <p className="text-sm text-slate-200">{error || 'Este convite expirou, já foi usado ou foi cancelado.'}</p>
              <p className="text-xs text-slate-500">Peça um novo convite para a equipe da plataforma.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <ClubCrest club={null} className="w-14 h-14 mx-auto" />
          <h2 className="text-xl font-black tracking-tight text-white">Cadastre seu clube</h2>
          <p className="text-xs text-slate-400">
            Você foi convidado para usar a plataforma de monitoramento de carga. Crie o clube e sua conta de administrador.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-sky-300 mb-2">Clube</legend>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-sky-400" /> Nome do clube *
              </span>
              <input type="text" maxLength={120} value={clubNome} onChange={(e) => setClubNome(e.target.value)} placeholder="ex: Associação de Judô Exemplo" className={inputClass} />
            </label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                {preview ? (
                  <img src={preview} alt="Prévia do escudo" className="w-full h-full object-contain" />
                ) : (
                  <ClubCrest club={clubNome.trim() ? { id: '', nome: clubNome } : null} className="w-12 h-12" />
                )}
              </div>
              <label className="flex-1">
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer">
                  <ImagePlus className="w-4 h-4" /> {escudo ? 'Trocar escudo' : 'Enviar escudo'}
                </span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => pickEscudo(e.target.files?.[0])} />
                <span className="block text-[11px] text-slate-500 mt-1">Opcional. PNG, JPG, WEBP ou SVG, até 1 MB.</span>
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-4 pt-4 border-t border-slate-800">
            <legend className="text-xs font-bold uppercase tracking-wider text-sky-300 mb-2">Sua conta (administrador do clube)</legend>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-sky-400" /> E-mail
              </span>
              <input type="email" value={invite.email} readOnly className={`${inputClass} opacity-70 cursor-not-allowed`} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-sky-400" /> Seu nome completo *
              </span>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex: Maria Oliveira" className={inputClass} />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-sky-400" /> Senha *
                </span>
                <div className="relative">
                  <input type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className={`${inputClass} pr-11`} />
                  <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-white" title={show ? 'Ocultar senha' : 'Ver senha'}>
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-sky-400" /> Confirme *
                </span>
                <input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Digite novamente" className={inputClass} />
              </label>
            </div>
          </fieldset>

          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
          {warning && (
            <div className="p-3 bg-amber-950/60 border border-amber-700 rounded-xl text-amber-300 text-xs">{warning}</div>
          )}

          <button
            type="submit"
            disabled={saving || !!warning}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-lg shadow-sky-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando clube...</> : 'Criar clube e entrar'}
          </button>
          <p className="text-[11px] text-slate-500 text-center">
            Convite válido até {new Date(invite.expires_at).toLocaleDateString('pt-BR')}.
          </p>
        </form>
      </div>
    </div>
  );
};
