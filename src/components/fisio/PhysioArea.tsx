import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, HeartPulse, LogOut, Users, UsersRound } from 'lucide-react';
import { ClubCrest, ClubInfo } from '../../lib/club';
import { ClubAthlete, fetchClubAthletes } from '../../lib/athletes';
import { PhysioCase, deletePhysioCase, listPhysioCases, savePhysioCase } from '../../lib/physio';
import { GroupManagement } from '../coach/GroupManagement';
import { PhysioOverview } from './PhysioOverview';
import { PhysioCaseDetail } from './PhysioCaseDetail';
import { PhysioCaseForm } from './PhysioCaseForm';
import { PhysioAthletes } from './PhysioAthletes';

type View = 'casos' | 'atletas' | 'grupos';

interface Props {
  nome: string;
  club: ClubInfo;
  onLogout: () => void;
}

const VIEWS: { id: View; label: string; icon: typeof HeartPulse }[] = [
  { id: 'casos', label: 'Casos', icon: HeartPulse },
  { id: 'atletas', label: 'Atletas', icon: Users },
  { id: 'grupos', label: 'Grupos', icon: UsersRound },
];

/** Área restrita da fisioterapia: casos, plano, evolução e grupos do clube. */
export const PhysioArea: React.FC<Props> = ({ nome, club, onLogout }) => {
  const [view, setView] = useState<View>('casos');
  const [cases, setCases] = useState<PhysioCase[]>([]);
  const [athletes, setAthletes] = useState<ClubAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [athletesLoading, setAthletesLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PhysioCase | null>(null);

  const loadCases = useCallback(async () => {
    setError('');
    try {
      setCases(await listPhysioCases());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
    let cancelled = false;
    setAthletesLoading(true);
    fetchClubAthletes(club.id)
      .then((a) => !cancelled && setAthletes(a))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setAthletesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [club.id, loadCases]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (c: PhysioCase) => {
    setEditing(c);
    setFormOpen(true);
  };

  const handleSaved = (c: PhysioCase) => {
    setFormOpen(false);
    setEditing(null);
    loadCases();
    setSelected(c.id);
  };

  const handleDelete = async (c: PhysioCase) => {
    try {
      await deletePhysioCase(c.id);
      setSelected(null);
      await loadCases();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      {/* Cabeçalho da fisioterapia */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <ClubCrest club={club} className="w-10 h-12 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-sky-400 flex-shrink-0" />
              <span className="truncate">Painel de Fisioterapia</span>
            </h1>
            <p className="text-xs text-slate-400 truncate">{club.nome}</p>
            <p className="text-xs truncate">
              <span className="text-sky-400 font-medium">{nome}</span>{' '}
              <span className="text-slate-500">(fisioterapia)</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700/60 text-xs font-bold transition-all flex-shrink-0"
          title="Sair"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>

      <nav className="grid grid-cols-3 gap-1 p-1 bg-slate-900/90 border border-slate-800 rounded-2xl">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setView(id);
              setSelected(null);
            }}
            aria-current={view === id ? 'page' : undefined}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 py-2.5 rounded-xl text-[11px] sm:text-sm font-bold transition-all ${
              view === id ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </nav>

      {view === 'casos' &&
        (selected ? (
          <PhysioCaseDetail
            caseId={selected}
            athletes={athletes}
            onBack={() => setSelected(null)}
            onEdit={openEdit}
            onDelete={handleDelete}
            onChanged={loadCases}
          />
        ) : (
          <PhysioOverview
            cases={cases}
            athletes={athletes}
            loading={loading}
            error={error}
            onSelect={setSelected}
            onCreate={openNew}
          />
        ))}

      {view === 'atletas' && <PhysioAthletes athletes={athletes} loading={athletesLoading} error={error} />}
      {view === 'grupos' && <GroupManagement />}

      {formOpen && (
        <PhysioCaseForm
          athletes={athletes}
          initial={editing}
          save={savePhysioCase}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {/* Exclusão de caso fica no rodapé da ficha (via edição → situação "Alta"); aqui só o erro geral */}
      {error && !loading && view === 'casos' && selected && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
    </div>
  );
};
