import React, { useState } from 'react';
import { Camera, CheckCircle2, Heart, Loader2, Medal, Sparkles } from 'lucide-react';
import {
  AthleteCompetitionResult,
  COMPETITION_PLACEMENTS,
  CompetitionPlacement,
  PLACEMENT_EMOJI,
  NO_PLACEMENT_LABEL,
  PLACEMENT_LABEL,
  saveAthleteCompetitionResult,
} from '../../lib/competitions';
import type { MedalStickerData } from '../../lib/trainingSticker';

interface Props {
  token: string;
  competition: AthleteCompetitionResult;
  onClose: () => void;
  /** Recarrega a lista (o cartão de pendências some sozinho) */
  onSaved: () => void;
  /** Pede a foto com a medalha: ela abre depois que esta tela fechar */
  onShare: (medal: MedalStickerData) => void;
  /** Resultado já tocado na caixa do Hoje (só vale para quem ainda não registrou) */
  initialPlacement?: CompetitionPlacement | null;
}

type Saved = {
  colocacao: CompetitionPlacement | null;
  lutas: number | null;
  vitorias: number | null;
  derrotas: number | null;
};

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const parseCount = (value: string): number | null => {
  const t = value.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

const validCount = (n: number | null): n is number => n !== null && Number.isInteger(n) && n >= 0;

/** Registro/edição do resultado da competição pelo próprio atleta (nunca apaga). */
export const CompetitionResultDialog: React.FC<Props> = ({ token, competition, onClose, onSaved, onShare, initialPlacement }) => {
  const existing = competition.result;
  const [placement, setPlacement] = useState<CompetitionPlacement | null | undefined>(existing ? existing.colocacao : initialPlacement);
  const [statsOn, setStatsOn] = useState(existing?.lutas !== null && existing?.lutas !== undefined);
  const [lutas, setLutas] = useState(existing?.lutas !== null && existing?.lutas !== undefined ? String(existing.lutas) : '');
  const [vitorias, setVitorias] = useState(
    existing?.vitorias !== null && existing?.vitorias !== undefined ? String(existing.vitorias) : ''
  );
  const [derrotas, setDerrotas] = useState(
    existing?.derrotas !== null && existing?.derrotas !== undefined ? String(existing.derrotas) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Saved | null>(null);

  const choose = (value: CompetitionPlacement | null) => {
    setPlacement(value);
    setError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (placement === undefined) {
      setError('Escolha sua colocação (ou "Dessa vez não deu").');
      return;
    }

    let lutasN: number | null = null;
    let vitoriasN: number | null = null;
    let derrotasN: number | null = null;
    if (statsOn) {
      const filled = [lutas, vitorias, derrotas].filter((value) => value.trim() !== '').length;
      // Os três em branco contam como "não informar"; só não pode preencher pela metade.
      if (filled > 0) {
        lutasN = parseCount(lutas);
        vitoriasN = parseCount(vitorias);
        derrotasN = parseCount(derrotas);
        if (filled < 3 || !validCount(lutasN) || !validCount(vitoriasN) || !validCount(derrotasN)) {
          setError('Preencha lutas, vitórias e derrotas com números inteiros (ou deixe as três em branco).');
          return;
        }
        if (vitoriasN + derrotasN > lutasN) {
          setError('Vitórias + derrotas não podem passar do número de lutas.');
          return;
        }
      }
    }

    setSaving(true);
    setError('');
    try {
      await saveAthleteCompetitionResult(token, competition.competition_id, {
        colocacao: placement,
        lutas: lutasN,
        vitorias: vitoriasN,
        derrotas: derrotasN,
      });
      setSaved({ colocacao: placement, lutas: lutasN, vitorias: vitoriasN, derrotas: derrotasN });
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'Não foi possível salvar o resultado. Tente de novo.');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    const placed = saved.colocacao !== null;
    const card: MedalStickerData | null = placed
      ? {
          kind: 'resultado',
          nome: competition.nome,
          data: competition.data,
          local: competition.local,
          categoria: competition.categoria,
          colocacao: saved.colocacao as CompetitionPlacement,
          lutas: saved.lutas,
          vitorias: saved.vitorias,
          derrotas: saved.derrotas,
        }
      : null;

    return (
      <div className="space-y-4 text-center">
        {placed ? (
          <>
            <span className="text-5xl leading-none" aria-hidden="true">
              {PLACEMENT_EMOJI[saved.colocacao as CompetitionPlacement]}
            </span>
            <div>
              <p className="text-lg font-black text-white">{PLACEMENT_LABEL[saved.colocacao as CompetitionPlacement]}!</p>
              <p className="text-sm text-slate-400 mt-1">
                Resultado da {competition.nome} registrado. Ele já aparece para a comissão técnica.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={() => onShare(card!)}
                className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" /> Tirar foto com a medalha
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold"
              >
                Agora não
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-sky-500/15 border border-sky-500/40 text-sky-300">
              <Heart className="w-7 h-7" />
            </span>
            <div>
              <p className="text-lg font-black text-white">Resultado registrado</p>
              <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                Competir já é muito. O resultado não define o seu caminho — o que você aprendeu no tatame vale para o próximo treino.
              </p>
              <p className="text-xs text-slate-500 mt-2">A comissão técnica já pode ver o seu registro.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold"
            >
              Fechar
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <p className="text-sm font-bold text-white">{competition.nome}</p>
        <p className="text-xs text-slate-400">
          {shortDate(competition.data)}
          {competition.local ? ` • ${competition.local}` : ''}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Como você terminou?</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Colocação na competição">
          {COMPETITION_PLACEMENTS.map((p) => {
            const on = placement === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(p)}
                className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition-colors flex flex-col items-center gap-1 ${
                  on
                    ? 'bg-amber-500/20 border-amber-400/70 text-amber-100'
                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span className="text-lg leading-none" aria-hidden="true">
                  {PLACEMENT_EMOJI[p]}
                </span>
                {PLACEMENT_LABEL[p]}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={placement === null}
            onClick={() => choose(null)}
            className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition-colors flex flex-col items-center justify-center gap-1 ${
              placement === null
                ? 'bg-sky-500/20 border-sky-400/70 text-sky-100'
                : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Medal className="w-4 h-4 opacity-70" aria-hidden="true" />
            {NO_PLACEMENT_LABEL}
          </button>
        </div>
        <p className="text-[11px] text-slate-500">Tudo bem se não subiu ao pódio: registre do jeito que foi.</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
        <button
          type="button"
          onClick={() => {
            setStatsOn((v) => !v);
            setError('');
          }}
          className="w-full flex items-center justify-between gap-2 text-left"
          aria-expanded={statsOn}
        >
          <span>
            <span className="block text-xs font-bold text-slate-200">Lutas, vitórias e derrotas</span>
            <span className="block text-[10px] text-slate-500">Opcional, mas ajuda a comissão técnica a acompanhar você.</span>
          </span>
          <span
            className={`w-9 h-5 rounded-full border flex-shrink-0 transition-colors relative ${
              statsOn ? 'bg-sky-500 border-sky-400' : 'bg-slate-800 border-slate-600'
            }`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${statsOn ? 'left-[18px]' : 'left-0.5'}`}
            />
          </span>
        </button>

        {statsOn && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[
              { label: 'Lutas', value: lutas, set: setLutas },
              { label: 'Vitórias', value: vitorias, set: setVitorias },
              { label: 'Derrotas', value: derrotas, set: setDerrotas },
            ].map((field) => (
              <label key={field.label} className="block">
                <span className="block text-[10px] uppercase font-bold text-slate-500 mb-1">{field.label}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={field.value}
                  onChange={(e) => {
                    field.set(e.target.value);
                    setError('');
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-700 text-xs text-red-300">{error}</div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        {existing ? 'Salvar alterações' : 'Registrar resultado'}
      </button>

      {existing && (
        <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" /> Você pode editar quando quiser. O resultado nunca é apagado.
        </p>
      )}
    </form>
  );
};
