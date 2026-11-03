import React, { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { ClubAthlete } from '../../lib/athletes';
import { todayISO } from '../../lib/date';
import {
  PHYSIO_SIDE_LABEL,
  PHYSIO_STATUS_OPTIONS,
  PhysioCase,
  PhysioCaseInput,
  PhysioSide,
  PhysioStatus,
} from '../../lib/physio';

interface Props {
  athletes: ClubAthlete[];
  /** Caso em edição (ausente = novo caso) */
  initial?: PhysioCase | null;
  onClose: () => void;
  onSaved: (c: PhysioCase) => void;
  save: (input: PhysioCaseInput) => Promise<PhysioCase>;
}

const label = 'block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5';
const field =
  'w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';

/** Formulário do caso: lesão, lado, previsão de retorno e o que o treinador pode ver. */
export const PhysioCaseForm: React.FC<Props> = ({ athletes, initial, onClose, onSaved, save }) => {
  const [athleteId, setAthleteId] = useState(initial?.athlete_id ?? '');
  const [regiao, setRegiao] = useState(initial?.regiao ?? '');
  const [lado, setLado] = useState<PhysioSide | ''>(initial?.lado ?? '');
  const [status, setStatus] = useState<PhysioStatus>(initial?.status ?? 'avaliacao');
  const [inicio, setInicio] = useState(initial?.inicio ?? todayISO());
  const [previsao, setPrevisao] = useState(initial?.previsao_retorno ?? '');
  const [retornoReal, setRetornoReal] = useState(initial?.retorno_real ?? '');
  const [restricao, setRestricao] = useState(initial?.restricao ?? '');
  const [observacoes, setObservacoes] = useState(initial?.observacoes_treinador ?? '');
  const [notas, setNotas] = useState(initial?.notas_privadas ?? '');
  const [blockRandori, setBlockRandori] = useState(initial?.block_randori ?? true);
  const [blockContact, setBlockContact] = useState(initial?.block_contact ?? true);
  const [fullRest, setFullRest] = useState(initial?.full_rest ?? false);
  const [allowPhysical, setAllowPhysical] = useState(initial?.allow_physical ?? true);
  const [allowTechnical, setAllowTechnical] = useState(initial?.allow_technical ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeAthletes = athletes.filter((a) => a.active || a.id === initial?.athlete_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!athleteId) return setError('Escolha o atleta.');
    if (!regiao.trim()) return setError('Informe a região da lesão (ex.: joelho direito).');
    setSaving(true);
    setError('');
    try {
      const saved = await save({
        id: initial?.id,
        athlete_id: athleteId,
        status,
        regiao,
        lado: lado || null,
        inicio,
        previsao_retorno: previsao || null,
        retorno_real: status === 'alta' ? retornoReal || todayISO() : null,
        restricao,
        observacoes_treinador: observacoes,
        notas_privadas: notas,
        block_randori: blockRandori,
        block_contact: blockContact,
        full_rest: fullRest,
        allow_physical: allowPhysical,
        allow_technical: allowTechnical,
      });
      onSaved(saved);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{initial ? 'Editar caso' : 'Novo caso'}</h3>
            <p className="text-xs text-slate-400">A lesão acompanhada até a alta.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <label className="block">
            <span className={label}>Atleta *</span>
            <select
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              disabled={!!initial}
              className={`${field} disabled:opacity-60`}
            >
              <option value="">Escolha o atleta...</option>
              {activeAthletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                  {a.categoria ? ` • ${a.categoria}` : ''}
                </option>
              ))}
            </select>
            {initial && <span className="text-[11px] text-slate-500">O atleta do caso não pode ser trocado.</span>}
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className={label}>Região / queixa *</span>
              <input
                type="text"
                value={regiao}
                onChange={(e) => setRegiao(e.target.value)}
                maxLength={100}
                placeholder="ex: Joelho, lombar, ombro"
                className={field}
              />
            </label>
            <label className="block">
              <span className={label}>Lado</span>
              <select value={lado} onChange={(e) => setLado(e.target.value as PhysioSide | '')} className={field}>
                <option value="">Não informado</option>
                {(['direito', 'esquerdo', 'bilateral'] as PhysioSide[]).map((v) => (
                  <option key={v} value={v}>
                    {PHYSIO_SIDE_LABEL[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Situação</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as PhysioStatus)} className={field}>
                {PHYSIO_STATUS_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Início</span>
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={field} />
            </label>
            <label className="block">
              <span className={label}>Previsão de retorno</span>
              <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} className={field} />
            </label>
            {status === 'alta' && (
              <label className="block sm:col-span-2">
                <span className={label}>Data da alta</span>
                <input type="date" value={retornoReal} onChange={(e) => setRetornoReal(e.target.value)} className={field} />
              </label>
            )}
          </div>

          <label className="block">
            <span className={label}>Restrição para o treino</span>
            <input
              type="text"
              value={restricao}
              onChange={(e) => setRestricao(e.target.value)}
              placeholder="ex: sem contato, sem saltos, apenas natação"
              className={field}
            />
            <span className="text-[11px] text-slate-500">Aparece para os treinadores na tela Hoje.</span>
          </label>

          <label className="block">
            <span className={label}>Observações para os treinadores</span>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="ex: liberado para técnico, evitar quedas até a reavaliação"
              className={`${field} resize-none`}
            />
          </label>

          <label className="block">
            <span className={label}>Notas privadas da fisioterapia</span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="Exames, testes, conduta detalhada... (só a fisioterapia vê)"
              className={`${field} resize-none`}
            />
          </label>

          <div className="space-y-2">
            <span className={label}>Aplicação no cronograma do atleta</span>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input type="checkbox" checked={blockRandori} onChange={(e) => setBlockRandori(e.target.checked)} className="w-4 h-4 accent-sky-500" />
                Bloquear Randori / Luta livre / Combate
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input type="checkbox" checked={blockContact} onChange={(e) => setBlockContact(e.target.checked)} className="w-4 h-4 accent-sky-500" />
                Bloquear treinos com contato
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input type="checkbox" checked={allowPhysical} onChange={(e) => setAllowPhysical(e.target.checked)} className="w-4 h-4 accent-sky-500" />
                Permitir Treino Físico / Preparação Física
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input type="checkbox" checked={allowTechnical} onChange={(e) => setAllowTechnical(e.target.checked)} className="w-4 h-4 accent-sky-500" />
                Permitir Treino Técnico (sem contato livre)
              </label>
              <div className="pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 text-xs text-red-200">
                  <input type="checkbox" checked={fullRest} onChange={(e) => setFullRest(e.target.checked)} className="w-4 h-4 accent-red-500" />
                  Afastado total (esconder TODOS os treinos, mostrar apenas Fisioterapia)
                </label>
              </div>
              <p className="text-[11px] text-slate-500">
                Isso afeta apenas a visão do <strong className="text-slate-300">atleta</strong>. O cronograma da comissão técnica continua igual.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-700 flex items-center gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar caso
          </button>
        </div>
      </form>
    </div>
  );
};
