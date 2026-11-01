import React, { useEffect, useState } from 'react';
import { Palette, Check, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { useClub } from '../../lib/club';
import {
  ClubTheme, DEFAULT_THEME, PRESETS, applyTheme, contrast, fetchClubTheme, isHex, sameTheme, saveClubTheme,
} from '../../lib/theme';

/** Gestão > Cores: paletas prontas ou personalizada (hexadecimal). Vale para treinadores e atletas do clube. */
export const ThemeSettings: React.FC = () => {
  const { club, reloadTheme } = useClub();
  const [saved, setSaved] = useState<ClubTheme>(DEFAULT_THEME);
  const [draft, setDraft] = useState<ClubTheme>(DEFAULT_THEME);
  const [accentText, setAccentText] = useState(DEFAULT_THEME.accent);
  const [baseText, setBaseText] = useState(DEFAULT_THEME.base);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!club) return;
    fetchClubTheme(club.id).then((t) => {
      const theme = t ?? DEFAULT_THEME;
      setSaved(theme);
      pick(theme, false);
      setLoading(false);
    });
  }, [club?.id]);

  // Pré-visualização ao vivo; ao sair sem salvar, volta à paleta salva
  useEffect(() => {
    if (!loading) applyTheme(draft);
  }, [draft, loading]);
  useEffect(() => () => reloadTheme(), []);

  function pick(theme: ClubTheme, preview = true) {
    setDraft(theme);
    setAccentText(theme.accent);
    setBaseText(theme.base);
    if (preview) setOk(false);
  }

  const typeHex = (field: keyof ClubTheme, raw: string) => {
    let v = raw.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    if (field === 'accent') setAccentText(v);
    else setBaseText(v);
    if (isHex(v)) setDraft((d) => ({ ...d, [field]: v.toLowerCase() }));
  };

  const accentBad = !isHex(accentText);
  const baseBad = !isHex(baseText);
  const lowContrast = !accentBad && !baseBad && contrast(draft.accent, draft.base) < 3;
  const lightBase = !baseBad && contrast(draft.base, '#ffffff') < 7;
  const dirty = !sameTheme(draft, saved);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await saveClubTheme(sameTheme(draft, DEFAULT_THEME) ? null : draft);
      setSaved(draft);
      setOk(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
      </div>
    );
  }

  const presetActive = PRESETS.find((p) => sameTheme(p.theme, draft));

  return (
    <div className="space-y-4">
      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
        <header className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
            <Palette className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <h3 className="font-bold text-white">Cores do sistema</h3>
            <p className="text-xs text-slate-400">
              Vale para todos os treinadores e atletas do clube. A tela já mostra a prévia: salve para aplicar a todos.
            </p>
          </div>
        </header>

        <div>
          <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Paletas prontas</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESETS.map((p) => {
              const on = presetActive?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p.theme)}
                  aria-pressed={on}
                  className={`relative rounded-xl border p-2.5 text-left transition-all ${
                    on ? 'border-sky-400 ring-2 ring-sky-500/40' : 'border-slate-700 hover:border-slate-500'
                  }`}
                  style={{ background: p.theme.base }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-6 h-6 rounded-full border border-white/20" style={{ background: p.theme.accent }} />
                    <span className="h-2 flex-1 rounded-full opacity-60" style={{ background: p.theme.accent }} />
                  </div>
                  <span className="text-xs font-bold" style={{ color: '#f1f5f9' }}>{p.nome}</span>
                  {on && <Check className="absolute top-2 right-2 w-4 h-4" style={{ color: p.theme.accent }} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 space-y-3">
          <p className="text-[10px] uppercase font-bold text-slate-400">
            Personalizada {!presetActive && <span className="text-sky-300 normal-case">• em uso</span>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              ['accent', 'Cor principal', 'Botões, abas e destaques', accentText, accentBad],
              ['base', 'Cor de fundo', 'Use um tom bem escuro', baseText, baseBad],
            ] as const).map(([field, label, hint, text, bad]) => (
              <label key={field} className="block">
                <span className="text-xs font-semibold text-slate-200">{label}</span>
                <span className="block text-[11px] text-slate-500 mb-1.5">{hint}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={isHex(text) ? text : draft[field]}
                    onChange={(e) => typeHex(field, e.target.value)}
                    className="w-11 h-10 rounded-lg bg-slate-950 border border-slate-700 cursor-pointer p-1"
                    aria-label={`${label}: seletor`}
                  />
                  <input
                    type="text"
                    value={text}
                    maxLength={7}
                    onChange={(e) => typeHex(field, e.target.value)}
                    placeholder="#000000"
                    className={`flex-1 bg-slate-950 border rounded-lg px-3 py-2 text-white text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                      bad ? 'border-red-500' : 'border-slate-700'
                    }`}
                    aria-label={`${label}: hexadecimal`}
                  />
                </div>
                {bad && <span className="text-[11px] text-red-300">Use o formato #RRGGBB (ex.: #0EA5E9).</span>}
              </label>
            ))}
          </div>
          {(lowContrast || lightBase) && (
            <p className="text-xs text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {lightBase
                ? 'O fundo está claro demais: os textos brancos ficam difíceis de ler. Prefira um tom bem escuro.'
                : 'A cor principal tem pouco contraste com o fundo. Os botões podem ficar difíceis de ver.'}
            </p>
          )}
        </div>

        {/* Prévia */}
        <div className="pt-4 border-t border-slate-800">
          <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Prévia</p>
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 flex flex-wrap items-center gap-2">
            <span className="px-3 py-2 rounded-lg bg-sky-500 text-slate-950 text-xs font-bold">Botão principal</span>
            <span className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold">Secundário</span>
            <span className="text-sky-400 text-xs font-semibold">Destaque</span>
            <span className="text-slate-400 text-xs">Texto de apoio</span>
          </div>
        </div>

        {error && <p className="text-xs text-red-300">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={() => pick(DEFAULT_THEME)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Voltar ao padrão
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty || accentBad || baseBad}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ok ? <Check className="w-3.5 h-3.5" /> : null}
            {ok && !dirty ? 'Cores salvas' : 'Salvar cores'}
          </button>
        </div>
      </section>
    </div>
  );
};
