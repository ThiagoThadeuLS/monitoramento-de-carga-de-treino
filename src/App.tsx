import { useState } from 'react';
import { Header } from './components/Header';
import { AthleteArea } from './components/AthleteArea';
import { CoachArea } from './components/CoachArea';

export function App() {
  const [currentView, setCurrentView] = useState<'athlete' | 'coach'>('athlete');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Header currentView={currentView} onViewChange={setCurrentView} />
      
      <main className="flex-1 pb-12">
        {currentView === 'athlete' ? <AthleteArea /> : <CoachArea />}
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
        Monitoramento de Carga de Treino • Fisiologia & Preparação Física
      </footer>
    </div>
  );
}

export default App;
