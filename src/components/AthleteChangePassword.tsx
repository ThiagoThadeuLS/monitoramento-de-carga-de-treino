import React, { useState } from 'react';
import { KeyRound, Lock, Eye, EyeOff, AlertCircle, Loader2, LogOut } from 'lucide-react';
import { AthleteSession, setAthletePassword } from '../lib/athleteAuth';

interface AthleteChangePasswordProps {
  session: AthleteSession;
  onPasswordChanged: (session: AthleteSession) => void;
  onLogout: () => void;
}

// Mesma regra do banco: minúsculo, sem espaços e sem acentos.
const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');

export const AthleteChangePassword: React.FC<AthleteChangePasswordProps> = ({
  session,
  onPasswordChanged,
  onLogout,
}) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const firstName = session.athlete.nome.split(' ')[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setErrorMsg('A nova senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (normalize(password) === normalize(session.athlete.nome)) {
      setErrorMsg('A nova senha não pode ser igual à senha inicial (seu nome completo).');
      return;
    }
    if (password !== confirm) {
      setErrorMsg('As senhas não conferem.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      onPasswordChanged(await setAthletePassword(session.token, password));
    } catch (err: any) {
      setErrorMsg(err.message);
      if (err.code === 'sessao_invalida' || err.code === 'senha_ja_definida') onLogout();
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-base transition-all';

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <KeyRound className="w-7 h-7 text-emerald-400" />
          </div>
          <h2 className="text-xl font-black tracking-tight text-white">Olá, {firstName}! Crie sua senha</h2>
          <p className="text-xs text-slate-400">
            Este é seu primeiro acesso. Para continuar, troque a senha inicial por uma senha só sua.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              Nova senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                autoCapitalize="none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-white transition-colors"
                title={showPassword ? 'Ocultar senha' : 'Ver senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              Confirme a nova senha
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoCapitalize="none"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Digite novamente"
              className={inputClass}
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar nova senha'
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Não é você? Sair
        </button>
      </div>
    </div>
  );
};
