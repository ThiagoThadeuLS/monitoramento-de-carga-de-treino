import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { restoreAthleteSession } from '../../lib/athleteAuth'; // Importado para resgatar o ID real e fixo do atleta
import {
  Shield, Plus, Edit2, Trash2, Loader2, X, Search, Globe2, Building2, AlertCircle, Scale, ChevronRight, MessageSquare, Send,
} from 'lucide-react';

type ClasseIdade = 'juvenil' | 'júnior' | 'sênior';
type TipoOrigem = 'pais' | 'clube';
type Sexo = 'masculino' | 'feminino';

interface Adversario {
  id: string;
  club_id: string;
  nome: string;
  sexo: Sexo;
  categoria_peso: string;
  classe_idade: ClasseIdade;
  tipo_origem: TipoOrigem;
  origem_valor: string;
  criado_por_id?: string;
  criado_por_tipo?: 'atleta' | 'tecnico';
}

interface Observacao {
  id: string;
  adversario_id: string;
  autor_id: string;
  autor_tipo: 'atleta' | 'tecnico';
  texto: string;
  created_at: string;
}

type Draft = Omit<Adversario, 'id' | 'club_id'> & { id?: string; club_id?: string };

const CLASSES: { id: ClasseIdade; label: string }[] = [
  { id: 'juvenil', label: 'Juvenil' },
  { id: 'júnior', label: 'Júnior' },
  { id: 'sênior', label: 'Sênior' },
];

const CATEGORIAS_PESO: Record<Sexo, Record<ClasseIdade, string[]>> = {
  feminino: {
    juvenil: ['-44Kg', '-48Kg', '-52Kg', '-57Kg', '-63Kg', '-70Kg', '+70Kg'],
    júnior: ['-48Kg', '-52Kg', '-57Kg', '-63Kg', '-70Kg', '-78Kg', '+78Kg'],
    sênior: ['-48Kg', '-52Kg', '-57Kg', '-63Kg', '-70Kg', '-78Kg', '+78Kg'],
  },
  masculino: {
    juvenil: ['-55Kg', '-60Kg', '-66Kg', '-73Kg', '-81Kg', '-90Kg', '+90Kg'],
    júnior: ['-60Kg', '-66Kg', '-73Kg', '-81Kg', '-90Kg', '-100Kg', '+100Kg'],
    sênior: ['-60Kg', '-66Kg', '-73Kg', '-81Kg', '-90Kg', '-100Kg', '+100Kg'],
  },
};

const EMPTY: Draft = { 
  nome: '', 
  sexo: 'masculino', 
  categoria_peso: '-60Kg', 
  classe_idade: 'sênior', 
  tipo_origem: 'clube', 
  origem_valor: '' 
};

const initials = (nome: string) =>
  nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const classeLabel = (c: ClasseIdade) => CLASSES.find((x) => x.id === c)?.label ?? c;

const inputCls =
  'w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500';

