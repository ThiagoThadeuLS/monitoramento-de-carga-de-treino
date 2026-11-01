import React, { useMemo, useState } from 'react';
import {
  Sparkles, CheckCircle2, ChevronRight, ChevronLeft, X, Trash2, HelpCircle, Flame, HeartPulse, Scale, CalendarDays,
  BellRing, Users, UsersRound, LineChart, Clock, UserPlus, Plus, StickyNote, BarChart3, Shield, Settings2, Target,
} from 'lucide-react';
import { PseForm } from '../PseForm';
import { PsrForm } from '../PsrForm';
import { WeightForm } from '../WeightForm';
import { TRAINING_TYPES } from '../../data/constants';
import { formatCpf, isValidCpf, onlyCpfDigits } from '../../lib/cpf';

/**
 * Tutorial interativo (primeiro acesso ou botão "?").
 * Tudo acontece numa área de treino: nada é enviado ao banco, e ao terminar o que
 * a pessoa registrou é descartado.
 */

interface Step {
  icon: typeof Flame;
  color: string;
  title: string;
  text: React.ReactNode;
  task?: string;
  render?: () => React.ReactNode;
  done: boolean;
}

interface TutorialProps {
  role: 'athlete' | 'coach';
  nome: string;
  onFinish: () => void;
}

