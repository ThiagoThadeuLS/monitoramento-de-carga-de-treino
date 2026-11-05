import React, { useEffect, useState } from 'react';
import { Share2, Sparkles, X } from 'lucide-react';
import { getAthleteAchievements } from '../../lib/athleteAuth';
import { AchievementsView, Badge, buildAchievements, monthName, newestBadge, visibleBadges } from '../../lib/achievements';
import { useShareStory } from './ShareStory';

/** Conquistas do atleta (sequência, selos e resumos). Recarrega junto com a tela Hoje. */
export function useAthleteAchievements(token: string | null, refreshKey: number): AchievementsView | null {
  const [view, setView] = useState<AchievementsView | null>(null);
  useEffect(() => {
    if (!token) {
      setView(null);
      return;
    }
    let cancelled = false;
    getAthleteAchievements(token)
      .then((d) => !cancelled && setView(buildAchievements(d)))
      .catch(() => {
        // Sem rede ou banco ainda sem a parte 17: a seção só não aparece
      });
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);
  return view;
}

// O que o atleta já viu ou dispensou fica neste aparelho (só para não repetir o aviso)
const seenKey = (athleteId: string) => `conquistas-vistas:${athleteId}`;
function readSeen(athleteId: string): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(seenKey(athleteId)) ?? '[]'));
  } catch {
    return new Set<string>();
  }
}
function markSeen(athleteId: string, id: string) {
  try {
    const s = readSeen(athleteId);
    s.add(id);
    localStorage.setItem(seenKey(athleteId), JSON.stringify([...s].slice(-60)));
  } catch {
    // navegador sem armazenamento: o aviso volta na próxima vez
  }
}

