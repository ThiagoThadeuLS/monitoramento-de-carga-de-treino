import React, { useState } from 'react';
import { KeyRound, Lock, Eye, EyeOff, AlertCircle, Loader2, LogOut } from 'lucide-react';
import { changeOwnPassword } from '../lib/team';

interface CoachChangePasswordProps {
  nome: string;
  onChanged: () => void;
  onLogout: () => void;
}

/** Primeiro acesso do treinador: troca obrigatória da senha temporária. */
export const CoachChangePassword: React.FC<CoachChangePasswordProps> = ({ nome, onChanged, onLogout }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('A nova senha precisa ter pelo menos 8 caracteres.');
    if (password !== confirm) return setError('As senhas não conferem.');
    setLoading(true);
    setError('');
    try {
      await changeOwnPassword(password);
      onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-base';

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
            <KeyRound className="w-7 h-7 text-sky-400" />
          </div>
          <h2 className="text-xl font-black tracking-tight text-white">Olá, {nome.split(' ')[0]}! Crie sua senha</h2>
          <p className="text-xs text-slate-400">Você entrou com uma senha temporária. Para continuar, crie uma senha só sua.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-sky-400" /> Nova senha
            </span>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 8 caracteres"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-white"
                title={show ? 'Ocultar senha' : 'Ver senha'}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-sky-400" /> Confirme a nova senha
            </span>
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Digite novamente"
              className={inputClass}
            />
          </label>

          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-lg shadow-sky-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Salvar nova senha'}
          </button>
        </form>

        <button type="button" onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white">
          <LogOut className="w-3.5 h-3.5" /> Sair
        </button>
      </div>
    </div>
  );
};