export const Tutorial: React.FC<TutorialProps> = ({ role, nome, onFinish }) => {
  const [i, setI] = useState(0);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const athlete = useAthleteSteps(nome);
  const coach = useCoachSteps(nome);
  const { steps, log } = role === 'athlete' ? athlete : coach;

  const finalStep: Step = {
    icon: Trash2,
    color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
    title: 'Pronto! Tudo o que você fez aqui foi apagado',
    text: (
      <>
        O tutorial era só um treino: <strong>nenhum dado foi salvo</strong>. A partir de agora o sistema funciona de verdade.
        Se tiver dúvida, toque no botão <HelpCircle className="inline w-4 h-4 -mt-0.5 text-sky-300" /> no canto da tela para ver o tutorial de novo.
      </>
    ),
    render: () =>
      log.length ? (
        <div className="space-y-2">
          <p className="text-[10px] uppercase font-bold text-slate-500">Registrado no treino (descartado)</p>
          <ul className="space-y-1.5">
            {log.map((l, k) => (
              <li key={k} className="text-sm text-slate-400 line-through decoration-slate-600 flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5 text-slate-600 flex-shrink-0 no-underline" /> {l}
              </li>
            ))}
          </ul>
        </div>
      ) : null,
    done: true,
  };
  const all = [...steps, finalStep];
  const step = all[i];
  const last = i === all.length - 1;
  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label="Tutorial">
      <div className="max-w-2xl mx-auto px-4 py-5 sm:py-8 space-y-4" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
        {/* Progresso */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5 flex-shrink-0">
            <Sparkles className="w-4 h-4" /> Tutorial
          </span>
          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 transition-all duration-500" style={{ width: `${((i + 1) / all.length) * 100}%` }} />
          </div>
          <span className="text-xs text-slate-400 flex-shrink-0">{i + 1}/{all.length}</span>
          {!last && (
            <button type="button" onClick={() => setConfirmSkip(true)} className="p-1 text-slate-500 hover:text-white" title="Sair do tutorial">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {confirmSkip && (
          <div className="p-3 rounded-2xl bg-slate-900 border border-slate-700 flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
            <span className="flex-1 text-slate-300">Sair do tutorial? Você pode rever quando quiser pelo botão “?”.</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmSkip(false)} className="flex-1 px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold">Continuar</button>
              <button type="button" onClick={onFinish} className="flex-1 px-3 py-2 rounded-xl bg-slate-700 text-white text-xs font-bold">Sair</button>
            </div>
          </div>
        )}

        {/* Explicação */}
        <div key={i} className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
          <div className="flex items-start gap-3">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center flex-shrink-0 ${step.color}`}>
              <Icon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-white leading-tight">{step.title}</h2>
              <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">{step.text}</p>
            </div>
          </div>

          {step.task && (
            <div
              className={`rounded-2xl border px-4 py-3 flex items-start gap-2.5 text-sm transition-colors ${
                step.done ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200' : 'bg-sky-500/10 border-sky-500/40 text-sky-100'
              }`}
            >
              {step.done ? <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" /> : <Target className="w-5 h-5 flex-shrink-0 text-sky-300" />}
              <span>
                <strong>{step.done ? 'Tarefa concluída! ' : 'Sua tarefa: '}</strong>
                {step.task}
              </span>
            </div>
          )}

          {step.render && <div>{step.render()}</div>}
        </div>

        {/* Navegação */}
        <div className="flex gap-2 pb-6">
          {i > 0 && !last && (
            <button
              type="button"
              onClick={() => setI(i - 1)}
              className="flex items-center justify-center gap-1 px-4 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
          )}
          <button
            type="button"
            disabled={!step.done}
            onClick={() => (last ? onFinish() : setI(i + 1))}
            className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-black disabled:opacity-35 disabled:cursor-not-allowed shadow-lg shadow-sky-500/20"
          >
            {last ? 'Começar a usar' : i === 0 ? 'Vamos lá' : step.done ? 'Próximo' : 'Conclua a tarefa para continuar'}
            {!last && step.done && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Botão discreto para rever o tutorial. */
export const HelpButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title="Ver o tutorial"
    aria-label="Ver o tutorial"
    className="fixed z-40 right-3 w-9 h-9 rounded-full bg-slate-800/70 border border-slate-700/70 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center opacity-60 hover:opacity-100 transition-all"
    style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
  >
    <HelpCircle className="w-4 h-4" />
  </button>
);

/* ---------------------------------------------------------------- atleta */

function useAthleteSteps(nome: string) {
  const [log, setLog] = useState<string[]>([]);
  const [psr, setPsr] = useState(false);
  const [pse, setPse] = useState(false);
  const [weight, setWeight] = useState(false);
  const [openedNote, setOpenedNote] = useState<string | null>(null);
  const [gotIt, setGotIt] = useState(false);
  const add = (l: string) => setLog((cur) => [...cur, l]);
  const first = nome.split(' ')[0];

  const fakeSchedule = [
    { id: 'a', hora: '08:00 – 09:30', nome: 'Físico manhã', tipo: 'Treino Físico', pse: 6, nota: 'Levar elástico e corda. Aquecimento às 7h50.' },
    { id: 'b', hora: '17:00 – 18:30', nome: 'Randori', tipo: 'Treino Randori', pse: 8, nota: 'Foco em pegada. Trazer judogi azul.' },
  ];

  const steps: Step[] = [
    {
      icon: Sparkles,
      color: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
      title: `Olá, ${first}! Vamos aprender juntos`,
      text: (
        <>
          Em poucos minutos você vai praticar tudo o que vai usar no dia a dia: responder o <strong>bem-estar (PSR)</strong>, o{' '}
          <strong>esforço do treino (PSE)</strong>, registrar o <strong>peso</strong> e ver o <strong>cronograma</strong>. Pode testar à vontade:
          nada daqui é salvo.
        </>
      ),
      done: true,
    },
    {
      icon: HeartPulse,
      color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
      title: 'PSR: como você está hoje',
      text: (
        <>
          Responda <strong>antes do primeiro treino</strong>. Arraste cada barra: 1 é muito ruim e 10 é excelente. Seja sincero — é assim que a
          comissão técnica ajusta a sua carga.
        </>
      ),
      task: 'Ajuste as barras e toque em enviar.',
      render: () => (
        <Sandbox>
          <PsrForm
            athleteId="tutorial"
            athleteName={nome}
            onSubmit={async (r) => {
              add(`PSR: recuperação ${r.psr_score}/10, sono ${r.sleep_score}/10`);
              setPsr(true);
              return true;
            }}
          />
        </Sandbox>
      ),
      done: psr,
    },
    {
      icon: Flame,
      color: 'text-orange-300 bg-orange-500/15 border-orange-500/30',
      title: 'PSE: quanto o treino foi pesado',
      text: (
        <>
          Responda <strong>depois de cada treino</strong> (cerca de 20 min após o fim). Escolha o tipo de treino e a nota de 1 a 10. Se não
          treinou, marque <strong>“Não treinei”</strong> e escreva o motivo — ele é obrigatório.
        </>
      ),
      task: 'Escolha o tipo de treino, dê uma nota e envie.',
      render: () => (
        <Sandbox>
          <PseForm
            athleteId="tutorial"
            athleteName={nome}
            onSubmit={async (r) => {
              add(r.did_not_train ? `PSE: não treinou (${r.observations})` : `PSE: ${r.training_type} nota ${r.rpe_score}`);
              setPse(true);
              return true;
            }}
          />
        </Sandbox>
      ),
      done: pse,
    },
    {
      icon: Scale,
      color: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
      title: 'Peso',
      text: <>Nos dias de pesagem você recebe um lembrete. Registre o peso em quilos, como na balança (ex.: 72,5).</>,
      task: 'Digite um peso qualquer e envie.',
      render: () => (
        <Sandbox>
          <WeightForm
            athleteId="tutorial"
            athleteName={nome}
            onSubmit={async (r) => {
              add(`Peso: ${String(r.weight).replace('.', ',')} kg`);
              setWeight(true);
              return true;
            }}
          />
        </Sandbox>
      ),
      done: weight,
    },
    {
      icon: CalendarDays,
      color: 'text-violet-300 bg-violet-500/15 border-violet-500/30',
      title: 'Cronograma da semana',
      text: <>Na aba <strong>Agenda</strong> você vê os treinos programados para você. Toque num treino para ler as anotações do treinador.</>,
      task: 'Toque em um dos treinos abaixo para ver a anotação.',
      render: () => (
        <div className="space-y-2">
          {fakeSchedule.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpenedNote(t.id)}
              className={`w-full text-left p-3.5 rounded-2xl border transition-colors ${
                openedNote === t.id ? 'bg-violet-500/10 border-violet-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-400">{t.hora}</p>
                  <p className="font-bold text-white">{t.nome}</p>
                  <p className="text-xs text-slate-400">{t.tipo} • PSE esperada {t.pse}</p>
                </div>
                <StickyNote className="w-4 h-4 text-violet-300" />
              </div>
              {openedNote === t.id && (
                <p className="mt-2 text-sm text-slate-200 bg-slate-900 border border-slate-800 rounded-xl p-2.5">{t.nota}</p>
              )}
            </button>
          ))}
        </div>
      ),
      done: !!openedNote,
    },
    {
      icon: BellRing,
      color: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
      title: 'Os lembretes trabalham por você',
      text: (
        <>
          O app avisa no celular quando for a hora de responder. Se não responder, o aviso <strong>se repete a cada 20 minutos</strong>.
        </>
      ),
      task: 'Leia como funcionam os avisos e toque em “Entendi”.',
      render: () => (
        <div className="space-y-2">
          {[
            ['PSR', 'a partir do horário de início definido pelo treinador, nos dias de treino'],
            ['PSE', '20 minutos depois do fim de cada treino'],
            ['Peso', 'nos dias e horário de pesagem do clube'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-start gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-xs font-black text-amber-300 w-10 flex-shrink-0 pt-0.5">{k}</span>
              <span className="text-sm text-slate-300">{v}</span>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setGotIt(true)}
            disabled={gotIt}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold disabled:opacity-50"
          >
            {gotIt ? 'Entendido ✓' : 'Entendi'}
          </button>
        </div>
      ),
      done: gotIt,
    },
  ];
  return { steps, log };
}