export function AdversaryManagement({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [adversarios, setAdversarios] = useState<Adversario[]>([]);
  const [observacoes, setObservacoes] = useState<Record<string, Observacao[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [classe, setClasse] = useState<ClasseIdade | 'todas'>('todas');
  const [origem, setOrigem] = useState<TipoOrigem | 'todas'>('todas');
  const [open, setOpen] = useState<Adversario | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [novoTextoObs, setNovoTextoObs] = useState<Record<string, string>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userClubId, setUserClubId] = useState<string | null>(null);
  const [isCoach, setIsCoach] = useState(false);

  useEffect(() => {
    loadUserAndData();
  }, []);

  async function loadUserAndData() {
    if (!supabase) return setLoading(false);
    setLoading(true);
    setLoadError('');

    let coachStatus = false;
    let clubIdVal = null;
    let userIdVal = null;

    // 1. Verificar sessão ativa no Supabase Auth (Técnico / Admin)
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      userIdVal = session.user.id;
      const { data: coachData } = await supabase.from('coaches').select('club_id').eq('user_id', userIdVal).maybeSingle();
      if (coachData) {
        coachStatus = true;
        clubIdVal = coachData.club_id;
      }
    }

    // 2. Se não encontrou no Supabase Auth, valida e recupera a sessão oficial do Atleta
    if (!userIdVal) {
      try {
        const athleteSession = await restoreAthleteSession();
        if (athleteSession && athleteSession.athlete) {
          coachStatus = false;
          userIdVal = athleteSession.athlete.id; // ID fixo e real da tabela de atletas!
          clubIdVal = athleteSession.club?.id || null;
        }
      } catch (e) {
        console.error('Erro ao restaurar sessão do atleta:', e);
      }
    }

    setIsCoach(coachStatus);
    setUserClubId(clubIdVal);
    setCurrentUserId(userIdVal);

    // 3. Buscar adversários do clube
    let query = supabase.from('adversarios').select('*').order('nome');
    if (clubIdVal) {
      query = query.eq('club_id', clubIdVal);
    }

    const { data, error } = await query;
    if (error) {
      setLoadError('Não foi possível carregar os adversários.');
    } else {
      let advs = (data ?? []) as Adversario[];

      // Se for atleta, garante que ele vê os do técnico e os dele
      if (!coachStatus && userIdVal) {
        advs = advs.filter(a => 
          a.criado_por_tipo === 'tecnico' || 
          a.criado_por_id === userIdVal
        );
      }

      setAdversarios(advs);
      if (advs.length > 0) {
        await fetchObservacoes(advs.map(a => a.id), userIdVal, coachStatus);
      }
    }
    setLoading(false);
  }

  async function fetchObservacoes(adversarioIds: string[], currentUid: string | null, coach: boolean) {
    if (!supabase || adversarioIds.length === 0) return;
    
    let query = supabase
      .from('adversario_observacoes')
      .select('*')
      .in('adversario_id', adversarioIds)
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (!error && data) {
      const grouped: Record<string, Observacao[]> = {};
      data.forEach((obs: Observacao) => {
        // Se for atleta, oculta apenas notas de outros atletas
        if (!coach && currentUid) {
          if (obs.autor_tipo === 'atleta' && obs.autor_id !== currentUid) {
            return;
          }
        }

        if (!grouped[obs.adversario_id]) {
          grouped[obs.adversario_id] = [];
        }
        grouped[obs.adversario_id].push(obs);
      });
      setObservacoes(grouped);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return adversarios.filter(
      (a) =>
        (classe === 'todas' || a.classe_idade === classe) &&
        (origem === 'todas' || a.tipo_origem === origem) &&
        (!q || [a.nome, a.categoria_peso, a.origem_valor].some((v) => v.toLowerCase().includes(q)))
    );
  }, [adversarios, search, classe, origem]);

  const startNew = () => {
    setFormError('');
    const defaultSexo: Sexo = 'masculino';
    const defaultClasse: ClasseIdade = 'sênior';
    const defaultPeso = CATEGORIAS_PESO[defaultSexo][defaultClasse][0];
    setEditing({ ...EMPTY, sexo: defaultSexo, classe_idade: defaultClasse, categoria_peso: defaultPeso, club_id: userClubId || undefined });
  };
  
  const startEdit = (a: Adversario) => {
    if (a.criado_por_id !== currentUserId) {
      alert('Você só pode editar fichas que você mesmo cadastrou.');
      return;
    }
    setFormError('');
    setOpen(null);
    setEditing({ ...a });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !editing) return;
    if (!editing.nome.trim() || !editing.categoria_peso.trim() || !editing.origem_valor.trim()) {
      setFormError('Preencha nome, categoria de peso e origem.');
      return;
    }

    let targetClubId = userClubId;
    let activeUserId = currentUserId;

    if (!targetClubId && adversarios.length > 0) {
      targetClubId = adversarios[0]?.club_id || null;
    }

    if (!targetClubId || !activeUserId) {
      setFormError('Erro: Utilizador ou clube não identificado. Tente reentrar no sistema.');
      return;
    }

    setSaving(true);
    setFormError('');
    const payload = {
      club_id: targetClubId,
      nome: editing.nome.trim(),
      sexo: editing.sexo,
      categoria_peso: editing.categoria_peso.trim(),
      classe_idade: editing.classe_idade,
      tipo_origem: editing.tipo_origem,
      origem_valor: editing.origem_valor.trim(),
      ...(editing.id ? {} : { criado_por_id: activeUserId, criado_por_tipo: isCoach ? 'tecnico' : 'atleta' })
    };

    const { error } = editing.id
      ? await supabase.from('adversarios').update(payload).eq('id', editing.id)
      : await supabase.from('adversarios').insert([payload]);

    setSaving(false);
    if (error) {
      if (error.code === '23505' || error.message?.includes('conflict') || error.message?.includes('duplicate')) {
        setFormError('Já existe um adversário cadastrado com este nome.');
      } else {
        setFormError(`Não foi possível salvar: ${error.message}`);
      }
      return;
    }
    setEditing(null);
    loadUserAndData();
  }

  async function remove(a: Adversario) {
    if (!supabase || !currentUserId) return;
    
    if (a.criado_por_id !== currentUserId) {
      alert('Você só tem permissão para excluir fichas de adversários que você mesmo cadastrou.');
      setConfirmDelete(false);
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('adversarios').delete().eq('id', a.id);
    setSaving(false);
    setConfirmDelete(false);
    if (error) return setFormError('Não foi possível excluir.');
    setOpen(null);
    loadUserAndData();
  }

  async function handleAddObservacao(adversarioId: string) {
    const texto = novoTextoObs[adversarioId];
    if (!supabase || !texto || !texto.trim()) return;

    if (!currentUserId) {
      alert('Sessão expirada ou utilizador não identificado. Faça login novamente.');
      return;
    }

    const payload = {
      adversario_id: adversarioId,
      autor_id: currentUserId,
      autor_tipo: isCoach ? 'tecnico' : 'atleta',
      texto: texto.trim(),
    };

    const { error } = await supabase.from('adversario_observacoes').insert([payload]);
    if (error) {
      alert(`Erro ao adicionar observação: ${error.message}`);
    } else {
      setNovoTextoObs({ ...novoTextoObs, [adversarioId]: '' });
      await loadUserAndData();
    }
  }

  async function handleDeleteObservacao(obsId: string, adversarioId: string) {
    if (!supabase) return;
    if (!confirm('Deseja excluir esta observação?')) return;

    const { error } = await supabase.from('adversario_observacoes').delete().eq('id', obsId);
    if (error) {
      alert('Erro ao excluir observação (você só pode apagar as suas próprias anotações).');
    } else {
      await loadUserAndData();
    }
  }

  const chip = (on: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap flex-shrink-0 ${
      on ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
    }`;

  const OriginIcon = ({ tipo, className }: { tipo: TipoOrigem; className?: string }) =>
    tipo === 'pais' ? <Globe2 className={className} /> : <Building2 className={className} />;

  const availableWeights = useMemo(() => {
    if (!editing) return [];
    return CATEGORIAS_PESO[editing.sexo]?.[editing.classe_idade] || [];
  }, [editing?.sexo, editing?.classe_idade]);

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">Atletas adversários</h2>
            <p className="text-xs text-slate-400">
              {adversarios.length} cadastrado{adversarios.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={startNew}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold shadow-lg shadow-sky-500/20"
          >
            <Plus className="w-4 h-4" /> Novo adversário
          </button>
        )}
      </div>

      {/* Busca e filtros */}
      <div className="bg-slate-900/80 border border-slate-800 p-3 sm:p-4 rounded-2xl space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, categoria, clube ou país"
            className={`${inputCls} pl-9`}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 flex-wrap">
            <button type="button" className={chip(classe === 'todas')} onClick={() => setClasse('todas')}>Todas as classes</button>
            {CLASSES.map((c) => (
              <button key={c.id} type="button" className={chip(classe === c.id)} onClick={() => setClasse(c.id)}>{c.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 flex-wrap">
            <button type="button" className={chip(origem === 'todas')} onClick={() => setOrigem('todas')}>Todas</button>
            <button type="button" className={chip(origem === 'clube')} onClick={() => setOrigem('clube')}>Nacionais</button>
            <button type="button" className={chip(origem === 'pais')} onClick={() => setOrigem('pais')}>Internacionais</button>
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
        </div>
      ) : loadError ? (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-14 text-center bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl space-y-2">
          <Shield className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-400">
            {adversarios.length === 0 ? 'Nenhum adversário cadastrado ainda.' : 'Nenhum adversário encontrado com esses filtros.'}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setOpen(a)}
                className="w-full h-full text-left bg-slate-900/90 border border-slate-800 hover:border-sky-500/50 rounded-2xl p-4 transition-colors flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-black text-sky-300 flex-shrink-0">
                    {initials(a.nome)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white truncate">{a.nome}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
                      <OriginIcon tipo={a.tipo_origem} className="w-3.5 h-3.5 flex-shrink-0" />
                      {a.origem_valor}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0 mt-1" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold flex items-center gap-1">
                      <Scale className="w-3 h-3" /> {a.categoria_peso}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-semibold capitalize">
                      {a.sexo} • {classeLabel(a.classe_idade)}
                    </span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                    a.criado_por_tipo === 'tecnico' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                  }`}>
                    {a.criado_por_tipo === 'tecnico' ? 'Técnico' : 'Atleta'}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Detalhes e Observações */}
      {open && (
        <Sheet onClose={() => { setOpen(null); setConfirmDelete(false); }} label={open.nome}>
          <div className="px-5 py-4 border-b border-slate-800 flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-sky-300 flex-shrink-0">
              {initials(open.nome)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-white break-words">{open.nome}</h3>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <OriginIcon tipo={open.tipo_origem} className="w-3.5 h-3.5" />
                {open.origem_valor} ({open.tipo_origem === 'pais' ? 'Internacional' : 'Nacional'})
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                  open.criado_por_tipo === 'tecnico' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                }`}>
                  Adicionado por {open.criado_por_tipo === 'tecnico' ? 'Técnico' : 'Atleta'}
                </span>
              </p>
            </div>
            <button type="button" onClick={() => setOpen(null)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
            <div className="grid grid-cols-3 gap-3">
              <Info label="Sexo" value={open.sexo === 'masculino' ? 'Masculino' : 'Feminino'} />
              <Info label="Peso" value={open.categoria_peso} />
              <Info label="Classe" value={classeLabel(open.classe_idade)} />
            </div>

            {/* Secção de Observações Táticas */}
            <div className="space-y-3 pt-2">
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-sky-400" /> Observações e Notas Táticas
              </p>

              {(!observacoes[open.id] || observacoes[open.id].length === 0) ? (
                <p className="text-xs text-slate-500 italic bg-slate-950 p-3 rounded-xl border border-slate-800">Sem observações registadas para este adversário.</p>
              ) : (
                <div className="space-y-2">
                  {observacoes[open.id].map((obs) => {
                    const canDeleteObs = obs.autor_id === currentUserId;
                    return (
                      <div key={obs.id} className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs space-y-1.5 relative group">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={`font-bold px-2 py-0.5 rounded uppercase ${
                            obs.autor_tipo === 'tecnico' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          }`}>
                            {obs.autor_tipo === 'tecnico' ? 'Comissão Técnica' : 'Atleta'}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">{new Date(obs.created_at).toLocaleDateString('pt-BR')}</span>
                            {canDeleteObs && (
                              <button
                                type="button"
                                onClick={() => handleDeleteObservacao(obs.id, open.id)}
                                className="text-slate-500 hover:text-red-400 transition-colors"
                                title="Apagar esta observação"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-slate-200 whitespace-pre-wrap">{obs.texto}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Caixa para nova anotação */}
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Escrever observação tática..."
                  value={novoTextoObs[open.id] || ''}
                  onChange={(e) => setNovoTextoObs({ ...novoTextoObs, [open.id]: e.target.value })}
                  className={`${inputCls} text-xs`}
                />
                <button
                  type="button"
                  onClick={() => handleAddObservacao(open.id)}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center gap-1 flex-shrink-0"
                >
                  <Send className="w-3.5 h-3.5" /> Enviar
                </button>
              </div>
            </div>

            {formError && <p className="text-xs text-red-300">{formError}</p>}
          </div>

          {/* Rodapé: O botão de excluir e editar a ficha só aparece se o utilizador atual foi quem criou */}
          {!readOnly && (
            <div className="px-5 py-4 border-t border-slate-800 flex gap-2">
              {confirmDelete ? (
                <>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(open)}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Confirmar exclusão
                  </button>
                </>
              ) : (
                <>
                  {(() => {
                    const isOwner = open.criado_por_id === currentUserId;
                    if (!isOwner) return null;
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 text-xs font-bold"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Excluir
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(open)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Editar Ficha
                        </button>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </Sheet>
      )}

      {/* Cadastro / edição de adversário */}
      {editing && (
        <Sheet onClose={() => setEditing(null)} label={editing.id ? 'Editar adversário' : 'Novo adversário'}>
          <form onSubmit={save} className="flex flex-col min-h-0">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{editing.id ? 'Editar adversário' : 'Novo adversário'}</h3>
              <button type="button" onClick={() => setEditing(null)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <Field label="Nome do atleta">
                <input className={inputCls} value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} placeholder="Nome completo" autoFocus />
              </Field>

              {/* Seleção de Sexo */}
              <Field label="Sexo">
                <div className="grid grid-cols-2 gap-2">
                  {(['masculino', 'feminino'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        const newWeights = CATEGORIAS_PESO[s][editing.classe_idade];
                        setEditing({ ...editing, sexo: s, categoria_peso: newWeights[0] });
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border capitalize transition-colors ${
                        editing.sexo === s ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
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
                    value={editing.classe_idade} 
                    onChange={(e) => {
                      const newClasse = e.target.value as ClasseIdade;
                      const newWeights = CATEGORIAS_PESO[editing.sexo][newClasse];
                      setEditing({ ...editing, classe_idade: newClasse, categoria_peso: newWeights[0] });
                    }}
                  >
                    {CLASSES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>

                <Field label="Categoria de peso">
                  <select 
                    className={inputCls} 
                    value={editing.categoria_peso} 
                    onChange={(e) => setEditing({ ...editing, categoria_peso: e.target.value })}
                  >
                    {availableWeights.map((peso) => (
                      <option key={peso} value={peso}>{peso}</option>
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
                      onClick={() => setEditing({ ...editing, tipo_origem: t })}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border ${
                        editing.tipo_origem === t ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <OriginIcon tipo={t} className="w-4 h-4" /> {t === 'clube' ? 'Clube (nacional)' : 'País (internacional)'}
                    </button>
                  ))}
                </div>
                <input
                  className={inputCls}
                  value={editing.origem_valor}
                  onChange={(e) => setEditing({ ...editing, origem_valor: e.target.value })}
                  placeholder={editing.tipo_origem === 'pais' ? 'Ex.: França, Japão...' : 'Ex.: Flamengo, Pinheiros...'}
                />
              </Field>
              {formError && <p className="text-xs text-red-300">{formError}</p>}
            </div>
            <div className="px-5 py-4 border-t border-slate-800 flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editing.id ? 'Salvar alterações' : 'Cadastrar adversário'}
              </button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}

const Sheet: React.FC<{ onClose: () => void; label: string; children: React.ReactNode }> = ({ onClose, label, children }) => (
  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">{label}</span>
    {children}
  </label>
);

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
    <p className="text-[10px] uppercase font-bold text-slate-500">{label}</p>
    <p className="text-sm font-bold text-white mt-0.5">{value}</p>
  </div>
);