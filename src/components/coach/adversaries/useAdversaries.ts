import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteById, supabase } from '../../../lib/supabase';
import {
  addAthleteObservation,
  deleteAthleteAdversary,
  deleteAthleteObservation,
  updateAthleteObservation,
  listAthleteAdversaries,
  saveAthleteAdversary,
  setAthleteAdversaryHidden,
} from '../../../lib/athleteAuth';
import { Adversario, Draft, Observacao, groupObservacoes } from './types';

/** Todas as observações que o treinador pode ver (em páginas de 1000). */
async function fetchAllObservations(): Promise<Observacao[]> {
  const rows: Observacao[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase!
      .from('adversario_observacoes')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as Observacao[]));
    if (!data || data.length < 1000) return rows;
  }
}

/**
 * Dados da tela de adversários.
 * Treinador: usa as tabelas direto (regras por clube no banco).
 * Atleta (athleteToken): não tem login do Supabase; tudo passa pelas funções athlete_* do banco.
 * As ações lançam Error com a mensagem para mostrar na tela.
 */
export function useAdversaries(athleteToken?: string) {
  const [adversarios, setAdversarios] = useState<Adversario[]>([]);
  const [observacoes, setObservacoes] = useState<Record<string, Observacao[]>>({});
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userClubId, setUserClubId] = useState<string | null>(null);
  const [isCoach, setIsCoach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Só a busca mais recente atualiza a tela (as ações também chamam reload)
  const reqRef = useRef(0);

  const reload = useCallback(async () => {
    if (!supabase) return setLoading(false);
    const db = supabase;
    const req = ++reqRef.current;
    setLoading(true);
    setLoadError('');

    // Atleta: o banco já devolve só o que ele pode ver
    if (athleteToken) {
      try {
        const d = await listAthleteAdversaries<Adversario, Observacao>(athleteToken);
        if (req !== reqRef.current) return;
        setIsCoach(false);
        setCurrentUserId(d.me);
        setAdversarios(d.adversarios);
        setOcultos(new Set(d.adversarios.filter((a) => a.oculto).map((a) => a.id)));
        setObservacoes(groupObservacoes(d.observacoes));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Não foi possível carregar os adversários.');
      }
      setLoading(false);
      return;
    }

    // Treinador (Supabase Auth). O banco já só devolve as fichas e observações do clube
    // em uso (o do treinador ou, no modo suporte, o visitado): nada de lista de ids na consulta.
    try {
      const {
        data: { session },
      } = await db.auth.getSession();
      const userId = session?.user.id ?? null;
      const [coachRes, clubRes] = await Promise.all([
        userId ? db.from('coaches').select('club_id').eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
        db.rpc('current_club_id'),
      ]);
      if (req !== reqRef.current) return;
      const clubId = (coachRes.data as { club_id?: string } | null)?.club_id ?? null;
      setIsCoach(Boolean(clubId));
      setUserClubId(clubId);
      setCurrentUserId(userId);

      if (!clubRes.data) {
        setAdversarios([]);
        setObservacoes({});
        setLoading(false);
        return;
      }

      const [advRes, hidRes, obs] = await Promise.all([
        db.from('adversarios').select('*').eq('club_id', clubRes.data as string).order('nome'),
        userId ? db.from('adversario_ocultos').select('adversario_id').eq('coach_id', userId) : Promise.resolve({ data: [] }),
        fetchAllObservations(),
      ]);
      if (req !== reqRef.current) return;
      if (advRes.error) throw advRes.error;
      setAdversarios((advRes.data ?? []) as Adversario[]);
      setOcultos(new Set(((hidRes.data ?? []) as { adversario_id: string }[]).map((h) => h.adversario_id)));
      setObservacoes(groupObservacoes(obs));
    } catch {
      if (req === reqRef.current) setLoadError('Não foi possível carregar os adversários.');
    }
    if (req === reqRef.current) setLoading(false);
  }, [athleteToken]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Quem pode alterar a ficha: quem cadastrou; fichas antigas (sem autor) ficam com a comissão técnica */
  const canEdit = (a: Adversario) => !!currentUserId && (a.criado_por_id === currentUserId || (isCoach && !a.criado_por_id));

  async function save(draft: Draft) {
    if (!supabase) throw new Error('Supabase não configurado.');
    const fields = {
      nome: draft.nome.trim(),
      sexo: draft.sexo,
      categoria_peso: draft.categoria_peso.trim(),
      classe_idade: draft.classe_idade,
      tipo_origem: draft.tipo_origem,
      origem_valor: draft.origem_valor.trim(),
    };

    // Atleta: o banco grava no clube dele e em nome dele
    if (athleteToken) {
      await saveAthleteAdversary(athleteToken, { id: draft.id, ...fields });
      await reload();
      return;
    }

    // Treinador: sempre no clube dele (nunca no clube de outra ficha da lista)
    if (!userClubId || !currentUserId) throw new Error('Usuário ou clube não identificado. Entre de novo.');
    const payload = {
      club_id: userClubId,
      ...fields,
      ...(draft.id ? {} : { criado_por_id: currentUserId, criado_por_tipo: 'tecnico' }),
    };
    const { error } = draft.id
      ? await supabase.from('adversarios').update(payload).eq('id', draft.id)
      : await supabase.from('adversarios').insert([payload]);
    if (error) {
      if (error.code === '23505' || /conflict|duplicate/.test(error.message ?? '')) {
        throw new Error('Já existe um adversário cadastrado com este nome.');
      }
      throw new Error(`Não foi possível salvar: ${error.message}`);
    }
    await reload();
  }

  async function remove(a: Adversario) {
    if (athleteToken) await deleteAthleteAdversary(athleteToken, a.id);
    else await deleteById('adversarios', a.id);
    await reload();
  }

  async function addObservation(adversarioId: string, texto: string) {
    if (!supabase) throw new Error('Supabase não configurado.');
    if (!currentUserId) throw new Error('Sessão expirada. Entre novamente.');
    if (athleteToken) {
      await addAthleteObservation(athleteToken, adversarioId, texto);
    } else {
      const { error } = await supabase
        .from('adversario_observacoes')
        .insert([{ adversario_id: adversarioId, autor_id: currentUserId, autor_tipo: 'tecnico', texto }]);
      if (error) throw new Error(`Erro ao adicionar observação: ${error.message}`);
    }
    await reload();
  }

  /** O autor corrige o texto de uma observação já enviada */
  async function updateObservation(obsId: string, texto: string) {
    if (!supabase) throw new Error('Supabase não configurado.');
    if (athleteToken) {
      await updateAthleteObservation(athleteToken, obsId, texto);
    } else {
      const { data, error } = await supabase
        .from('adversario_observacoes')
        .update({ texto, editado_em: new Date().toISOString() })
        .eq('id', obsId)
        .select('id');
      if (error) throw new Error(`Erro ao editar observação: ${error.message}`);
      // Com RLS, edição bloqueada não dá erro: só não altera nada
      if (!data?.length) throw new Error('Não foi possível editar (você só pode editar as suas próprias anotações).');
    }
    await reload();
  }

  async function deleteObservation(obsId: string) {
    if (athleteToken) {
      await deleteAthleteObservation(athleteToken, obsId);
    } else {
      try {
        await deleteById('adversario_observacoes', obsId);
      } catch {
        throw new Error('Não foi possível excluir a observação (você só pode apagar as suas próprias anotações).');
      }
    }
    await reload();
  }

  /** "Apagar para mim": some só da lista de quem apagou; os outros continuam vendo */
  async function setHidden(a: Adversario, hide: boolean) {
    if (!supabase) throw new Error('Supabase não configurado.');
    if (athleteToken) {
      await setAthleteAdversaryHidden(athleteToken, a.id, hide);
    } else {
      const { error } = await supabase.rpc('coach_set_adversario_oculto', { p_id: a.id, p_oculto: hide });
      if (error) throw new Error(hide ? 'Não foi possível apagar para você.' : 'Não foi possível mostrar de novo.');
    }
    const next = new Set(ocultos);
    if (hide) next.add(a.id);
    else next.delete(a.id);
    setOcultos(next);
    return next;
  }

  return {
    adversarios,
    observacoes,
    ocultos,
    currentUserId,
    loading,
    loadError,
    canEdit,
    save,
    remove,
    addObservation,
    updateObservation,
    deleteObservation,
    setHidden,
  };
}