/* ---------------------------------------------------------------- treinador */

const FAKE_ATHLETES = ['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Reis'];

function useCoachSteps(nome: string) {
  const [log, setLog] = useState<string[]>([]);
  const add = (l: string) => setLog((cur) => [...cur, l]);
  const first = nome.split(' ')[0];

  // 1. Atleta
  const [aNome, setANome] = useState('');
  const [aCpf, setACpf] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const roster = useMemo(() => (created ? [...FAKE_ATHLETES, created] : FAKE_ATHLETES), [created]);
  // 2. Grupo
  const [gNome, setGNome] = useState('');
  const [gMembers, setGMembers] = useState<string[]>([]);
  const [group, setGroup] = useState<{ nome: string; members: string[] } | null>(null);
  // 3. Treino
  const [tNome, setTNome] = useState('');
  const [tTipo, setTTipo] = useState(TRAINING_TYPES[0]);
  const [tIni, setTIni] = useState('08:00');
  const [tFim, setTFim] = useState('09:30');
  const [tPse, setTPse] = useState(6);
  const [tAud, setTAud] = useState<'todos' | 'grupo'>('todos');
  const [training, setTraining] = useState(false);
  // 4. Horário
  const [from, setFrom] = useState('06:00');
  const [until, setUntil] = useState('22:00');
  const [windowSaved, setWindowSaved] = useState(false);
  // 5. Análise
  const [filter, setFilter] = useState<'todos' | 'grupo'>('todos');
  const [filtered, setFiltered] = useState(false);

  const cpfOk = isValidCpf(aCpf);
  const tryCpf = '529.982.247-25';
  const missing = useMemo(() => {
    const base = [
      { nome: 'Bruno Lima', what: 'PSR' },
      { nome: 'Carla Dias', what: `PSE • ${tNome || 'Físico manhã'}` },
      { nome: created ?? 'Diego Reis', what: 'PSR' },
    ];
    return filter === 'grupo' && group ? base.filter((m) => group.members.includes(m.nome)) : base;
  }, [filter, group, created, tNome]);

  const input = 'w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500';
  const chip = (on: boolean) =>
    `px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${on ? 'bg-sky-500 text-slate-950 border-sky-500' : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'}`;

  const steps: Step[] = [
    {
      icon: Sparkles,
      color: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
      title: `Bem-vindo, ${first}!`,
      text: (
        <>
          Vamos montar um mini clube de treino e praticar as principais tarefas. Nada aqui é salvo. As abas do painel são:
        </>
      ),
      render: () => (
        <div className="grid sm:grid-cols-2 gap-2">
          {([
            [BarChart3, 'Dia', 'Respostas de hoje de cada atleta'],
            [LineChart, 'Período', 'Gráficos, alertas e quem não respondeu'],
            [CalendarDays, 'Agenda', 'Cronograma e horário dos avisos'],
            [Shield, 'Adversários', 'Ficha dos atletas de outros clubes'],
            [Settings2, 'Gestão', 'Atletas, grupos, treinadores e cores'],
          ] as const).map(([Ic, t, d]) => (
            <div key={t} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <Ic className="w-4 h-4 text-sky-300 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-white">{t}</p>
                <p className="text-xs text-slate-400">{d}</p>
              </div>
            </div>
          ))}
        </div>
      ),
      done: true,
    },
    {
      icon: UserPlus,
      color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
      title: 'Gestão: cadastre um atleta',
      text: (
        <>
          Só entra no app quem você cadastrar. O atleta entra com o <strong>CPF</strong>, e a senha inicial é o <strong>nome completo, junto e
          em minúsculas</strong>. No primeiro acesso ele cria a própria senha.
        </>
      ),
      task: `Cadastre um atleta com nome e CPF válido (pode usar ${tryCpf}).`,
      render: () =>
        created ? (
          <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/40 text-sm text-slate-200 space-y-1">
            <p className="font-bold text-white">{created}</p>
            <p className="text-xs text-slate-400">
              Login: CPF {formatCpf(aCpf)} • Senha inicial: <span className="font-mono text-emerald-300">{created.toLowerCase().replace(/\s+/g, '')}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <input className={input} placeholder="Nome completo" value={aNome} onChange={(e) => setANome(e.target.value)} />
            <input className={input} placeholder="CPF" inputMode="numeric" value={aCpf} onChange={(e) => setACpf(formatCpf(onlyCpfDigits(e.target.value)))} />
            {aCpf.length >= 14 && !cpfOk && <p className="text-xs text-red-300">CPF inválido.</p>}
            <button
              type="button"
              disabled={aNome.trim().split(/\s+/).length < 2 || !cpfOk}
              onClick={() => {
                const n = aNome.trim().replace(/\s+/g, ' ');
                setCreated(n);
                add(`Atleta cadastrado: ${n}`);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold disabled:opacity-40"
            >
              <Plus className="w-4 h-4" /> Cadastrar atleta
            </button>
            {aNome.trim() && aNome.trim().split(/\s+/).length < 2 && <p className="text-xs text-slate-500">Use nome e sobrenome.</p>}
          </div>
        ),
      done: !!created,
    },
    {
      icon: UsersRound,
      color: 'text-violet-300 bg-violet-500/15 border-violet-500/30',
      title: 'Gestão: crie um grupo',
      text: <>Grupos servem para programar treinos e filtrar análises (ex.: “Pesados”, “Sub-18”). Um atleta pode estar em vários grupos.</>,
      task: 'Dê um nome ao grupo, escolha pelo menos um atleta e salve.',
      render: () =>
        group ? (
          <div className="p-3 rounded-xl bg-slate-950 border border-violet-500/40">
            <p className="font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-violet-300" /> {group.nome}</p>
            <p className="text-xs text-slate-400">{group.members.join(', ')}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <input className={input} placeholder="Nome do grupo (ex.: Pesados)" value={gNome} onChange={(e) => setGNome(e.target.value)} />
            <div className="flex flex-wrap gap-1.5">
              {roster.map((a) => {
                const on = gMembers.includes(a);
                return (
                  <button key={a} type="button" className={chip(on)} onClick={() => setGMembers(on ? gMembers.filter((x) => x !== a) : [...gMembers, a])}>
                    {on ? '✓ ' : ''}{a}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={!gNome.trim() || !gMembers.length}
              onClick={() => {
                setGroup({ nome: gNome.trim(), members: gMembers });
                add(`Grupo “${gNome.trim()}” com ${gMembers.length} atleta(s)`);
              }}
              className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 text-sm font-bold disabled:opacity-40"
            >
              Salvar grupo
            </button>
          </div>
        ),
      done: !!group,
    },
    {
      icon: CalendarDays,
      color: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
      title: 'Agenda: programe um treino',
      text: (
        <>
          Você programa a semana passada, a atual e a próxima. O horário de fim define quando sai o lembrete da PSE, e a <strong>PSE esperada</strong>{' '}
          aparece nos gráficos para comparar com o que os atletas responderam.
        </>
      ),
      task: 'Preencha o treino, escolha para quem é e adicione.',
      render: () =>
        training ? (
          <div className="p-3 rounded-xl bg-slate-950 border border-sky-500/40">
            <p className="text-xs text-slate-400">{tIni} – {tFim} • {tTipo}</p>
            <p className="font-bold text-white">{tNome}</p>
            <p className="text-xs text-slate-400">PSE esperada {tPse} • Para: {tAud === 'grupo' && group ? `somente ${group.nome}` : 'todos'}</p>
            <p className="text-xs text-sky-300 mt-1 flex items-center gap-1"><BellRing className="w-3 h-3" /> Lembrete de PSE às {addMin(tFim, 20)}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <input className={input} placeholder="Nome do treino (ex.: Randori tarde)" value={tNome} onChange={(e) => setTNome(e.target.value)} />
            <select className={input} value={tTipo} onChange={(e) => setTTipo(e.target.value)}>
              {TRAINING_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] uppercase font-bold text-slate-400">Início<input type="time" className={`${input} mt-1`} value={tIni} onChange={(e) => setTIni(e.target.value)} /></label>
              <label className="text-[10px] uppercase font-bold text-slate-400">Fim<input type="time" className={`${input} mt-1`} value={tFim} onChange={(e) => setTFim(e.target.value)} /></label>
            </div>
            <label className="block">
              <span className="text-[10px] uppercase font-bold text-slate-400">PSE esperada: <span className="text-white text-sm">{tPse}</span></span>
              <input type="range" min={1} max={10} value={tPse} onChange={(e) => setTPse(Number(e.target.value))} className="w-full" style={{ ['--thumb-color' as any]: '#0ea5e9' }} />
            </label>
            <div className="flex gap-1.5">
              <button type="button" className={chip(tAud === 'todos')} onClick={() => setTAud('todos')}>Todos</button>
              {group && <button type="button" className={chip(tAud === 'grupo')} onClick={() => setTAud('grupo')}>Somente {group.nome}</button>}
            </div>
            {tFim <= tIni && <p className="text-xs text-red-300">O fim precisa ser depois do início.</p>}
            <button
              type="button"
              disabled={!tNome.trim() || tFim <= tIni}
              onClick={() => {
                setTraining(true);
                add(`Treino “${tNome.trim()}” ${tIni}–${tFim}, PSE esperada ${tPse}`);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold disabled:opacity-40"
            >
              <Plus className="w-4 h-4" /> Adicionar treino
            </button>
          </div>
        ),
      done: training,
    },
    {
      icon: Clock,
      color: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
      title: 'Agenda: horário dos avisos',
      text: (
        <>
          Você decide entre que horas os atletas podem receber notificações. A <strong>PSR começa a ser cobrada no início</strong> desse horário, e
          quem não responder até o <strong>fim</strong> aparece na tabela “Sem resposta”.
        </>
      ),
      task: 'Ajuste o início e o fim e toque em salvar.',
      render: () => (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            das <input type="time" className={`${input} w-auto`} value={from} onChange={(e) => { setFrom(e.target.value); setWindowSaved(false); }} />
            às <input type="time" className={`${input} w-auto`} value={until} onChange={(e) => { setUntil(e.target.value); setWindowSaved(false); }} />
          </div>
          {from >= until && <p className="text-xs text-red-300">O início precisa ser antes do fim.</p>}
          <button
            type="button"
            disabled={from >= until || windowSaved}
            onClick={() => {
              setWindowSaved(true);
              add(`Horário dos avisos: ${from} às ${until}`);
            }}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold disabled:opacity-40"
          >
            {windowSaved ? 'Salvo ✓' : 'Salvar horário'}
          </button>
        </div>
      ),
      done: windowSaved,
    },
    {
      icon: LineChart,
      color: 'text-red-300 bg-red-500/15 border-red-500/30',
      title: 'Período: quem não respondeu',
      text: (
        <>
          Na Análise do Período você vê gráficos de PSE e PSR, alertas e a tabela de quem ficou <strong>sem resposta até {until}</strong>. Tudo
          respeita as datas e os grupos/pessoas escolhidos no filtro.
        </>
      ),
      task: group ? `Filtre pelo grupo “${group.nome}” e veja a tabela mudar.` : 'Use o filtro abaixo.',
      render: () => (
        <div className="space-y-2.5">
          <div className="flex gap-1.5">
            <button type="button" className={chip(filter === 'todos')} onClick={() => setFilter('todos')}>Todos os atletas</button>
            {group && (
              <button type="button" className={chip(filter === 'grupo')} onClick={() => { setFilter('grupo'); setFiltered(true); }}>
                {group.nome}
              </button>
            )}
          </div>
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <p className="px-3 py-2 bg-slate-950 text-xs font-bold text-white">Sem resposta até {until}</p>
            {missing.length ? (
              missing.map((m) => (
                <div key={m.nome + m.what} className="px-3 py-2 border-t border-slate-800 flex items-center justify-between gap-2 text-sm">
                  <span className="text-white font-semibold truncate">{m.nome}</span>
                  <span className="text-xs text-slate-400 truncate">{m.what}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/30 font-semibold whitespace-nowrap">Não respondeu</span>
                </div>
              ))
            ) : (
              <p className="px-3 py-4 text-center text-xs text-slate-500 border-t border-slate-800">Todos do grupo responderam no prazo.</p>
            )}
          </div>
        </div>
      ),
      done: filtered || !group,
    },
  ];
  return { steps, log };
}

const addMin = (hhmm: string, min: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (h * 60 + m + min) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

const Sandbox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative rounded-2xl border-2 border-dashed border-slate-700 p-3 sm:p-4 bg-slate-950/50">
    <span className="absolute -top-2.5 left-3 px-2 text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-slate-400">
      Área de treino • não é salvo
    </span>
    {children}
  </div>
);
