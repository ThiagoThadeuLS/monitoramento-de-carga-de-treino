import React, { useState } from 'react';
import { Edit2, Eye, EyeOff, Loader2, MessageSquare, Send, Trash2, X } from 'lucide-react';
import { stampInAppZone } from '../../../lib/date';
import { brDate } from '../../../lib/export';
import { Adversario, Observacao, classeLabel, initials, inputCls } from './types';
import { AuthorBadge, Info, OriginIcon, Sheet } from './ui';

/** Data da observação (DD/MM/AAAA, horário de Brasília). */
const obsDate = (iso: string) => {
  const [d] = stampInAppZone(iso);
  return d ? brDate(d) : '';
};

interface Props {
  adversario: Adversario;
  observacoes: Observacao[];
  currentUserId: string | null;
  readOnly: boolean;
  canEdit: boolean;
  hidden: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
  /** Devolve true se a observação foi salva (para limpar a caixa) */
  onAddObservation: (texto: string) => Promise<boolean>;
  onDeleteObservation: (obsId: string) => void;
}

/** Ficha do adversário: dados, observações táticas e ações (apagar para mim, editar, excluir). */
export const AdversaryDetailSheet: React.FC<Props> = ({
  adversario: a,
  observacoes,
  currentUserId,
  readOnly,
  canEdit,
  hidden,
  saving,
  error,
  onClose,
  onEdit,
  onDelete,
  onToggleHidden,
  onAddObservation,
  onDeleteObservation,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [texto, setTexto] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!texto.trim()) return;
    setSending(true);
    if (await onAddObservation(texto.trim())) setTexto('');
    setSending(false);
  };

  return (
    <Sheet onClose={onClose} label={a.nome}>
      <div className="px-5 py-4 border-b border-slate-800 flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-sky-300 flex-shrink-0">
          {initials(a.nome)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-white break-words">{a.nome}</h3>
          <p className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
            <OriginIcon tipo={a.tipo_origem} className="w-3.5 h-3.5" />
            {a.origem_valor} ({a.tipo_origem === 'pais' ? 'Internacional' : 'Nacional'})
            <AuthorBadge tipo={a.criado_por_tipo} prefix="Adicionado por " className="ml-2" />
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Info label="Sexo" value={a.sexo === 'masculino' ? 'Masculino' : 'Feminino'} />
          <Info label="Peso" value={a.categoria_peso} />
          <Info label="Classe" value={classeLabel(a.classe_idade)} />
        </div>

        {/* Observações táticas */}
        <div className="space-y-3 pt-2">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-sky-400" /> Observações e notas táticas
          </p>

          {observacoes.length === 0 ? (
            <p className="text-xs text-slate-500 italic bg-slate-950 p-3 rounded-xl border border-slate-800">
              Sem observações registradas para este adversário.
            </p>
          ) : (
            <div className="space-y-2">
              {observacoes.map((obs) => (
                <div key={obs.id} className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs space-y-1.5 relative group">
                  <div className="flex items-center justify-between text-[10px]">
                    <AuthorBadge tipo={obs.autor_tipo} long />
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{obsDate(obs.created_at)}</span>
                      {obs.autor_id === currentUserId && (
                        <button
                          type="button"
                          onClick={() => onDeleteObservation(obs.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors"
                          title="Apagar esta observação"
                          aria-label="Apagar esta observação"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-slate-200 whitespace-pre-wrap">{obs.texto}</p>
                </div>
              ))}
            </div>
          )}

          {/* Nova anotação */}
          <div className="flex gap-2 pt-2">
            <input
              type="text"
              placeholder="Escrever observação tática..."
              value={texto}
              maxLength={2000}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              className={`${inputCls} text-xs`}
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !texto.trim()}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center gap-1 flex-shrink-0 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enviar
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>

      {/* Rodapé: excluir e editar só para quem cadastrou a ficha */}
      {!readOnly && (
        <div className="px-5 py-4 border-t border-slate-800 flex flex-wrap gap-2">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete();
                }}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Excluir para todos
              </button>
            </>
          ) : (
            <>
              {/* Qualquer um: apaga só da própria lista (ou mostra de novo) */}
              <button
                type="button"
                onClick={onToggleHidden}
                disabled={saving}
                title={hidden ? 'Volta para a sua lista' : 'Some só da sua lista; os outros continuam vendo'}
                className="flex-1 min-w-[8.5rem] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold disabled:opacity-50"
              >
                {hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {hidden ? 'Mostrar de novo' : 'Apagar para mim'}
              </button>
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex-1 min-w-[8.5rem] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 text-xs font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir para todos
                  </button>
                  <button
                    type="button"
                    onClick={onEdit}
                    className="flex-1 min-w-[8.5rem] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Editar ficha
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
};
