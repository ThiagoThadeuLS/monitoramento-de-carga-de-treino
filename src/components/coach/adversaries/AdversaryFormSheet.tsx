import React from 'react';
import { Loader2, X } from 'lucide-react';
import { CATEGORIAS_PESO, CLASSES, ClasseIdade, Draft, inputCls } from './types';
import { Field, OriginIcon, Sheet } from './ui';

interface Props {
  draft: Draft;
  onChange: (draft: Draft) => void;
  saving: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

/** Cadastro / edição da ficha do adversário. */
export const AdversaryFormSheet: React.FC<Props> = ({ draft, onChange, saving, error, onSubmit, onClose }) => {
  const title = draft.id ? 'Editar adversário' : 'Novo adversário';
  const availableWeights = CATEGORIAS_PESO[draft.sexo]?.[draft.classe_idade] ?? [];

  return (
    <Sheet onClose={onClose} label={title}>
      <form onSubmit={onSubmit} className="flex flex-col min-h-0">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <Field label="Nome do atleta">
            <input
              className={inputCls}
              value={draft.nome}
              maxLength={120}
              onChange={(e) => onChange({ ...draft, nome: e.target.value })}
              placeholder="Nome completo"
              autoFocus
            />
          </Field>

          <Field label="Sexo">
            <div className="grid grid-cols-2 gap-2">
              {(['masculino', 'feminino'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ ...draft, sexo: s, categoria_peso: CATEGORIAS_PESO[s][draft.classe_idade][0] })}
                  className={`py-2 rounded-xl text-xs font-bold border capitalize transition-colors ${
                    draft.sexo === s ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Classe de idade">
              <select
                className={inputCls}
                value={draft.classe_idade}
                onChange={(e) => {
                  const classe = e.target.value as ClasseIdade;
                  onChange({ ...draft, classe_idade: classe, categoria_peso: CATEGORIAS_PESO[draft.sexo][classe][0] });
                }}
              >
                {CLASSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Categoria de peso">
              <select className={inputCls} value={draft.categoria_peso} onChange={(e) => onChange({ ...draft, categoria_peso: e.target.value })}>
                {availableWeights.map((peso) => (
                  <option key={peso} value={peso}>
                    {peso}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Origem">
            <div className="grid grid-cols-2 gap-2 mb-2">
              {(['clube', 'pais'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ ...draft, tipo_origem: t })}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border ${
                    draft.tipo_origem === t ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <OriginIcon tipo={t} className="w-4 h-4" /> {t === 'clube' ? 'Clube (nacional)' : 'País (internacional)'}
                </button>
              ))}
            </div>
            <input
              className={inputCls}
              value={draft.origem_valor}
              maxLength={120}
              onChange={(e) => onChange({ ...draft, origem_valor: e.target.value })}
              placeholder={draft.tipo_origem === 'pais' ? 'Ex.: França, Japão...' : 'Ex.: Flamengo, Pinheiros...'}
            />
          </Field>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-slate-800 flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {draft.id ? 'Salvar alterações' : 'Cadastrar adversário'}
          </button>
        </div>
      </form>
    </Sheet>
  );
};
