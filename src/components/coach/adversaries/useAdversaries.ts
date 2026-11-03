import { useCallback, useEffect, useState } from 'react';
import { deleteById, supabase } from '../../../lib/supabase';
import {
  addAthleteObservation,
  deleteAthleteAdversary,
  deleteAthleteObservation,
  listAthleteAdversaries,
  saveAthleteAdversary,
  setAthleteAdversaryHidden,
} from '../../../lib/athleteAuth';
import { Adversario, Draft, Observacao, groupObservacoes } from './types';

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

  const reload = useCallback(async () => {
    if (!supabase) return setLoading(false);
    const db = supabase;
    setLoading(true);
    setLoadError('');

    // Atleta: o banco já devolve só o que ele pode ver
    if (athleteToken) {
      try {
        const d = await listAthleteAdversaries<Adversario, Observacao>(athleteToken);
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

    // Treinador (Supabase Auth)
    const {
      data: { session },
    } = await db.auth.getSession();
    const userId = session?.user.id ?? null;
    let clubId: string | null = null;
    if (userId) {
      const { data: coachData } = await db.from('coaches').select('club_id').eq('user_id', userId).maybeSingle();
      clubId = coachData?.club_id ?? null;
    }
    setIsCoach(Boolean(clubId));
    setUserClubId(clubId);
    setCurrentUserId(userId);

    // Clube em uso: o do treinador ou, no modo suporte, o clube visitado.
    // O banco já só devolve as fichas desse clube; o filtro aqui é uma segunda trava.
    const { data: clubAtual } = await db.rpc('current_club_id');
    if (!clubAtual) {
      setAdversarios([]);
      setObservacoes({});
      setLoading(false);
      return;
    }

    const { data, error } = await db.from('adversarios').select('*').eq('club_id', clubAtual as string).order('nome');
    if (error) {
      setLoadError('Não foi possível carregar os adversários.');
      setLoading(false);
      return;
    }
    const advs = (data ?? []) as Adversario[];
    setAdversarios(advs);
    if (userId) {
      const { data: hid } = await db.from('adversario_ocultos').select('adversario_id').eq('coach_id', userId);
      setOcultos(new Set(((hid ?? []) as { adversario_id: string }[]).map((h) => h.adversario_id)));
    }
    // Treinador vê todas as observações das fichas do clube (inclusive as dos atletas)
    if (advs.length > 0) {
      const { data: obs, error: obsError } = await db
        .from('adversario_observacoes')
        .select('*')
        .in('adversario_id', advs.map((a) => a.id))
        .order('created_at', { ascending: false });
      if (!obsError && obs) setObservacoes(groupObservacoes(obs as Observacao[]));
    } else {
      setObservacoes({});
    }
    setLoading(false);
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
    deleteObservation,
    setHidden,
  };
}
