// Supabase Edge Function: foto do próprio atleta.
// O atleta não usa o Supabase Auth, então o Storage não sabe quem ele é. Esta função
// confere a sessão do app (token) no banco e só então grava a foto na pasta dele,
// com a chave do servidor. Nenhuma regra do Storage aceita envio sem login.
//
// Pedido: POST com a imagem no corpo (já reduzida no navegador) e o cabeçalho
// x-athlete-token. Resposta: { url } ou { erro } (códigos traduzidos em athleteAuth.ts).
//
// Publicar (uma vez, e de novo quando este arquivo mudar), sem exigir login do Supabase:
//   npx supabase functions deploy foto-atleta --no-verify-jwt
// (ou pelo painel: Edge Functions -> Deploy a new function -> nome "foto-atleta",
//  colar este arquivo e desligar "Verify JWT"). SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
// já existem automaticamente.
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const BUCKET = 'fotos';
/** Mesmo limite do bucket (a foto chega com ~30–80 KB) */
const MAX_BYTES = 1024 * 1024;

// O app chama direto do navegador; o token do atleta é a proteção (não há cookie)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-athlete-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

/** Tipo pelo conteúdo do arquivo (não pelo que o navegador diz) */
function imageType(b: Uint8Array): { type: string; ext: string } | null {
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { type: 'image/webp', ext: 'webp' };
  }
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image/png', ext: 'png' };
  return null;
}

interface SessionJson {
  must_change_password?: boolean;
  athlete?: { id?: string };
  club?: { id?: string } | null;
  terms?: { accepted_at?: string | null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ erro: 'metodo_invalido' }, 405);

  const token = (req.headers.get('x-athlete-token') ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return reply({ erro: 'sessao_invalida' }, 401);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return reply({ erro: 'foto_grande' }, 413);

  // Quem é o atleta: a mesma conferência que o app faz ao abrir (sessão válida, atleta e clube ativos)
  const { data, error } = await supabase.rpc('athlete_get_session', { p_token: token });
  if (error) return reply({ erro: 'falha_servidor', detalhe: error.message }, 500);
  const session = data as SessionJson | null;
  const athleteId = session?.athlete?.id;
  const clubId = session?.club?.id;
  if (!athleteId || !clubId) return reply({ erro: 'sessao_invalida' }, 401);
  if (session?.must_change_password) return reply({ erro: 'troca_de_senha_pendente' }, 403);
  if (!session?.terms?.accepted_at) return reply({ erro: 'termo_pendente' }, 403);

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0) return reply({ erro: 'foto_invalida' }, 400);
  if (bytes.length > MAX_BYTES) return reply({ erro: 'foto_grande' }, 413);
  const kind = imageType(bytes);
  if (!kind) return reply({ erro: 'foto_invalida' }, 415);

  // Nome novo a cada troca: o navegador e o CDN nunca mostram a foto antiga
  const folder = `${clubId}/atletas/${athleteId}`;
  const stamp = Date.now();
  const path = `${folder}/${stamp}.${kind.ext}`;
  const { error: upError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: kind.type, cacheControl: '31536000', upsert: false });
  if (upError) return reply({ erro: 'falha_servidor', detalhe: upError.message }, 500);

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: dbError } = await supabase.from('athletes').update({ photo_url: url }).eq('id', athleteId);
  if (dbError) {
    await supabase.storage.from(BUCKET).remove([path]);
    return reply({ erro: 'falha_servidor', detalhe: dbError.message }, 500);
  }

  // Fica só a foto nova na pasta (sai a anterior, inclusive a enviada pela comissão).
  // Arquivo com número maior é de um envio que terminou depois deste: fica.
  const { data: files } = await supabase.storage.from(BUCKET).list(folder, { limit: 100 });
  const old = (files ?? [])
    .filter((f) => f.name !== `${stamp}.${kind.ext}` && !(Number(f.name.split('.')[0]) > stamp))
    .map((f) => `${folder}/${f.name}`);
  if (old.length) await supabase.storage.from(BUCKET).remove(old);

  return reply({ url });
});
