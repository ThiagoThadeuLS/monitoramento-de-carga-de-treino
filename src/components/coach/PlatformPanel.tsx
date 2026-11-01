import React, { useEffect, useState } from 'react';
import {
  Send, Copy, MessageCircle, Loader2, AlertCircle, CheckCircle2, Ban, PlayCircle, Eye, X, History, Building2, Users, User,
} from 'lucide-react';
import { ClubCrest } from '../../lib/club';
import {
  AccessLogEntry, ClubInvite, PlatformClub, cancelClubInvite, clubInviteLink, createClubInvite, enterSupport,
  listAccessLog, listClubInvites, listClubs, setClubStatus,
} from '../../lib/platform';

interface PlatformPanelProps {
  /** Depois de entrar em modo suporte, o painel do treinador recarrega o perfil */
  onSupportChanged: () => void;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

const ACTION_LABEL: Record<AccessLogEntry['action'], string> = {
  convidou: 'Convidou clube',
  suspendeu: 'Suspendeu clube',
  reativou: 'Reativou clube',
  entrou_suporte: 'Entrou em modo suporte',
  saiu_suporte: 'Saiu do modo suporte',
};

const INVITE_BADGE: Record<ClubInvite['status'], string> = {
  pendente: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  usado: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  expirado: 'bg-slate-800 text-slate-400 border-slate-700',
  cancelado: 'bg-slate-800 text-slate-400 border-slate-700',
};

/** Painel dos donos da plataforma: convites de clube, clubes, modo suporte e registro. */
export const PlatformPanel: React.FC<PlatformPanelProps> = ({ onSupportChanged }) => {
  const [clubs, setClubs] = useState<PlatformClub[]>([]);
  const [invites, setInvites] = useState<ClubInvite[]>([]);
  const [log, setLog] = useState<AccessLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [c, i, l] = await Promise.all([listClubs(), listClubInvites(), listAccessLog()]);
      setClubs(c);
      setInvites(i);
      setLog(l);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (text: string) => {
    setFeedback(text);
    setTimeout(() => setFeedback(''), 4000);
  };

  const run = async (key: string, action: () => Promise<void>, ok?: string) => {
    setBusy(key);
    setError('');
    try {
      await action();
      if (ok) flash(ok);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) return setError('Informe um e-mail válido.');
    await run('invite', async () => {
      const { token } = await createClubInvite(target);
      setLink({ email: target, url: clubInviteLink(token) });
      setCopied(false);
      setEmail('');
    });
  };

  const inviteMessage = (url: string) =>
    `Olá! Este é o seu convite para cadastrar o clube na plataforma de monitoramento de carga de treino.\n\n` +
    `Acesse: ${url}\n\nO link vale por 7 dias e só funciona com este e-mail.`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Não foi possível copiar. Selecione e copie o link manualmente.');
    }
  };

  const toggleStatus = (c: PlatformClub) => {
    const next = c.status === 'ativo' ? 'suspenso' : 'ativo';
    if (next === 'suspenso' && !window.confirm(`Suspender ${c.nome}? Treinadores e atletas do clube perdem o acesso (os dados ficam guardados).`)) return;
    run(`status-${c.id}`, () => setClubStatus(c.id, next), next === 'suspenso' ? `${c.nome} foi suspenso.` : `${c.nome} foi reativado.`);
  };

  const support = (c: PlatformClub) => {
    if (!window.confirm(`Entrar em ${c.nome} em modo suporte?\n\nVocê verá os dados do clube somente para leitura, por até 2 horas. O acesso fica registrado.`)) return;
    run(`support-${c.id}`, async () => {
      await enterSupport(c.id);
      onSupportChanged();
    });
  };

  const pending = invites.filter((i) => i.status === 'pendente');
  const others = invites.filter((i) => i.status !== 'pendente').slice(0, 8);

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="p-3 rounded-xl border bg-emerald-950/60 border-emerald-600 text-emerald-300 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {feedback}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" /> <span>{error}</span>
        </div>
      )}

      {/* Convidar clube */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-bold text-white flex items-center gap-2"><Send className="w-4 h-4 text-sky-400" /> Convidar clube novo</h3>
          <p className="text-xs text-slate-400">O link vale 7 dias, é de uso único e só funciona com o e-mail informado.</p>
        </div>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail do responsável pelo clube"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="submit"
            disabled={busy === 'invite'}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm disabled:opacity-50"
          >
            {busy === 'invite' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Gerar convite
          </button>
        </form>

        {link && (
          <div className="p-4 rounded-xl bg-slate-950 border border-sky-700/50 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-slate-300">Convite para <span className="font-bold text-white break-all">{link.email}</span></p>
              <button type="button" onClick={() => setLink(null)} className="text-slate-500 hover:text-white" title="Fechar"><X className="w-4 h-4" /></button>
            </div>
            <p className="font-mono text-[11px] text-sky-300 break-all select-all">{link.url}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => copy(inviteMessage(link.url))} className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold">
                <Copy className="w-4 h-4" /> {copied ? 'Copiado!' : 'Copiar convite'}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(inviteMessage(link.url))}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>
          </div>
        )}

        {(pending.length > 0 || others.length > 0) && (
          <ul className="divide-y divide-slate-800/70 border-t border-slate-800">
            {[...pending, ...others].map((i) => (
              <li key={i.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                <span className="text-slate-200 font-semibold break-all">{i.email}</span>
                <span className={`px-2 py-0.5 rounded-md border font-bold capitalize ${INVITE_BADGE[i.status]}`}>{i.status}</span>
                <span className="text-slate-500">
                  {i.status === 'usado' ? `${i.club_nome ?? 'clube'} • ${fmtDate(i.used_at!)}` : i.status === 'pendente' ? `vale até ${fmtDate(i.expires_at)}` : fmtDate(i.created_at)}
                </span>
                {i.status === 'pendente' && i.token && (
                  <span className="ml-auto flex gap-2">
                    <button type="button" onClick={() => copy(inviteMessage(clubInviteLink(i.token!)))} className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Link
                    </button>
                    <button type="button" disabled={busy === `cancel-${i.id}`} onClick={() => run(`cancel-${i.id}`, () => cancelClubInvite(i.id), 'Convite cancelado.')} className="px-2 py-1 rounded-lg text-red-300 hover:bg-red-500/10 border border-red-500/30 font-bold">
                      Cancelar
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Clubes */}
      <section className="space-y-3">
        <h3 className="font-bold text-white flex items-center gap-2"><Building2 className="w-4 h-4 text-sky-400" /> Clubes ({clubs.length})</h3>
        {loading ? (
          <div className="py-12 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin text-sky-400" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {clubs.map((c) => (
              <article key={c.id} className={`bg-slate-900/90 border rounded-2xl p-4 space-y-3 ${c.status === 'ativo' ? 'border-slate-800' : 'border-red-900/60 opacity-80'}`}>
                <div className="flex items-start gap-3">
                  <ClubCrest club={c} className="w-10 h-11 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white truncate">{c.nome}</p>
                    <p className="text-[11px] text-slate-500 truncate">Desde {fmtDate(c.created_at)} • admin: {c.admins ?? '—'}</p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold ${c.status === 'ativo' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-red-500/10 text-red-300 border-red-500/30'}`}>
                    {c.status === 'ativo' ? 'Ativo' : 'Suspenso'}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {c.treinadores} treinador{c.treinadores === 1 ? '' : 'es'}</span>
                  <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {c.atletas} atleta{c.atletas === 1 ? '' : 's'}</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
                  <button type="button" disabled={busy === `support-${c.id}`} onClick={() => support(c)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-bold disabled:opacity-50">
                    {busy === `support-${c.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Ver dados (suporte)
                  </button>
                  <button type="button" disabled={busy === `status-${c.id}`} onClick={() => toggleStatus(c)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-50 ${c.status === 'ativo' ? 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
                    {c.status === 'ativo' ? <Ban className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />} {c.status === 'ativo' ? 'Suspender' : 'Reativar'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Registro de acessos (LGPD) */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl">
        <button type="button" onClick={() => setShowLog(!showLog)} className="w-full p-4 flex items-center justify-between text-left">
          <span className="font-bold text-white flex items-center gap-2"><History className="w-4 h-4 text-sky-400" /> Registro de ações dos donos</span>
          <span className="text-xs text-slate-400">{showLog ? 'Ocultar' : `Ver (${log.length})`}</span>
        </button>
        {showLog && (
          <ul className="border-t border-slate-800 divide-y divide-slate-800/70 max-h-80 overflow-y-auto">
            {log.length === 0 && <li className="p-4 text-xs text-slate-500">Nenhuma ação registrada.</li>}
            {log.map((l, idx) => (
              <li key={idx} className="px-4 py-2.5 text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-slate-500 whitespace-nowrap">{fmtDateTime(l.at)}</span>
                <span className="text-slate-200 font-semibold">{ACTION_LABEL[l.action] ?? l.action}</span>
                <span className="text-slate-400">{l.club_nome ?? l.detail ?? ''}</span>
                <span className="text-slate-500 ml-auto">{l.owner_email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
