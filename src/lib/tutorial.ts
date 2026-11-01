import { supabase } from './supabase';

// Primeiro acesso: o banco guarda quem já fez o tutorial (vale em qualquer aparelho).
// Se o banco ainda não tiver essa função, usa este aparelho como referência.
const localKey = (id: string) => `tutorial_visto_${id}`;
const localSeen = (id: string) => {
  try {
    return localStorage.getItem(localKey(id)) === '1';
  } catch {
    return false;
  }
};
const markLocal = (id: string) => {
  try {
    localStorage.setItem(localKey(id), '1');
  } catch {
    /* sem armazenamento */
  }
};

export async function athleteTutorialPending(token: string, athleteId: string): Promise<boolean> {
  if (localSeen(athleteId)) return false;
  if (!supabase) return true;
  const { data, error } = await supabase.rpc('athlete_tutorial_pending', { p_token: token });
  if (error) return true;
  if (!data) markLocal(athleteId);
  return !!data;
}

export async function markAthleteTutorialDone(token: string, athleteId: string) {
  markLocal(athleteId);
  await supabase?.rpc('athlete_tutorial_done', { p_token: token });
}

export async function coachTutorialPending(userId: string): Promise<boolean> {
  if (localSeen(userId)) return false;
  if (!supabase) return true;
  const { data, error } = await supabase.rpc('coach_tutorial_pending');
  if (error) return true;
  if (!data) markLocal(userId);
  return !!data;
}

export async function markCoachTutorialDone(userId: string) {
  markLocal(userId);
  await supabase?.rpc('coach_tutorial_done');
}
