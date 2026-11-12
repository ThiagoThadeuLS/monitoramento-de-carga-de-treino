import { Suspense, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Header } from './components/Header';
import { AthleteArea } from './components/AthleteArea';
import { ClubProvider } from './lib/club';
import { InstallGate } from './components/InstallGate';
import { isMobileDevice, isStandalone } from './lib/push';
import { lazyNamed } from './lib/lazy';

// Áreas que o atleta não usa: baixadas só quando abertas
const CoachArea = lazyNamed(() => import('./components/CoachArea'), (m) => m.CoachArea);
const ClubSignup = lazyNamed(() => import('./components/ClubSignup'), (m) => m.ClubSignup);
const RestrictedArea = lazyNamed(() => import('./components/RestrictedArea'), (m) => m.RestrictedArea);

/** Endereço da Área Restrita dos donos da plataforma (igual ao de RestrictedArea) */
const RESTRICTED_PATH = '/restrito';

const Loading = () => (
  <div className="py-24 flex justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
  </div>
);

// Celular: só o app instalado (no computador, navegador normal)
const MOBILE_BROWSER = isMobileDevice() && !isStandalone();
// Link do e-mail "esqueci minha senha": abre a tela de nova senha do treinador
const PASSWORD_RECOVERY = new URLSearchParams(window.location.search).has('redefinir-senha') || /type=recovery/.test(window.location.hash);

export function App() {
  const [currentView, setCurrentView] = useState<'athlete' | 'coach'>(PASSWORD_RECOVERY ? 'coach' : 'athlete');
  // Link de convite de clube: /?convite-clube=<código>
  const [clubInviteToken, setClubInviteToken] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('convite-clube')
  );

  const leaveInvite = (view: 'athlete' | 'coach') => {
    window.history.replaceState(null, '', window.location.pathname);
    setClubInviteToken(null);
    setCurrentView(view);
  };

  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  // Área Restrita dos donos: endereço próprio, sem o resto do app
  if (path === RESTRICTED_PATH) {
    return (
      <ClubProvider>
        <Suspense fallback={<Loading />}>
          <RestrictedArea />
        </Suspense>
      </ClubProvider>
    );
  }

  // Exceção: o link de convite de clube abre no navegador para criar a conta
  if (MOBILE_BROWSER && !clubInviteToken && !PASSWORD_RECOVERY) return <InstallGate />;

  return (
    <ClubProvider>
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Header currentView={currentView} onViewChange={(v) => (clubInviteToken ? leaveInvite(v) : setCurrentView(v))} />
      
      <main className="flex-1 pb-12">
        <Suspense fallback={<Loading />}>
        {clubInviteToken ? (
          <ClubSignup token={clubInviteToken} onDone={() => leaveInvite('coach')} />
        ) : currentView === 'athlete' ? (
          <AthleteArea />
        ) : (
          <CoachArea recovery={PASSWORD_RECOVERY} />
        )}
        </Suspense>
      </main>

      <footer className={`border-t border-slate-900 pt-6 px-4 text-center text-xs text-slate-600 ${currentView === 'athlete' && !clubInviteToken ? 'pb-24' : 'pb-6'}`}>
        <p>Monitoramento de Carga de Treino • Fisiologia & Preparação Física</p>
        <p className="mt-1">
          <a href="/privacidade" className="hover:text-slate-400 underline underline-offset-2">
            Política de Privacidade
          </a>
        </p>
      </footer>
    </div>
    </ClubProvider>
  );
}

export default App;
