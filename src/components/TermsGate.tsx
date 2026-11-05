import React, { useState } from 'react';
import { ShieldCheck, Loader2, LogOut, X } from 'lucide-react';
import { acceptTerms } from '../lib/athleteAuth';
import { brDateOfStamp } from '../lib/date';

/** Versão do termo: ao mudar o texto, troque a versão e todos aceitam de novo. */
// Mudar a versão faz cada atleta aceitar de novo (2026-11-04: inclui a foto de perfil)
export const TERMS_VERSION = '2026-11-04';

/** Texto do termo de consentimento para uso dos dados (LGPD). */
export const TermsText: React.FC<{ clubName: string }> = ({ clubName }) => {
  const H: React.FC<{ children: React.ReactNode }> = ({ children }) => <h3 className="text-sm font-bold text-white mt-3 first:mt-0">{children}</h3>;
  return (
    <div className="text-sm text-slate-300 leading-relaxed space-y-1.5">
      <H>1. Quem trata seus dados</H>
      <p>
        O <strong className="text-white">{clubName}</strong> (controlador) usa esta plataforma de monitoramento de carga de treino (operadora) para acompanhar
        seus treinos.
      </p>
      <H>2. Quais dados</H>
      <p>
        Nome, CPF, celular, sexo, classe e categoria; <strong className="text-white">foto de perfil</strong> (opcional, enviada por você ou pela
        comissão técnica); suas respostas de <strong className="text-white">PSE</strong> (esforço, duração e observações),{' '}
        <strong className="text-white">PSR</strong> (recuperação, fadiga, sono, dor muscular, estresse e humor), <strong className="text-white">peso</strong>,
        motivos de ausência e dados técnicos do aparelho para enviar notificações.
      </p>
      <p>
        PSE, PSR, dor e peso são <strong className="text-white">dados de saúde</strong> (dados sensíveis, art. 11 da LGPD) e são tratados com base no seu
        consentimento.
      </p>
      <H>3. Para quê</H>
      <p>Acompanhar sua carga de treino e recuperação, planejar os treinos, prevenir lesões e enviar lembretes para responder os questionários.</p>
      <H>4. Quem acessa</H>
      <p>
        Só a comissão técnica do seu clube. Os administradores da plataforma só veem os dados em modo de suporte, sem poder alterá-los, por tempo limitado e
        com registro. Seus dados <strong className="text-white">não são vendidos nem compartilhados</strong> com terceiros.
      </p>
      <H>5. Onde e por quanto tempo</H>
      <p>Em servidores na nuvem com conexão criptografada, enquanto você estiver vinculado ao clube ou até pedir a exclusão.</p>
      <H>6. Seus direitos</H>
      <p>
        Você pode ver suas respostas na aba <strong className="text-white">Histórico</strong>, corrigir as do dia e pedir à comissão técnica a correção, a
        exclusão dos seus dados ou a revogação deste consentimento a qualquer momento. Sem o consentimento não é possível usar o app.
      </p>
      <H>7. Menores de 18 anos</H>
      <p>Se você tem menos de 18 anos, seu responsável legal deve ler e concordar com este termo.</p>
      <p className="text-xs text-slate-500 pt-2">Versão {TERMS_VERSION}.</p>
    </div>
  );
};

/** Primeiro acesso do atleta: aceitar o termo antes de usar o app. */
export const TermsGate: React.FC<{ token: string; clubName: string; onAccepted: () => void; onLogout: () => void }> = ({
  token,
  clubName,
  onAccepted,
  onLogout,
}) => {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      await acceptTerms(token, TERMS_VERSION);
      onAccepted();
    } catch (err: any) {
      setError(err.message ?? 'Não foi possível registrar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-6 h-6 text-sky-300" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-black text-white">Uso dos seus dados</h2>
            <p className="text-sm text-slate-400">Leia e aceite para começar a usar o app. Você só faz isso uma vez.</p>
          </div>
        </div>
        <div className="p-5 sm:p-6 max-h-[50vh] overflow-y-auto bg-slate-950/40">
          <TermsText clubName={clubName} />
        </div>
        <div className="p-5 sm:p-6 border-t border-slate-800 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 w-5 h-5 accent-sky-500 flex-shrink-0" />
            <span className="text-sm text-slate-200">
              Li e concordo com o uso dos meus dados, inclusive dados de saúde, para as finalidades acima (se menor de 18 anos, com a ciência e concordância do
              meu responsável legal).
            </span>
          </label>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button
            type="button"
            onClick={accept}
            disabled={!agree || busy}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />} Aceitar e continuar
          </button>
          <button type="button" onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white">
            <LogOut className="w-3.5 h-3.5" /> Não aceito — sair
          </button>
        </div>
      </div>
    </div>
  );
};

/** Termo para reler a qualquer momento. */
export const TermsModal: React.FC<{ clubName: string; acceptedAt?: string | null; onClose: () => void }> = ({ clubName, acceptedAt, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Termo de uso dos dados"
      className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-xl max-h-[88vh] flex flex-col shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-sky-300" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-white">Termo de uso dos dados</h2>
          {acceptedAt && <p className="text-xs text-slate-400">Aceito em {brDateOfStamp(acceptedAt)}</p>}
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white" title="Fechar">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-5 overflow-y-auto">
        <TermsText clubName={clubName} />
      </div>
    </div>
  </div>
);
