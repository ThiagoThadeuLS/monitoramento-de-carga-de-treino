import React, { useEffect, useState } from 'react';
import { CalendarDays, Loader2, Save, ShieldCheck, UserRound } from 'lucide-react';
import { AthleteProfile, updateAthleteProfile } from '../../lib/athleteAuth';
import { PhotoPicker } from '../ui/PhotoPicker';
import { useDialogs } from '../ui/Dialogs';
import { ageOn } from '../../lib/age';
import { brDate } from '../../lib/export';
import { todayISO } from '../../lib/date';

/**
 * Perfil do atleta: nome, data de nascimento e foto.
 * Só esses campos são editáveis (o cadastro do clube continua com a comissão técnica).
 */
export const AthleteProfileTab: React.FC<{
  token: string;
  profile: AthleteProfile;
  classe?: string | null;
  categoria?: string | null;
  clubName: string;
  onSaved: (profile: AthleteProfile) => void;
  onPhoto: (file: File) => Promise<void>;
}> = ({ token, profile, classe, categoria, clubName, onSaved, onPhoto }) => {
  const { notify } = useDialogs();
  const today = todayISO();
  const [nome, setNome] = useState(profile.display_name ?? profile.nome);
  const [birth, setBirth] = useState(profile.birth_date ?? '');
  const [saving, setSaving] = useState(false);

  // Perfil recarregado por fora (foto, login): acompanha
  useEffect(() => setNome(profile.display_name ?? profile.nome), [profile.display_name, profile.nome]);
  useEffect(() => setBirth(profile.birth_date ?? ''), [profile.birth_date]);

  const idade = birth ? ageOn(birth, today) : null;
  const suportaExibicao = profile.displayNameSupported;
  const exibicaoAtual = profile.display_name ?? profile.nome;
  const parsed =
    (suportaExibicao && nome.trim() !== exibicaoAtual) || birth !== (profile.birth_date ?? '');

  const save = async () => {
    const nomeLimpo = nome.trim().replace(/\s+/g, ' ');
    if (suportaExibicao && nomeLimpo.length < 2) {
      notify('Digite o nome que você quer ver no app.', 'error');
      return;
    }
    if (!birth) {
      notify('Informe sua data de nascimento.', 'error');
      return;
    }
    if (idade === null || idade < 5 || idade > 100) {
      notify('Confira a data de nascimento.', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateAthleteProfile(token, {
        // Banco antigo: manda o próprio nome do cadastro (não muda nada lá)
        displayName: suportaExibicao ? nomeLimpo : profile.nome,
        birth_date: birth,
      });
      onSaved(updated);
      notify('Perfil atualizado.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
          <UserRound className="w-5 h-5 text-sky-400" />
          <div className="min-w-0">
            <h2 className="font-bold text-white text-sm">Meu perfil</h2>
            <p className="text-[11px] text-slate-500">Foto, nome de exibição e nascimento</p>
          </div>
        </header>

        <div className="p-4 space-y-5">
          {/* Foto */}
          <div className="flex items-center gap-4">
            <PhotoPicker
              name={nome}
              src={profile.photo_url}
              onPick={onPhoto}
              onError={(message) => notify(message, 'error')}
              title="Trocar minha foto"
              className="w-20 h-20"
              textClassName="text-xl"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{nome || 'Atleta'}</p>
              <p className="text-[11px] text-slate-400">
                {[classe && `Classe ${classe}`, categoria].filter(Boolean).join(' • ') || 'Atleta'}
              </p>
              <p className="mt-1.5 text-[11px] text-slate-500">Toque na foto para trocar</p>
            </div>
          </div>

          {/* Nome */}
          <label className="block">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Nome de exibição</span>
            <input
              type="text"
              value={suportaExibicao ? nome : profile.nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={60}
              autoComplete="name"
              disabled={!suportaExibicao}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-60"
            />
            <span className="mt-1.5 block text-[11px] text-slate-500 leading-relaxed">
              {suportaExibicao
                ? 'Só você vê este nome no app. O cadastro da comissão técnica continua com o nome oficial.'
                : 'O banco ainda não foi atualizado: por enquanto vale o nome do cadastro. Rode o supabase_completo.sql para liberar o nome de exibição.'}
            </span>
            {suportaExibicao && exibicaoAtual !== profile.nome && (
              <button
                type="button"
                onClick={() => setNome(profile.nome)}
                className="mt-1 text-[11px] font-bold text-slate-400 hover:text-sky-300"
              >
                usar meu nome do cadastro
              </button>
            )}
          </label>

          {/* Nascimento */}
          <label className="block">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Data de nascimento
            </span>
            <input
              type="date"
              value={birth}
              min="1900-01-01"
              max={today}
              onChange={(e) => setBirth(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <CalendarDays className="w-3.5 h-3.5" />
              {idade !== null ? `${idade} anos hoje` : 'Usada na idade do % de gordura e no seu aniversário'}
            </span>
          </label>

          <button
            type="button"
            onClick={save}
            disabled={saving || !parsed}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar alterações
          </button>
        </div>
      </section>

      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Dados do clube</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Clube</span>
          <span className="text-white font-semibold">{clubName}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Classe</span>
          <span className="text-white font-semibold">{classe || '—'}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Categoria</span>
          <span className="text-white font-semibold">{categoria || '—'}</span>
        </div>
        {profile.birth_date && (
          <p className="flex items-start gap-2 text-[11px] text-slate-500 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            Seu aniversário é {brDate(profile.birth_date).slice(0, 5)} — a comissão técnica vê os aniversariantes do dia no
            painel.
          </p>
        )}
      </section>
    </div>
  );
};
