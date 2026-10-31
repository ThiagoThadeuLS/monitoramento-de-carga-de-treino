import React, { useEffect, useState } from 'react';
import {
  UserPlus, Loader2, AlertCircle, CheckCircle2, X, Copy, MessageCircle, ShieldCheck, UserX, UserCheck, KeyRound, Mail,
} from 'lucide-react';
import { TeamMember, addCoach, listTeam, setCoachActive, setCoachRole } from '../../lib/team';
import { ClubCrest, ClubInfo } from '../../lib/club';
import { uploadEscudo } from '../../lib/platform';
import { ImagePlus } from 'lucide-react';

interface TeamManagementProps {
  /** user_id do admin logado (não pode se desativar/rebaixar por engano) */
  currentUserId: string;
  club: ClubInfo;
  /** Escudo trocado: o painel recarrega o clube (cabeçalho) */
  onClubChanged: () => void;
}

interface CreatedCoach {
  nome: string;
  email: string;
  password: string;
}

export const TeamManagement: React.FC<TeamManagementProps> = ({ currentUserId, club, onClubChanged }) => {
  const clubName = club.nome;
  const [uploading, setUploading] = useState(false);

  const changeEscudo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await uploadEscudo(club.id, file);
      showFeedback('Escudo atualizado.');
      onClubChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'treinador'>('treinador');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [created, setCreated] = useState<CreatedCoach | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setTeam(await listTeam());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const showFeedback = (text: string) => {
    setFeedback(text);
    setTimeout(() => setFeedback(''), 4000);
  };

  const openModal = () => {
    setNome('');
    setEmail('');
    setRole('treinador');
    setModalError('');
    setCreated(null);
    setCopied(false);
    setModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return setModalError('Informe o nome do treinador.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setModalError('Informe um e-mail válido.');
    setSaving(true);
    setModalError('');
    try {
      const password = await addCoach(nome.trim(), email.trim(), role);
      setCreated({ nome: nome.trim(), email: email.trim().toLowerCase(), password });
      await load();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const accessMessage = (c: CreatedCoach) =>
    `Olá, ${c.nome.split(' ')[0]}! Seu acesso ao painel de monitoramento do ${clubName} foi criado.\n\n` +
    `Endereço: ${window.location.origin}\nE-mail: ${c.email}\nSenha temporária: ${c.password}\n\n` +
    `No primeiro acesso você vai criar sua própria senha.`;

  const copyAccess = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(accessMessage(created));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setModalError('Não foi possível copiar. Selecione e copie o texto manualmente.');
    }
  };

  const runAction = async (member: TeamMember, action: () => Promise<void>, ok: string) => {
    setBusyId(member.user_id);
    setError('');
    try {
      await action();
      showFeedback(ok);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const toggleRole = (m: TeamMember) => {
    const next = m.role === 'admin' ? 'treinador' : 'admin';
    if (!window.confirm(next === 'admin' ? `Tornar ${m.nome} administrador do clube?` : `Tirar ${m.nome} da administração do clube?`)) return;
    runAction(m, () => setCoachRole(m.user_id, next), next === 'admin' ? `${m.nome} agora é administrador.` : `${m.nome} agora é treinador.`);
  };

  const toggleActive = (m: TeamMember) => {
    if (m.active && !window.confirm(`Desativar ${m.nome}? O acesso ao clube é bloqueado na hora.`)) return;
    runAction(m, () => setCoachActive(m.user_id, !m.active), m.active ? `${m.nome} foi desativado.` : `${m.nome} foi reativado.`);
  };

  const RoleBadge: React.FC<{ m: TeamMember }> = ({ m }) => (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-md border font-bold whitespace-nowrap ${
        m.role === 'admin' ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'
      }`}
    >
      {m.role === 'admin' ? 'Admin' : 'Treinador'}
    </span>
  );

  const StatusBadge: React.FC<{ m: TeamMember }> = ({ m }) =>
    !m.active ? (
      <span className="text-[11px] px-2 py-0.5 rounded-md border bg-red-500/10 text-red-300 border-red-500/30 font-bold whitespace-nowrap">Desativado</span>
    ) : m.must_change_password ? (
      <span className="text-[11px] px-2 py-0.5 rounded-md border bg-amber-500/10 text-amber-300 border-amber-500/30 font-bold whitespace-nowrap">Aguardando 1º acesso</span>
    ) : (
      <span className="text-[11px] px-2 py-0.5 rounded-md border bg-emerald-500/10 text-emerald-300 border-emerald-500/30 font-bold whitespace-nowrap">Ativo</span>
    );

  const actions = (m: TeamMember) => {
    const self = m.user_id === currentUserId;
    const busy = busyId === m.user_id;
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => toggleRole(m)}
          disabled={busy || self || !m.active}
          title={self ? 'Você não pode mudar o próprio papel' : undefined}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          {m.role === 'admin' ? 'Tirar admin' : 'Tornar admin'}
        </button>
        <button
          type="button"
          onClick={() => toggleActive(m)}
          disabled={busy || self}
          title={self ? 'Você não pode desativar a própria conta' : undefined}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed ${
            m.active
              ? 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30'
              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
          }`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : m.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          {m.active ? 'Desativar' : 'Reativar'}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="relative group cursor-pointer flex-shrink-0 self-start" title="Trocar escudo do clube">
          <ClubCrest club={club} className="w-12 h-14" />
          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center group-hover:bg-sky-500 group-hover:text-slate-950 text-slate-200">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              changeEscudo(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Equipe do {clubName}</p>
          <p className="text-xs text-slate-400">
            Cadastre os treinadores do clube. Cada um recebe uma senha temporária e cria a própria senha no primeiro acesso.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Cadastrar treinador
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl border bg-emerald-950/60 border-emerald-600 text-emerald-300 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {feedback}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <p className="text-sm">Carregando equipe...</p>
        </div>
      ) : (
        <>
          {/* Celular: cartões */}
          <ul className="sm:hidden space-y-3">
            {team.map((m) => (
              <li key={m.user_id} className={`bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 ${m.active ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">
                      {m.nome} {m.user_id === currentUserId && <span className="text-xs font-normal text-slate-500">(você)</span>}
                    </p>
                    <p className="text-xs text-slate-400 truncate flex items-center gap-1"><Mail className="w-3 h-3" />{m.email}</p>
                  </div>
                  <RoleBadge m={m} />
                </div>
                <StatusBadge m={m} />
                <div className="pt-2 border-t border-slate-800">{actions(m)}</div>
              </li>
            ))}
          </ul>

          {/* Desktop: tabela */}
          <div className="hidden sm:block bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Treinador</th>
                  <th className="py-3.5 px-3">Papel</th>
                  <th className="py-3.5 px-3">Situação</th>
                  <th className="py-3.5 px-4">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {team.map((m) => (
                  <tr key={m.user_id} className={`hover:bg-slate-800/40 ${m.active ? '' : 'opacity-70'}`}>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-white">
                        {m.nome} {m.user_id === currentUserId && <span className="text-xs font-normal text-slate-500">(você)</span>}
                      </p>
                      <p className="text-xs text-slate-400">{m.email}</p>
                    </td>
                    <td className="py-3.5 px-3"><RoleBadge m={m} /></td>
                    <td className="py-3.5 px-3"><StatusBadge m={m} /></td>
                    <td className="py-3.5 px-4">{actions(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal: cadastrar treinador / senha temporária */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{created ? 'Acesso criado' : 'Cadastrar treinador'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>

            {created ? (
              <div className="p-5 sm:p-6 space-y-4">
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700 text-emerald-300 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> {created.nome} foi cadastrado no {clubName}.
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-sm">
                  <p className="text-slate-400">E-mail: <span className="text-white font-semibold">{created.email}</span></p>
                  <p className="text-slate-400 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-300" /> Senha temporária:
                    <span className="font-mono text-lg text-amber-200 tracking-wider select-all">{created.password}</span>
                  </p>
                </div>
                <p className="text-xs text-amber-300/90">
                  ⚠️ Esta senha aparece só agora. Envie para {created.nome.split(' ')[0]} antes de fechar. No primeiro acesso será criada uma senha própria.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={copyAccess}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold"
                  >
                    <Copy className="w-4 h-4" /> {copied ? 'Copiado!' : 'Copiar acesso'}
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(accessMessage(created))}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"
                  >
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </a>
                </div>
                {modalError && <p className="text-xs text-red-300">{modalError}</p>}
                <button type="button" onClick={() => setModalOpen(false)} className="w-full px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold">
                  Já enviei, fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="p-5 sm:p-6 space-y-4">
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Nome completo *</span>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="ex: Carla Souza"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">E-mail *</span>
                  <input
                    type="email"
                    autoCapitalize="none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ex: carla@seuclube.com.br"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <span className="text-[11px] text-slate-500">Será o login de acesso.</span>
                </label>
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Papel</span>
                  <div className="grid grid-cols-2 gap-2">
                    {([['treinador', 'Treinador', 'Usa todo o app'], ['admin', 'Admin', 'Também gerencia a equipe']] as const).map(([v, label, desc]) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={role === v}
                        onClick={() => setRole(v)}
                        className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${
                          role === v ? 'bg-sky-500/15 border-sky-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <span className="block text-sm font-bold">{label}</span>
                        <span className="block text-[11px]">{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {modalError && (
                  <div className="p-3 rounded-xl bg-red-950/60 border border-red-700 flex items-center gap-2.5 text-xs text-red-300">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                    <span>{modalError}</span>
                  </div>
                )}
                <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
                  <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Cadastrar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
