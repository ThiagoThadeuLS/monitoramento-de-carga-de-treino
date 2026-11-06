import React, { useState } from 'react';
import { Cake, Loader2, LogOut, Save } from 'lucide-react';
import { AthleteProfile, updateAthleteProfile } from '../../lib/athleteAuth';
import { ageOn } from '../../lib/age';
import { todayISO } from '../../lib/date';

/**
 * Primeiro acesso: sem a data de nascimento o atleta não usa o app.
 * A data é usada na idade do % de gordura e para o app lembrar do aniversário.
 */
export const BirthDateGate: React.FC<{
  token: string;
  nome: string;
  onSaved: (profile: AthleteProfile) => void;
  onLogout: () => void;
}> = ({ token, nome, onSaved, onLogout }) => {
  const [birth, setBirth] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const today = todayISO();
  const idade = birth ? ageOn(birth, today) : null;

  const save = async () => {
    if (!birth) {
      setError('Escolha a sua data de nascimento.');
      return;
    }
    if (idade === null || idade < 5 || idade > 100) {
      setError('Confira a data: a idade precisa ficar entre 5 e 100 anos.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      onSaved(await updateAthleteProfile(token, { displayName: nome || 'Atleta', birth_date: birth }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="relative overflow-hidden rounded-3xl border border-sky-500/30 bg-slate-900/90 p-6 shadow-2xl space-y-5">
        <div className="absolute -top-16 -right-12 w-44 h-44 rounded-full bg-sky-500/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-300 flex-shrink-0">
            <Cake className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-black text-white leading-tight">Falta só uma coisa</h1>
            <p className="text-xs text-slate-400">Data de nascimento do seu cadastro</p>
          </div>
        </div>

        <p className="relative text-sm text-slate-300 leading-relaxed">
          Olá{nome ? `, ${nome.split(' ')[0]}` : ''}! Para liberar o app precisamos da sua data de nascimento. Ela é usada na
          idade do cálculo de % de gordura e faz o app lembrar do seu aniversário.
        </p>

        <label className="relative block">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Data de nascimento</span>
          <input
            type="date"
            value={birth}
            min="1900-01-01"
            max={today}
            onChange={(e) => {
              setBirth(e.target.value);
              setError('');
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-white text-base font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </label>

        {birth && idade !== null && idade >= 5 && idade <= 100 && (
          <p className="relative text-[11px] text-emerald-300/90">
            {idade} anos hoje
            {birth.slice(5, 7) === today.slice(5, 7) && birth.slice(8, 10) === today.slice(8, 10) ? ' • feliz aniversário! 🎉' : ''}
          </p>
        )}

        {error && (
          <p className="relative text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</p>
        )}

        <div className="relative space-y-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !birth}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar e continuar
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-300 py-1"
          >
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      </div>
    </div>
  );
};
