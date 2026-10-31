import React, { useState } from 'react';
import { Lock, IdCard, Eye, EyeOff, User, AlertCircle, Loader2, Info } from 'lucide-react';
import { ClubCrest } from '../lib/club';
import { formatCpf, isValidCpf } from '../lib/cpf';
import { AthleteSession, loginAthlete } from '../lib/athleteAuth';

interface AthleteLoginProps {
  onLoginSuccess: (session: AthleteSession) => void;
}

export const AthleteLogin: React.FC<AthleteLoginProps> = ({ onLoginSuccess }) => {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidCpf(cpf)) {
      setErrorMsg('Digite um CPF válido.');
      return;
    }
    if (!password) {
      setErrorMsg('Digite sua senha.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      onLoginSuccess(await loginAthlete(cpf, password));
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur space-y-6">
        <div className="text-center space-y-3">
          <ClubCrest club={null} className="w-16 h-16 mx-auto" />
          <div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center justify-center gap-2">
              <User className="w-5 h-5 text-emerald-400" />
              Área do Atleta
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Entre com seu CPF para registrar seu treino do dia
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
              <IdCard className="w-3.5 h-3.5 text-emerald-400" />
              CPF
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="username"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              placeholder="000.000.000-00"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-base tracking-wide transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-base transition-all"
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

          {errorMsg && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-start gap-2.5 text-xs text-slate-400">
          <Info className="w-4 h-4 flex-shrink-0 text-sky-400 mt-0.5" />
          <p>
            <span className="font-semibold text-slate-200">Primeiro acesso?</span> Sua senha é o seu nome
            completo, tudo junto e em letras minúsculas. Ex.: <code className="text-sky-300">gabrielsilva</code>.
            Só atletas cadastrados pela comissão técnica conseguem entrar.
          </p>
        </div>
      </div>
    </div>
  );
};
