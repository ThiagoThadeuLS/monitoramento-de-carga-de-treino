import { useState } from 'react';
import { Header } from './components/Header';
import { AthleteArea } from './components/AthleteArea';
import { CoachArea } from './components/CoachArea';
import { ClubProvider } from './lib/club';
import { ClubSignup } from './components/ClubSignup';
import { RESTRICTED_PATH, RestrictedArea } from './components/RestrictedArea';
import { InstallGate } from './components/InstallGate';
import { isMobileDevice, isStandalone } from './lib/push';

// Celular: só o app instalado (no computador, navegador normal)
const MOBILE_BROWSER = isMobileDevice() && !isStandalone();

export function App() {
  const [currentView, setCurrentView] = useState<'athlete' | 'coach'>('athlete');
  // Link de convite de clube: /?convite-clube=<código>
  const [clubInviteToken, setClubInviteToken] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('convite-clube')
  );

  const leaveInvite = (view: 'athlete' | 'coach') => {
    window.history.replaceState(null, '', window.location.pathname);
    setClubInviteToken(null);
    setCurrentView(view);
  };

  // Área Restrita dos donos: endereço próprio, sem o resto do app
  if (window.location.pathname.replace(/\/+$/, '') === RESTRICTED_PATH) {
    return (
      <ClubProvider>
        <RestrictedArea />
      </ClubProvider>
    );
  }

  // Exceção: o link de convite de clube abre no navegador para criar a conta
  if (MOBILE_BROWSER && !clubInviteToken) return <InstallGate />;

  return (
    <ClubProvider>
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Header currentView={currentView} onViewChange={(v) => (clubInviteToken ? leaveInvite(v) : setCurrentView(v))} />
      
      <main className="flex-1 pb-12">
        {clubInviteToken ? (
          <ClubSignup token={clubInviteToken} onDone={() => leaveInvite('coach')} />
        ) : currentView === 'athlete' ? (
          <AthleteArea />
        ) : (
          <CoachArea />
        )}
      </main>

      <footer className="border-t border-slate-900 py-6 px-4 text-center text-xs text-slate-600">
        Monitoramento de Carga de Treino • Fisiologia & Preparação Física
      </footer>
    </div>
    </ClubProvider>
  );
}

export default App;
