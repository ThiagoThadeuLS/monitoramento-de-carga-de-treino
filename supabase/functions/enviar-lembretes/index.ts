// Supabase Edge Function: envia os lembretes de PSE, PSR e peso por notificação push.
// Chamada pelo agendamento (pg_cron) a cada 5 minutos. Quem está "vencido" é decidido
// no banco (public.push_due_reminders); aqui só enviamos e registramos o envio.
//
// Segredos necessários (Edge Functions -> Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:contato@seudominio.com)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// Confere os segredos e explica o problema em vez de derrubar a função
function configureVapid(): string | null {
  const clean = (v: string | undefined) => (v ?? '').trim().replace(/^["']|["']$/g, '');
  const pub = clean(Deno.env.get('VAPID_PUBLIC_KEY'));
  const priv = clean(Deno.env.get('VAPID_PRIVATE_KEY'));
  let subject = clean(Deno.env.get('VAPID_SUBJECT')) || 'mailto:suporte@monitoramento.app';
  if (!pub) return 'Segredo VAPID_PUBLIC_KEY não encontrado (Edge Functions -> Secrets).';
  if (!priv) return 'Segredo VAPID_PRIVATE_KEY não encontrado (Edge Functions -> Secrets).';
  if (!/^(mailto:|https:\/\/)/.test(subject)) subject = subject.includes('@') ? `mailto:${subject}` : subject;
  try {
    webpush.setVapidDetails(subject, pub, priv);
    return null;
  } catch (err) {
    return `Segredos VAPID inválidos: ${(err as Error).message}`;
  }
}
const vapidError = configureVapid();

interface Due {
  athlete_id: string;
  kind: 'pse' | 'psr' | 'peso';
  ref: string;
  title: string;
  body: string;
  url: string;
}

interface Subscription {
  id: string;
  athlete_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failures: number;
}

/** Falhas seguidas (sem ser "expirado") até marcar o aparelho como expirado e pedir para ativar de novo */
const MAX_FAILURES = 5;

Deno.serve(async () => {
  if (vapidError) return Response.json({ ok: false, step: 'segredos', error: vapidError }, { status: 500 });
  const { data: due, error } = await supabase.rpc('push_due_reminders');
  if (error) return Response.json({ ok: false, step: 'push_due_reminders', error: error.message }, { status: 500 });
  const items = (due ?? []) as Due[];
  if (items.length === 0) return Response.json({ ok: true, due: 0, sent: 0 });

  const athleteIds = [...new Set(items.map((d) => d.athlete_id))];
  // Em grupos de 100 ids: uma lista enorme no endereço da consulta faria ela falhar
  const subs: Subscription[] = [];
  for (let i = 0; i < athleteIds.length; i += 100) {
    const { data: subsData, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('id, athlete_id, endpoint, p256dh, auth, failures')
      .is('expired_at', null)
      .in('athlete_id', athleteIds.slice(i, i + 100));
    if (subsError) return Response.json({ ok: false, step: 'push_subscriptions', error: subsError.message }, { status: 500 });
    subs.push(...((subsData ?? []) as Subscription[]));
  }

  let sent = 0;
  let failed = 0;
  let expiredCount = 0;
  const okIds = new Set<string>();
  // Resultado de cada aparelho (gravado no fim): o treinador vê quem não está recebendo e por quê
  const results: { id: string; expire: boolean; failures: number; error: string }[] = [];

  // Envia um lembrete para todos os aparelhos do atleta
  async function sendItem(item: Due) {
    const targets = subs.filter((s) => s.athlete_id === item.athlete_id);
    const payload = JSON.stringify({
      title: item.title,
      body: item.body,
      url: item.url,
      tag: `${item.kind}-${item.ref}`, // o aviso repetido substitui o anterior em vez de acumular
    });

    await Promise.all(
      targets.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60, urgency: 'high' },
          );
          okIds.add(s.id);
          sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          const failures = (s.failures ?? 0) + 1;
          // 404/410: assinatura expirada ou cancelada. Muitas falhas seguidas (ex.: chave VAPID trocada) também.
          const expire = status === 404 || status === 410 || failures >= MAX_FAILURES;
          if (expire) expiredCount++;
          results.push({ id: s.id, expire, failures, error: `${status ?? 'sem status'}: ${(err as Error).message}`.slice(0, 300) });
          failed++;
          console.error('push falhou', status, (err as Error).message);
        }
      }),
    );

    // Registra o envio (controla a repetição de 30 em 30 min), mesmo se nenhum aparelho aceitou,
    // para não tentar de novo a cada 5 minutos.
    await supabase.rpc('push_mark_sent', { p_athlete: item.athlete_id, p_kind: item.kind, p_ref: item.ref });
  }

  // Vários atletas ao mesmo tempo (em lotes, para não sobrecarregar), em vez de um por vez
  const BATCH = 20;
  for (let i = 0; i < items.length; i += BATCH) {
    await Promise.all(items.slice(i, i + BATCH).map(sendItem));
  }

  const now = new Date().toISOString();
  // Aparelhos que aceitaram: zera as falhas (em grupos de 100 ids)
  const ok = [...okIds];
  for (let i = 0; i < ok.length; i += 100) {
    await supabase
      .from('push_subscriptions')
      .update({ last_sent_at: now, failures: 0, last_error: null })
      .in('id', ok.slice(i, i + 100));
  }
  // Falhas: guarda o erro; expirados ficam marcados (não são apagados) e o app pede para ativar de novo
  await Promise.all(
    results
      .filter((r) => !okIds.has(r.id))
      .map((r) =>
        supabase
          .from('push_subscriptions')
          .update({
            failures: r.failures,
            last_error: r.error,
            last_error_at: now,
            ...(r.expire ? { expired_at: now } : {}),
          })
          .eq('id', r.id),
      ),
  );

  return Response.json({ ok: true, due: items.length, sent, failed, expired: expiredCount });
});
