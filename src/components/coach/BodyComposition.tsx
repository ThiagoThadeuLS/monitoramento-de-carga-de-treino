import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { deleteById, supabase } from '../../lib/supabase';
import { useClub } from '../../lib/club';
import { ClubAthlete, fetchAthleteBirthdays, fetchClubAthletes } from '../../lib/athletes';
import { useDialogs } from '../ui/Dialogs';
import { todayISO } from '../../lib/date';
import { brDate } from '../../lib/export';
import { ageOn } from '../../lib/age';
import {
  BodyCompositionResult,
  DOBRA_MAX,
  DOBRA_MIN,
  FOLD_SITES,
  FoldKey,
  FoldValues,
  IDADE_MAX,
  IDADE_MIN,
  PESO_MAX,
  PESO_MIN,
  PROTOCOL_FOLDS,
  Sexo,
  bodyComposition,
  filledFolds,
  foldsOutOfRange,
  formatDelta,
  missingFolds,
} from '../../lib/bodyFat';
import { BodySilhouette } from '../ui/BodySilhouette';
import { BodyFatTrend } from '../ui/BodyFatTrend';

/** Uma avaliação salva (dobras + resultado calculado). */
interface CompositionRow {
  id: string;
  date: string;
  idade: number;
  sexo: Sexo;
  peso: number | null;
  folds: FoldValues;
  soma: number;
  densidade: number;
  percentual: number;
  massaMagra: number | null;
  massaGorda: number | null;
  observacoes: string | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** "12,5" ou "12.5" → 12.5; vazio → null */
const parseNum = (text: string | undefined): number | null => {
  const t = (text ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Sexo do cadastro ('F'/'Feminino' → feminino; sem cadastro assume masculino). */
const sexoOf = (sexo?: string | null): Sexo => (/^f/i.test(String(sexo ?? '').trim()) ? 'Feminino' : 'Masculino');

const fmt = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const fromDb = (r: Record<string, unknown>): CompositionRow => {
  const folds: FoldValues = {};
  FOLD_SITES.forEach((f) => {
    folds[f.key] = num(r[`dobra_${f.key}`]);
  });
  return {
    id: r.id as string,
    date: r.date as string,
    idade: Number(r.idade),
    sexo: (r.sexo as Sexo) ?? 'Masculino',
    peso: num(r.peso),
    folds,
    soma: Number(r.soma_dobras),
    densidade: Number(r.densidade),
    percentual: Number(r.percentual),
    massaMagra: num(r.massa_magra),
    massaGorda: num(r.massa_gorda),
    observacoes: (r.observacoes as string | null) ?? null,
  };
};

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Composição corporal pela dobra cutânea: o treinador toca na dobra da silhueta,
 * digita a medida e o app calcula o % de gordura (Jackson & Pollock, 7 dobras).
 * O atleta vê só o percentual e a evolução — as dobras ficam aqui, no técnico.
 */
export const BodyComposition: React.FC = () => {
  const { club } = useClub();
  const clubId = club?.id ?? null;
  const { confirm, notify } = useDialogs();
  const formRef = useRef<HTMLDivElement>(null);

  const [athletes, setAthletes] = useState<ClubAthlete[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [athleteId, setAthleteId] = useState('');
  /** Data de nascimento de cada atleta (cadastro) → idade já preenchida */
  const [birthdays, setBirthdays] = useState<Record<string, string>>({});
  const birthdaysRef = useRef<Record<string, string>>({});

  const [rows, setRows] = useState<CompositionRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [date, setDate] = useState(todayISO());
  const [idade, setIdade] = useState('');
  const [peso, setPeso] = useState('');
  const [foldText, setFoldText] = useState<Partial<Record<FoldKey, string>>>({});
  const [observacoes, setObservacoes] = useState('');
  const [activeFold, setActiveFold] = useState<FoldKey | null>('peitoral');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prefilledFor = useRef<string | null>(null);

  // Lista de atletas do clube
  useEffect(() => {
    let cancelled = false;
    setLoadingAthletes(true);
    Promise.all([fetchClubAthletes(clubId), fetchAthleteBirthdays(clubId).catch(() => [])])
      .then(([list, births]) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        births.forEach((b) => {
          map[b.id] = b.birth_date;
        });
        birthdaysRef.current = map;
        setBirthdays(map);
        setAthletes(list);
        const first = list.find((a) => a.active) ?? list[0] ?? null;
        setAthleteId((cur) => cur || first?.id || '');
      })
      .catch(() => {
        if (!cancelled) setAthletes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAthletes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  // Histórico do atleta + último peso registrado (para já vir preenchido)
  useEffect(() => {
    if (!supabase || !athleteId) {
      setRows([]);
      return;
    }
    const db = supabase;
    let cancelled = false;
    setLoadingRows(true);
    setLoadError('');

    (async () => {
      try {
        const [compRes, weightRes] = await Promise.all([
          db.from('body_compositions').select('*').eq('athlete_id', athleteId).order('date', { ascending: false }),
          db.from('weight_records').select('date, weight').eq('athlete_id', athleteId).order('date', { ascending: false }).limit(1),
        ]);
        if (compRes.error) throw compRes.error;
        if (cancelled) return;

        const list = ((compRes.data ?? []) as Record<string, unknown>[]).map(fromDb);
        setRows(list);

        const lastWeight = num(weightRes.data?.[0]?.weight);

        if (prefilledFor.current !== athleteId) {
          prefilledFor.current = athleteId;
          // Sem histórico: usa a idade do cadastro (data de nascimento)
          const birth = birthdaysRef.current[athleteId] ?? null;
          const idadeCadastro = birth ? ageOn(birth, todayISO()) : null;
          setIdade(list[0] ? String(list[0].idade) : idadeCadastro !== null ? String(idadeCadastro) : '');
          setPeso(lastWeight !== null ? String(lastWeight).replace('.', ',') : list[0]?.peso != null ? fmt(list[0].peso) : '');
          setFoldText({});
          setObservacoes('');
          setEditingId(null);
          setDate(todayISO());
          setActiveFold('peitoral');
        }
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setLoadError(`Não foi possível carregar as avaliações. ${(err as Error)?.message ?? ''}`.trim());
        }
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [athleteId, reloadKey, athletes]);

  const folds: FoldValues = useMemo(() => {
    const out: FoldValues = {};
    FOLD_SITES.forEach((f) => {
      out[f.key] = parseNum(foldText[f.key]);
    });
    return out;
  }, [foldText]);

  const idadeNum = parseNum(idade);
  const pesoNum = parseNum(peso);
  const selectedAthlete = athletes.find((a) => a.id === athleteId) ?? null;
  /** O sexo do cálculo vem sempre do cadastro do atleta — não é editável na avaliação. */
  const sexo: Sexo = sexoOf(selectedAthlete?.sexo);
  const result: BodyCompositionResult | null = useMemo(
    () => bodyComposition({ folds, idade: idadeNum, sexo, peso: pesoNum }),
    [folds, idadeNum, sexo, pesoNum]
  );

  const feitas = filledFolds(folds);
  const faltam = missingFolds(folds);
  /** Medidas digitadas fora de 1–90 mm (o banco rejeitaria ao salvar). */
  const foraDaFaixa = useMemo(() => foldsOutOfRange(folds), [folds]);
  const selectedBirth = athleteId ? birthdays[athleteId] ?? null : null;
  const idadePeloCadastro = selectedBirth ? ageOn(selectedBirth, date) : null;

  /** Medida anterior à data escolhida (para mostrar a variação) */
  const previous = useMemo(
    () => rows.filter((r) => r.id !== editingId && r.date < date)[0] ?? null,
    [rows, date, editingId]
  );

  const activeSite = FOLD_SITES.find((f) => f.key === activeFold) ?? null;

  const setFold = (key: FoldKey, value: string) => setFoldText((cur) => ({ ...cur, [key]: value }));

  const stepFold = (delta: number) => {
    if (!activeFold) return;
    const cur = parseNum(foldText[activeFold]) ?? (delta > 0 ? DOBRA_MIN - 0.5 : DOBRA_MIN);
    const next = Math.min(DOBRA_MAX, Math.max(DOBRA_MIN, Math.round((cur + delta) * 2) / 2));
    setFold(activeFold, String(next).replace('.', ','));
  };

  const goFold = (dir: -1 | 1) => {
    const list = FOLD_SITES.map((f) => f.key);
    const idx = activeFold ? list.indexOf(activeFold) : -1;
    const next = list[(idx + dir + list.length) % list.length];
    setActiveFold(next);
  };

  const resetForm = () => {
    setEditingId(null);
    setDate(todayISO());
    setIdade(rows[0] ? String(rows[0].idade) : '');
    setPeso(rows[0]?.peso != null ? fmt(rows[0].peso) : '');
    setFoldText({});
    setObservacoes('');
    setActiveFold('peitoral');
  };

  const startEdit = (row: CompositionRow) => {
    setEditingId(row.id);
    setDate(row.date);
    setIdade(String(row.idade));
    setPeso(row.peso !== null ? fmt(row.peso) : '');
    const text: Partial<Record<FoldKey, string>> = {};
    FOLD_SITES.forEach((f) => {
      const v = row.folds[f.key];
      if (v !== null && v !== undefined) text[f.key] = String(v).replace('.', ',');
    });
    setFoldText(text);
    setObservacoes(row.observacoes ?? '');
    setActiveFold('peitoral');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSave = async () => {
    if (!supabase || !athleteId) return;
    if (foraDaFaixa.length > 0) {
      const medidas = foraDaFaixa
        .map((k) => {
          const site = FOLD_SITES.find((f) => f.key === k)!;
          return `${site.sigla} (${fmt(folds[k])} mm)`;
        })
        .join(', ');
      notify(
        `Corrija ${foraDaFaixa.length === 1 ? 'a dobra' : 'as dobras'} fora da faixa de ${DOBRA_MIN} a ${DOBRA_MAX} mm: ${medidas}.`,
        'error'
      );
      return;
    }
    if (!result) {
      notify(
        faltam.length > 0
          ? `Faltam ${faltam.length} dobra(s): ${faltam.map((k) => FOLD_SITES.find((f) => f.key === k)!.sigla).join(', ')}.`
          : 'Confira a idade (5 a 100 anos).',
        'error'
      );
      return;
    }
    if (pesoNum === null || pesoNum < PESO_MIN || pesoNum > PESO_MAX) {
      notify('Informe o peso do dia para calcular a massa magra e a gordura.', 'error');
      return;
    }

    setSaving(true);
    const payload: Record<string, unknown> = {
      athlete_id: athleteId,
      date,
      idade: idadeNum,
      sexo,
      peso: pesoNum,
      soma_dobras: result.soma,
      densidade: result.densidade,
      percentual: result.percentual,
      massa_magra: result.massaMagra,
      massa_gorda: result.massaGorda,
      observacoes: observacoes.trim() || null,
    };
    FOLD_SITES.forEach((f) => {
      payload[`dobra_${f.key}`] = folds[f.key] ?? null;
    });

    // Uma avaliação por dia: se já existe uma nessa data, ela é atualizada
    const sameDay = rows.find((r) => r.date === date);
    const targetId = editingId ?? sameDay?.id ?? null;

    const { error } = targetId
      ? await supabase.from('body_compositions').update(payload).eq('id', targetId)
      : await supabase.from('body_compositions').insert(payload);

    setSaving(false);
    if (error) {
      // Mensagens amigáveis para as travas do banco (mesmo se algum valor escapar da tela)
      const foldColumn = /body_compositions_dobra_(\w+)_check/.exec(error.message);
      const foldSite = foldColumn ? FOLD_SITES.find((f) => f.key === foldColumn[1]) : null;
      if (/duplicate key|unique/i.test(error.message)) {
        notify('Já existe uma avaliação nesta data. Edite a existente.', 'error');
      } else if (foldSite) {
        notify(`A dobra ${foldSite.nome} precisa ficar entre ${DOBRA_MIN} e ${DOBRA_MAX} mm.`, 'error');
      } else if (/body_compositions_soma_dobras_check/.test(error.message)) {
        notify(
          `A soma das dobras ficou fora da faixa aceita (${DOBRA_MIN * PROTOCOL_FOLDS.length} a ${
            DOBRA_MAX * PROTOCOL_FOLDS.length
          } mm). Revise as medidas.`,
          'error'
        );
      } else if (/violates check constraint/i.test(error.message)) {
        notify(
          `Algum valor ficou fora da faixa aceita. Revise as dobras (${DOBRA_MIN} a ${DOBRA_MAX} mm), a idade (${IDADE_MIN} a ${IDADE_MAX} anos) e o peso (${PESO_MIN} a ${PESO_MAX} kg).`,
          'error'
        );
      } else {
        notify(`Não foi possível salvar: ${error.message}`, 'error');
      }
      return;
    }
    notify(targetId && sameDay && !editingId ? 'Avaliação do dia atualizada.' : 'Avaliação salva.', 'success');
    setEditingId(null);
    setReloadKey((k) => k + 1);
  };

  const handleDelete = async (row: CompositionRow) => {
    if (!(await confirm({ message: `Excluir a avaliação de ${brDate(row.date)}?`, danger: true, confirmLabel: 'Excluir' }))) return;
    try {
      await deleteById('body_compositions', row.id);
      if (editingId === row.id) resetForm();
      setReloadKey((k) => k + 1);
      notify('Avaliação excluída.', 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  if (!supabase) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 text-sm text-slate-400">
        Banco de dados não configurado nesta instalação.
      </div>
    );
  }

  const deltaPercentual = result && previous ? result.percentual - previous.percentual : null;
  const deltaMagra = result?.massaMagra != null && previous?.massaMagra != null ? result.massaMagra - previous.massaMagra : null;
  const ringRatio = result ? Math.min(1, Math.max(0.03, (result.percentual - 3) / 27)) : 0;
  const trendPoints = [...rows].reverse().map((r) => ({ date: r.date, percentual: r.percentual }));

  return (
    <div className="space-y-4">
      {/* Cabeçalho: atleta + data */}
      <div ref={formRef} className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 flex-shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight">Composição corporal</h2>
            <p className="text-xs text-slate-400">
              Dobras cutâneas • Jackson &amp; Pollock (7 dobras) → % de gordura, massa magra e gordura
            </p>
          </div>
        </div>

        {loadingAthletes ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando atletas…
          </p>
        ) : athletes.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <UserRound className="w-4 h-4" /> Nenhum atleta cadastrado no clube ainda.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Atleta</span>
              <select
                value={athleteId}
                onChange={(e) => {
                  const id = e.target.value;
                  setAthleteId(id);
                  prefilledFor.current = null;
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                    {a.active ? '' : ' (inativo)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Data da avaliação</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
          </div>
        )}
      </div>

      {athleteId && (
        <div className="grid lg:grid-cols-5 gap-4 items-start">
          {/* Dobras + silhueta */}
          <section className="lg:col-span-3 bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Dobras do {selectedAthlete?.nome.split(' ')[0] ?? 'atleta'}</h3>
                <p className="text-[11px] text-slate-500">Toque no ponto da silhueta para digitar a medida.</p>
              </div>
              <span
                className={`text-[11px] font-black px-2.5 py-1 rounded-full border flex-shrink-0 ${
                  feitas === PROTOCOL_FOLDS.length
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {feitas}/{PROTOCOL_FOLDS.length}
              </span>
            </div>

            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${(feitas / PROTOCOL_FOLDS.length) * 100}%` }}
              />
            </div>

            <BodySilhouette folds={folds} active={activeFold} onSelect={setActiveFold} sexo={sexo} />

            {/* Entrada da dobra selecionada */}
            {activeSite ? (
              <div className="rounded-2xl border border-sky-500/40 bg-sky-500/[0.07] p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">
                      <span className="text-sky-400">{activeSite.sigla}</span> • {activeSite.nome}
                      {!activeSite.soma && (
                        <span className="ml-2 text-[10px] font-bold uppercase text-amber-300/90">extra, não soma</span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-400">{activeSite.dica}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFold(activeSite.key, '')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    title="Limpar esta dobra"
                    aria-label="Limpar esta dobra"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepFold(-0.5)}
                    className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center flex-shrink-0"
                    aria-label="Diminuir 0,5 mm"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="relative flex-1">
                    <input
                      key={activeSite.key}
                      autoFocus
                      type="text"
                      inputMode="decimal"
                      value={foldText[activeSite.key] ?? ''}
                      onChange={(e) => setFold(activeSite.key, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const restantes = FOLD_SITES.filter((f) => parseNum(foldText[f.key]) === null);
                          setActiveFold(restantes[0]?.key ?? activeSite.key);
                        }
                      }}
                      placeholder="0,0"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3 pr-10 py-2.5 text-white text-2xl font-black text-center focus:outline-none focus:ring-2 focus:ring-sky-500"
                      aria-label={`${activeSite.nome} em milímetros`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">mm</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => stepFold(0.5)}
                    className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center flex-shrink-0"
                    aria-label="Aumentar 0,5 mm"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {foraDaFaixa.includes(activeSite.key) && (
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-red-300">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    Medida fora da faixa: use de {DOBRA_MIN} a {DOBRA_MAX} mm.
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => goFold(-1)}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                  </button>
                  <span className="text-[10px] text-slate-500">Enter vai para a próxima vazia</span>
                  <button
                    type="button"
                    onClick={() => goFold(1)}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800"
                  >
                    Próxima <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-center">
                <p className="text-xs text-slate-400">Toque em um ponto da silhueta (ou numa sigla abaixo) para digitar a dobra.</p>
              </div>
            )}

            {/* Todas as siglas, para digitar sem clicar no desenho */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {FOLD_SITES.map((f) => {
                const v = folds[f.key];
                const done = typeof v === 'number' && v > 0;
                const out = foraDaFaixa.includes(f.key);
                const isActive = activeFold === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setActiveFold(f.key)}
                    className={`rounded-xl border px-1.5 py-1.5 text-center transition-colors ${
                      out
                        ? 'border-red-500/60 bg-red-500/10 hover:bg-red-500/15'
                        : isActive
                        ? 'border-sky-500 bg-sky-500/15'
                        : done
                        ? 'border-emerald-700/60 bg-emerald-500/5 hover:bg-emerald-500/10'
                        : 'border-slate-700 bg-slate-950/60 hover:bg-slate-800'
                    }`}
                    title={out ? `Fora da faixa (${DOBRA_MIN} a ${DOBRA_MAX} mm)` : f.dica}
                  >
                    <span
                      className={`block text-[10px] font-black tracking-wide ${
                        out ? 'text-red-300' : isActive ? 'text-sky-300' : 'text-slate-500'
                      }`}
                    >
                      {f.sigla}
                      {!f.soma && ' *'}
                    </span>
                    <span className={`block text-sm font-bold ${out ? 'text-red-200' : done ? 'text-white' : 'text-slate-600'}`}>
                      {done ? fmt(v as number, (v as number) % 1 === 0 ? 0 : 1) : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              <span className="text-amber-300/90 font-bold">*</span> BI e PN são anotadas como referência e não entram na soma
              das 7 dobras do protocolo.
            </p>
          </section>

          {/* Resultado */}
          <section className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">Resultado</h3>
              {editingId && (
                <span className="text-[10px] font-bold uppercase text-amber-300 bg-amber-500/10 border border-amber-500/40 px-2 py-1 rounded-full">
                  editando
                </span>
              )}
            </div>

            <div className="relative w-40 h-40 mx-auto">
              <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                <defs>
                  <linearGradient id="bf-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <circle cx="70" cy="70" r={RING_R} fill="none" stroke="#1e293b" strokeWidth="11" />
                <circle
                  cx="70"
                  cy="70"
                  r={RING_R}
                  fill="none"
                  stroke="url(#bf-ring)"
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeDasharray={`${RING_C * ringRatio} ${RING_C}`}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-white leading-none">
                  {result ? fmt(result.percentual, 2) : '—'}
                  {result && <span className="text-base font-bold text-slate-400">%</span>}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">gordura corporal</span>
              </div>
            </div>

            {!result && (
              <p
                className={`text-[11px] rounded-xl p-2.5 flex items-start gap-2 border ${
                  foraDaFaixa.length > 0
                    ? 'text-red-200 bg-red-500/10 border-red-500/40'
                    : 'text-slate-400 bg-slate-950/60 border-slate-800'
                }`}
              >
                {foraDaFaixa.length > 0 ? (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-red-400" />
                ) : (
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-sky-400" />
                )}
                {foraDaFaixa.length > 0
                  ? `Corrija ${foraDaFaixa.map((k) => FOLD_SITES.find((f) => f.key === k)!.sigla).join(', ')}: use medidas entre ${DOBRA_MIN} e ${DOBRA_MAX} mm.`
                  : faltam.length > 0
                  ? `Faltam ${faltam.length} dobra(s): ${faltam.map((k) => FOLD_SITES.find((f) => f.key === k)!.sigla).join(', ')}.`
                  : `Informe a idade (${IDADE_MIN} a ${IDADE_MAX} anos) para calcular.`}
              </p>
            )}

            {deltaPercentual !== null && previous && (
              <div
                className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 border ${
                  deltaPercentual <= 0 ? 'bg-emerald-500/10 border-emerald-600/40' : 'bg-amber-500/10 border-amber-600/40'
                }`}
              >
                <span className="text-[11px] text-slate-300">
                  desde {brDate(previous.date)}
                </span>
                <span
                  className={`flex items-center gap-1 text-sm font-black ${
                    deltaPercentual <= 0 ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {deltaPercentual <= 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                  {formatDelta(deltaPercentual, 2)} p.p.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Soma 7 dobras</p>
                <p className="text-lg font-black text-white">
                  {result ? fmt(result.soma, 1) : '—'} <span className="text-xs font-bold text-slate-500">mm</span>
                </p>
              </div>
              <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Densidade</p>
                <p className="text-lg font-black text-white">{result ? fmt(result.densidade, 4) : '—'}</p>
              </div>
              <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Massa magra</p>
                <p className="text-lg font-black text-emerald-300">
                  {result?.massaMagra != null ? fmt(result.massaMagra) : '—'} <span className="text-xs font-bold text-slate-500">kg</span>
                </p>
                {deltaMagra !== null && (
                  <p className={`text-[10px] font-bold ${deltaMagra >= 0 ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
                    {formatDelta(deltaMagra)} kg
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Massa gorda</p>
                <p className="text-lg font-black text-amber-300">
                  {result?.massaGorda != null ? fmt(result.massaGorda) : '—'} <span className="text-xs font-bold text-slate-500">kg</span>
                </p>
              </div>
            </div>

            {/* Dados que entram na conta */}
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Idade</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={idade}
                  onChange={(e) => setIdade(e.target.value)}
                  placeholder="anos"
                  min={IDADE_MIN}
                  max={IDADE_MAX}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Peso (kg)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  placeholder="0,0"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </label>
            </div>

            {/* Idade vinda do cadastro (data de nascimento) */}
            {selectedBirth && (
              <p className="text-[10px] text-slate-500 -mt-1 leading-relaxed">
                Cadastro: {brDate(selectedBirth)}
                {idadePeloCadastro !== null && ` • ${idadePeloCadastro} anos em ${brDate(date)}`}
                {idadePeloCadastro !== null && String(idadePeloCadastro) !== idade.trim() && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => setIdade(String(idadePeloCadastro))}
                      className="text-sky-400 font-bold hover:underline"
                    >
                      usar
                    </button>
                  </>
                )}
              </p>
            )}

            {/* Sexo não é editável: vem do cadastro do atleta. Aviso só se faltar. */}
            {selectedAthlete && !selectedAthlete.sexo && (
              <p className="text-[10px] text-amber-300/90 -mt-1 leading-relaxed">
                Sexo não informado no cadastro deste atleta — o cálculo está usando masculino. Atualize o cadastro
                para corrigir.
              </p>
            )}

            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Observações</span>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Ex.: avaliação pré-competição"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !result}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? 'Salvar alterações' : 'Salvar avaliação'}
              </button>
              {(editingId || feitas > 0) && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                  title="Começar uma avaliação nova"
                >
                  Nova
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Histórico e evolução */}
      {athleteId && (
        <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">Evolução do % de gordura</h3>
              <p className="text-[11px] text-slate-500">
                {rows.length === 0
                  ? 'Cada avaliação salva aparece aqui.'
                  : `${rows.length} avaliação(ões) • o atleta vê o mesmo gráfico no app dele.`}
              </p>
            </div>
            {loadError && <span className="text-[11px] text-red-300">{loadError}</span>}
          </div>

          {loadingRows ? (
            <p className="flex items-center gap-2 text-sm text-slate-400 py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando avaliações…
            </p>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center space-y-1">
              <Activity className="w-6 h-6 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-400">Nenhuma avaliação registrada para este atleta.</p>
              <p className="text-[11px] text-slate-500">Preencha as 7 dobras acima e salve a primeira.</p>
            </div>
          ) : (
            <>
              <BodyFatTrend points={trendPoints} height={190} />

              <ul className="divide-y divide-slate-800/70">
                {rows.map((r, i) => {
                  const anterior = rows[i + 1] ?? null;
                  const delta = anterior ? r.percentual - anterior.percentual : null;
                  return (
                    <li key={r.id} className={`flex items-center gap-3 py-2.5 ${editingId === r.id ? 'bg-sky-500/5' : ''}`}>
                      <div className="w-16 flex-shrink-0">
                        <p className="text-xs font-bold text-slate-200">{brDate(r.date).slice(0, 5)}</p>
                        <p className="text-[10px] text-slate-500">{r.idade} anos</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-white">
                          {fmt(r.percentual, 2)}%
                          {delta !== null && (
                            <span className={`ml-2 text-[11px] font-bold ${delta <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {formatDelta(delta, 2)} p.p.
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          Soma {fmt(r.soma)} mm
                          {r.massaMagra != null && ` • magra ${fmt(r.massaMagra)} kg`}
                          {r.massaGorda != null && ` • gordura ${fmt(r.massaGorda)} kg`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="p-2 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800"
                        title="Editar esta avaliação"
                        aria-label={`Editar avaliação de ${brDate(r.date)}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-500/10"
                        title="Excluir esta avaliação"
                        aria-label={`Excluir avaliação de ${brDate(r.date)}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>

              {rows.length === 1 && (
                <p className="flex items-start gap-2 text-[11px] text-slate-500">
                  <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  Primeira avaliação registrada. A partir da segunda o gráfico mostra a evolução.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
};