/** 0 = domingo */
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Na tela Hoje: a sequência de dias e, quando houver, um aviso (selo novo ou resumo pronto). */
export const AchievementsStrip: React.FC<{ view: AchievementsView | null; athleteId: string }> = ({ view, athleteId }) => {
  const share = useShareStory();
  const [, setVersion] = useState(0);
  if (!view || !share) return null;

  const seen = readSeen(athleteId);
  const novo = newestBadge(view.badges, view.today, seen);
  const monthId = `mes:${view.month.from.slice(0, 7)}`;
  const weekId = `semana:${view.week.from}`;
  const day = Number(view.today.slice(8, 10));
  const dow = weekday(view.today);

  // Um aviso por vez: selo novo; resumo do mês nos 3 primeiros dias; resumo da semana no domingo e na segunda
  const banner = novo
    ? { id: novo.id, emoji: novo.emoji, label: 'Nova conquista', title: novo.title, open: () => share.openStory({ kind: 'selo', selo: novo }) }
    : day <= 3 && view.month.treinos + view.month.dias > 0 && !seen.has(monthId)
    ? {
        id: monthId,
        emoji: '🗓️',
        label: `Seu resumo de ${monthName(view.month.from)}`,
        title: `${view.month.treinos} treinos · ${view.month.minutos.toLocaleString('pt-BR')} min`,
        open: () => share.openStory({ kind: 'resumo', resumo: view.month }),
      }
    : (dow === 0 || dow === 1) && view.week.treinos + view.week.dias > 0 && !seen.has(weekId)
    ? {
        id: weekId,
        emoji: '📊',
        label: 'Seu resumo da semana',
        title: `${view.week.treinos} treinos · ${view.week.minutos.toLocaleString('pt-BR')} min`,
        open: () => share.openStory({ kind: 'resumo', resumo: view.week }),
      }
    : null;

  const streak = view.streak.current;
  if (!banner && streak < 2) return null;

  const done = (id: string) => {
    markSeen(athleteId, id);
    setVersion((v) => v + 1);
  };

  return (
    <div className="space-y-2">
      {banner && (
        <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 to-sky-500/10 p-3.5 flex items-center gap-3">
          <span className="text-2xl leading-none" aria-hidden="true">
            {banner.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase font-bold tracking-wider text-amber-300">{banner.label}</p>
            <p className="text-sm font-bold text-white truncate">{banner.title}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              done(banner.id);
              banner.open();
            }}
            className="px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black flex items-center gap-1.5 flex-shrink-0"
          >
            <Share2 className="w-3.5 h-3.5" /> Compartilhar
          </button>
          <button type="button" onClick={() => done(banner.id)} className="p-1.5 text-slate-400 hover:text-white flex-shrink-0" aria-label="Agora não" title="Agora não">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {streak >= 2 && (
        <button
          type="button"
          onClick={() => share.openStory({ kind: 'sequencia', dias: streak })}
          className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 hover:border-slate-600 px-4 py-3 flex items-center gap-3 text-left"
          title="Compartilhar minha sequência"
        >
          <span className="text-xl leading-none" aria-hidden="true">
            🔥
          </span>
          <span className="flex-1 text-sm text-white">
            <strong>{streak} dias seguidos</strong> <span className="text-slate-400">respondendo</span>
          </span>
          <Share2 className="w-4 h-4 text-sky-300" />
        </button>
      )}
    </div>
  );
};

const BadgeTile: React.FC<{ badge: Badge; onShare: () => void }> = ({ badge, onShare }) =>
  badge.unlocked ? (
    <button
      type="button"
      onClick={onShare}
      className="rounded-xl border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 p-3 text-left flex items-start gap-2"
      title="Compartilhar esta conquista"
    >
      <span className="text-xl leading-none" aria-hidden="true">
        {badge.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-white">{badge.title}</span>
        <span className="block text-[10px] text-amber-200/80">Conquistado{badge.unlockedAt ? ` em ${badge.unlockedAt.slice(8, 10)}/${badge.unlockedAt.slice(5, 7)}` : ''}</span>
      </span>
      <Share2 className="w-3.5 h-3.5 text-amber-200 flex-shrink-0 mt-0.5" />
    </button>
  ) : (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex items-start gap-2 opacity-80">
      <span className="text-xl leading-none grayscale opacity-60" aria-hidden="true">
        {badge.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-slate-300">{badge.title}</span>
        <span className="block mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <span className="block h-full bg-sky-500" style={{ width: `${Math.round((badge.progress.value / badge.progress.target) * 100)}%` }} />
        </span>
        <span className="block text-[10px] text-slate-500 mt-0.5">
          {badge.progress.value} de {badge.progress.target}
        </span>
      </span>
    </div>
  );

const Tile: React.FC<{ emoji: string; title: string; detail: string; onClick?: () => void }> = ({ emoji, title, detail, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className="rounded-xl border border-slate-800 bg-slate-950/60 hover:border-slate-600 disabled:hover:border-slate-800 p-3 text-left disabled:opacity-60"
  >
    <span className="text-lg leading-none" aria-hidden="true">
      {emoji}
    </span>
    <span className="block text-sm font-black text-white mt-1">{title}</span>
    <span className="block text-[10px] text-slate-400 truncate">{detail}</span>
  </button>
);

/** No Histórico: sequência, resumos e selos (conquistados e o próximo de cada tipo). */
export const AchievementsPanel: React.FC<{ view: AchievementsView | null }> = ({ view }) => {
  const share = useShareStory();
  if (!view || !share) return null;
  const { streak, week, month } = view;

  return (
    <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-300" /> Conquistas
        </p>
        <p className="text-[10px] text-slate-500">Toque para compartilhar</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile
          emoji="🔥"
          title={`${streak.current} ${streak.current === 1 ? 'dia' : 'dias'}`}
          detail={`seguidos • recorde ${streak.best}`}
          onClick={streak.current > 0 ? () => share.openStory({ kind: 'sequencia', dias: streak.current }) : undefined}
        />
        <Tile
          emoji="📊"
          title="Semana"
          detail={week.titulo}
          onClick={week.treinos + week.dias > 0 ? () => share.openStory({ kind: 'resumo', resumo: week }) : undefined}
        />
        <Tile
          emoji="🗓️"
          title="Mês"
          detail={monthName(month.from)}
          onClick={month.treinos + month.dias > 0 ? () => share.openStory({ kind: 'resumo', resumo: month }) : undefined}
        />
      </div>

      <p className="text-[10px] text-slate-500">Dia sem treino não quebra a sequência.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {visibleBadges(view.badges).map((b) => (
          <BadgeTile key={b.id} badge={b} onShare={() => share.openStory({ kind: 'selo', selo: b })} />
        ))}
      </div>
    </section>
  );
};
