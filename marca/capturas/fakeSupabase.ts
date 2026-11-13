// Banco falso, só para tirar fotos do app de verdade (site e Instagram).
// Substitui o '@supabase/supabase-js' pelo vite.config.ts desta pasta: nada vai para a internet
// e nenhum dado real aparece. Os dados seguem o roteiro de supabase_dados_ficticios.sql.
//
//   ?demo=atleta     → entra como a atleta Mariana (área do atleta)
//   ?demo=treinador  → entra como treinadora (clique em "Treinador" no topo)
import { addDaysISO, todayISO, nowTimeHM } from '../../src/lib/date';
// Mesma versão de src/components/TermsGate.tsx (importar de lá criaria um ciclo com o supabase)
const TERMS_VERSION = '2026-11-04';

type Row = Record<string, any>;

// ---------- números sorteados sempre iguais ----------
let semente = 42;
const random = () => {
  semente |= 0;
  semente = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp = (v: number, a = 1, b = 10) => Math.max(a, Math.min(b, Math.round(v)));
let seq = 0;
const uid = (p = 'f1c71c10') => `${p}-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const dow = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d; // 1 = segunda ... 7 = domingo
};
const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const stamp = (iso: string, hm: string) => `${iso}T${hm}:00-03:00`;
const addMin = (hm: string, m: number) => {
  const t = minutes(hm) + m;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// ---------- clube, pessoas e grupos ----------
const CLUB_ID = 'c1ab0000-0000-4000-8000-00000000ca7a';
const COACH_ID = 'c0ac0000-0000-4000-8000-000000000001';
// Ícone real do app (public/icons/icon.svg) no lugar do escudo do clube
const ESCUDO = '/icons/icon.svg';
const CLUB = { id: CLUB_ID, nome: 'Carga', escudo_url: ESCUDO, status: 'ativo' };

const NOMES = [
  'Gabriel Moura Teixeira', 'Lucas Andrade Pires', 'Pedro Henrique Lacerda', 'Rafael Nogueira Campos', 'Mateus Fonseca Brandão',
  'Bruno Siqueira Lopes', 'Thiago Rezende Matos', 'Felipe Antunes Correia', 'Gustavo Prado Viana', 'Daniel Queiroz Farias',
  'Leonardo Vasconcelos Reis', 'Vinícius Tavares Aguiar', 'Caio Bittencourt Lemos', 'André Figueiredo Sales', 'Diego Pacheco Araújo',
  'Murilo Cavalcanti Rocha', 'Henrique Bastos Monteiro', 'Samuel Guimarães Dias',
  'Mariana Couto Ribeiro', 'Beatriz Lobato Freire', 'Larissa Peixoto Amaral', 'Ana Clara Moreira Lins', 'Júlia Sampaio Neves',
  'Camila Torres Medeiros', 'Fernanda Rangel Duarte', 'Letícia Barros Cunha', 'Isabela Fontes Miranda', 'Carolina Assis Vieira',
  'Amanda Castelo Pimentel', 'Bianca Leal Magalhães', 'Natália Coelho Brito', 'Priscila Godoy Ramos', 'Renata Mattos Franco',
  'Yasmin Carvalho Seixas', 'Giovana Paiva Holanda', 'Lívia Dantas Ventura',
];
const CAT_M = ['-60', '-66', '-73', '-81', '-90', '-100', '+100'];
const CAT_F = ['-48', '-52', '-57', '-63', '-70', '-78', '+78'];
const MOTIVOS = ['Consulta médica no horário do treino.', 'Gripe, com febre desde ontem.', 'Prova na faculdade.', 'Viagem com a família.'];
const OBS = ['Senti o ombro no fim do randori.', 'Treino bom, me senti forte.', 'Cansado da semana.', 'Pegada melhorou bastante.', 'Dormi mal, rendi menos.'];

// Semana-modelo (1 = segunda ... 6 = sábado)
const MODELO = [
  { dow: 1, ini: '07:30', fim: '09:00', nome: 'Físico — força', tipo: 'Treino Físico', pse: 6, pub: 'todos', nota: 'Levar elástico e corda. Aquecimento às 7h20.' },
  { dow: 1, ini: '17:00', fim: '18:30', nome: 'Técnico — pegada e kumikata', tipo: 'Treino Técnico', pse: 5, pub: 'todos', nota: null },
  { dow: 2, ini: '17:00', fim: '18:45', nome: 'Randori', tipo: 'Treino Randori', pse: 8, pub: 'todos', nota: 'Randori 6 x 5 min, troca de parceiro a cada round.' },
  { dow: 3, ini: '07:30', fim: '09:00', nome: 'Físico — potência', tipo: 'Treino Físico', pse: 7, pub: 'todos', nota: null },
  { dow: 3, ini: '17:00', fim: '18:30', nome: 'Técnico — ne-waza', tipo: 'Treino Técnico', pse: 5, pub: 'todos', nota: 'Foco em transição em pé → solo.' },
  { dow: 4, ini: '17:00', fim: '18:45', nome: 'Randori', tipo: 'Treino Randori', pse: 8, pub: 'todos', nota: null },
  { dow: 5, ini: '07:30', fim: '08:30', nome: 'Físico — regenerativo', tipo: 'Treino Físico', pse: 4, pub: 'exceto_juvenil', nota: 'Juvenis dispensados (aula).' },
  { dow: 5, ini: '17:00', fim: '18:00', nome: 'Técnico — situações de luta', tipo: 'Treino Técnico', pse: 6, pub: 'todos', nota: null },
  { dow: 6, ini: '09:00', fim: '10:30', nome: 'Randori — seleção', tipo: 'Treino Randori', pse: 8, pub: 'selecao', nota: 'Somente atletas da seleção. Pesagem antes do treino.' },
];

function gerar() {
  const today = todayISO();
  const now = nowTimeHM();
  const t: Record<string, Row[]> = {
    clubs: [CLUB], coaches: [], athletes: [], athlete_groups: [], athlete_group_members: [], training_sessions: [],
    pse_records: [], psr_records: [], weight_records: [], adversarios: [], adversario_observacoes: [], adversario_ocultos: [],
    competitions: [], club_reminder_settings: [], club_exercises: [], workout_prescriptions: [], workout_templates: [],
    body_compositions: [], athlete_prs: [], escudos: [],
  };
  t.coaches.push({ user_id: COACH_ID, club_id: CLUB_ID, nome: 'Paula Rezende', email: 'paula@carga.app', photo_url: null, role: 'admin', active: true, must_change_password: false, created_at: stamp(addDaysISO(today, -90), '09:00') });
  t.coaches.push({ user_id: 'c0ac0000-0000-4000-8000-000000000002', club_id: CLUB_ID, nome: 'Marcos Lima', email: 'marcos@carga.app', photo_url: null, role: 'treinador', active: true, must_change_password: false, created_at: stamp(addDaysISO(today, -80), '09:00') });
  t.club_reminder_settings.push({ club_id: CLUB_ID, weight_days: [1, 3, 5], weight_time: '07:00', notify_from: '06:00', notify_until: '21:00' });

  // Atletas
  const perfis: Row[] = [];
  NOMES.forEach((nome, k) => {
    const i = k + 1;
    const sexo = i <= 18 ? 'Masculino' : 'Feminino';
    const classe = ['Sênior', 'Sênior', 'Junior', 'Juvenil'][i % 4];
    const categoria = sexo === 'Masculino' ? CAT_M[i % 7] : CAT_F[i % 7];
    const id = `f1c71c10-0000-4000-8000-${String(i).padStart(12, '0')}`;
    t.athletes.push({
      id, nome, cpf: null, classe, categoria, celular: 'FICTICIO', sexo, active: i !== 34, club_id: CLUB_ID, photo_url: null,
      birth_date: `${2000 + (i % 8)}-0${1 + (i % 9)}-1${i % 9}`, terms_accepted_at: stamp(addDaysISO(today, -50), '10:00'), terms_version: TERMS_VERSION,
      created_at: stamp(addDaysISO(today, -60), '10:00'),
    });
    perfis.push({
      id, i, sexo, classe, categoria,
      perfil: [3, 12, 23].includes(i) ? 'pico' : [7, 27].includes(i) ? 'monotono' : i === 16 ? 'retorno' : i === 20 ? 'faltoso' : i === 34 ? 'inativo' : i === 6 ? 'corte' : 'normal',
      off: (random() - 0.5) * 1.6,
      adesao: i === 20 ? 0.55 : i === 19 ? 1 : 0.86 + random() * 0.12,
      peso: Number(categoria.replace(/[+-]/g, '')) + (categoria.startsWith('+') ? 9 : -1.5) + random() * 1.2,
      bem: 6.6 + random() * 1.8,
    });
  });

  // Grupos
  const G: Record<string, string> = {};
  for (const [k, nome] of [['m', 'Masculino'], ['f', 'Feminino'], ['sen', 'Sênior'], ['jun', 'Junior (Sub-21)'], ['juv', 'Juvenil (Sub-18)'], ['sel', 'Seleção — fim de semana'], ['pes', 'Pesados']]) {
    G[k] = uid();
    t.athlete_groups.push({ id: G[k], club_id: CLUB_ID, nome });
  }
  for (const a of perfis) {
    const gs = [a.sexo === 'Masculino' ? G.m : G.f, a.classe === 'Sênior' ? G.sen : a.classe === 'Junior' ? G.jun : G.juv];
    if (a.i % 4 === 0 || a.perfil === 'pico' || a.i === 19) gs.push(G.sel);
    if (['-90', '-100', '+100', '-78', '+78'].includes(a.categoria)) gs.push(G.pes);
    for (const g of gs) t.athlete_group_members.push({ group_id: g, athlete_id: a.id, club_id: CLUB_ID });
  }
  const naSelecao = (id: string) => t.athlete_group_members.some((m) => m.group_id === G.sel && m.athlete_id === id);

  // Cronograma: semana passada, atual e próxima
  const semana = addDaysISO(today, 1 - dow(today));
  for (let d = addDaysISO(semana, -7); d <= addDaysISO(semana, 13); d = addDaysISO(d, 1)) {
    for (const m of MODELO.filter((x) => x.dow === dow(d))) {
      t.training_sessions.push({
        id: uid(), club_id: CLUB_ID, date: d, start_time: `${m.ini}:00`, end_time: `${m.fim}:00`, name: m.nome, training_type: m.tipo,
        expected_pse: m.pse, notes: m.nota, hide_notes: false,
        audience: m.pub === 'selecao' ? 'incluir' : m.pub === 'exceto_juvenil' ? 'exceto' : 'todos',
        target_group_ids: m.pub === 'selecao' ? [G.sel] : m.pub === 'exceto_juvenil' ? [G.juv] : [], target_athlete_ids: [],
        created_at: stamp(addDaysISO(semana, -10), '10:00'),
      });
    }
  }

  // Respostas: 8 semanas
  for (const a of perfis) {
    const fimResp = a.perfil === 'inativo' ? addDaysISO(today, -15) : today;
    for (let d = addDaysISO(today, -55); d <= fimResp; d = addDaysISO(d, 1)) {
      const recente = d > addDaysISO(today, -7);
      if (a.perfil === 'monotono' && recente) {
        if (d < today || now > '19:00') t.pse_records.push({ id: uid(), athlete_id: a.id, date: d, training_type: 'Treino Físico', rpe_score: 6, did_not_train: false, duration_minutes: 80, created_at: stamp(d, '19:00') });
      } else {
        const treinos = MODELO.filter((m) => m.dow === dow(d) && (m.pub === 'todos' || (m.pub === 'selecao' && naSelecao(a.id)) || (m.pub === 'exceto_juvenil' && a.classe !== 'Juvenil')));
        for (const m of treinos) {
          if (d === today && addMin(m.fim, 20) > now) continue;
          if (d === today && a.i === 19) continue; // PSE de hoje da Mariana fica pendente (foto da tela Hoje)
          if (random() > a.adesao) continue;
          if (a.perfil === 'retorno' && d >= addDaysISO(today, -35) && d <= addDaysISO(today, -12)) {
            t.pse_records.push({ id: uid(), athlete_id: a.id, date: d, training_type: null, rpe_score: null, did_not_train: true, duration_minutes: null, observations: 'Lesão no ombro esquerdo — fisioterapia.', created_at: stamp(d, addMin(m.fim, 30)) });
            break;
          }
          if (a.i !== 19 && random() < 0.03) {
            t.pse_records.push({ id: uid(), athlete_id: a.id, date: d, training_type: null, rpe_score: null, did_not_train: true, duration_minutes: null, observations: MOTIVOS[Math.floor(random() * MOTIVOS.length)], created_at: stamp(d, addMin(m.fim, 40)) });
            break;
          }
          const rpe = clamp(m.pse + a.off + (random() - 0.5) * 2.4 + (a.perfil === 'pico' && recente ? 2 : 0));
          let dur = minutes(m.fim) - minutes(m.ini) + Math.round((random() - 0.5) * 16);
          if (a.perfil === 'pico') dur = Math.round(dur * (recente ? 1.4 : d > addDaysISO(today, -28) ? 0.7 : 1));
          t.pse_records.push({
            id: uid(), athlete_id: a.id, date: d, training_type: m.tipo, rpe_score: rpe, did_not_train: false, duration_minutes: dur,
            observations: random() < 0.08 ? OBS[Math.floor(random() * OBS.length)] : null, created_at: stamp(d, addMin(m.fim, 20 + Math.floor(random() * 70))),
          });
        }
      }
      // PSR de manhã (segunda a sábado)
      if (dow(d) <= 6 && random() <= a.adesao && (d < today || now > '08:30')) {
        const ontem = t.pse_records.filter((p) => p.athlete_id === a.id && p.date === addDaysISO(d, -1) && !p.did_not_train);
        const prev = ontem.reduce((s, p) => s + p.rpe_score * p.duration_minutes, 0);
        const base = a.bem - (prev / 450 + (a.perfil === 'pico' && recente ? 1.8 : 0) + (a.perfil === 'monotono' && recente ? 1 : 0));
        t.psr_records.push({
          id: uid(), athlete_id: a.id, date: d, psr_score: clamp(base + (random() - 0.5) * 2), fatigue_score: clamp(base - 0.3 + (random() - 0.5) * 2),
          sleep_score: clamp(a.bem + (random() - 0.5) * 3 - (a.perfil === 'pico' && recente ? 1.5 : 0)),
          muscle_soreness_score: clamp(base - 0.5 + (random() - 0.5) * 2 - (a.perfil === 'retorno' && d >= addDaysISO(today, -35) && d <= addDaysISO(today, -12) ? 2 : 0)),
          stress_score: clamp(a.bem + (random() - 0.5) * 2.6), mood_score: clamp(a.bem + 0.4 + (random() - 0.5) * 2),
          created_at: stamp(d, addMin('06:40', Math.floor(random() * 100))),
        });
      }
      // Peso: segunda, quarta e sexta
      if ([1, 3, 5].includes(dow(d)) && random() < 0.9 && (d < today || now > '07:30')) {
        const dias = (new Date(`${today}T12:00:00Z`).getTime() - new Date(`${d}T12:00:00Z`).getTime()) / 86400000;
        const peso = a.peso + Math.sin(dias / 5) * 0.4 + (random() - 0.5) * 0.4 - (a.perfil === 'corte' && dias < 21 ? (21 - dias) * 0.13 : 0);
        t.weight_records.push({ id: uid(), athlete_id: a.id, date: d, weight: Math.round(peso * 10) / 10, created_at: stamp(d, addMin('07:00', Math.floor(random() * 30))) });
      }
    }
  }

  // Preparação física: catálogo, PRs e ficha dos treinos físicos
  const exercicios = [
    ['Agachamento livre', 'Força', true, true], ['Supino reto', 'Força', true, true], ['Levantamento terra', 'Força', true, true],
    ['Arremesso', 'Potência', true, true], ['Puxada na barra fixa', 'Força', false, false], ['Prancha', 'Core', false, false],
  ] as const;
  for (const [nome, bloco, pr, barra] of exercicios) t.club_exercises.push({ id: uid(), club_id: CLUB_ID, nome, bloco, exige_pr: pr, usa_barra: barra, created_at: stamp(addDaysISO(today, -70), '09:00') });
  for (const s of t.training_sessions.filter((x) => x.training_type === 'Treino Físico')) {
    const ficha = [
      ['Aquecimento', 'Prancha', 3, '40 s', false, null, false],
      ['Principal', 'Agachamento livre', 4, '5', true, 80, true],
      ['Principal', 'Supino reto', 4, '6', true, 75, true],
      ['Principal', 'Levantamento terra', 3, '4', true, 80, true],
      ['Complementar', 'Puxada na barra fixa', 3, '8', false, null, false],
    ] as const;
    ficha.forEach(([bloco, exercicio, series, repeticoes, usa_pr, pct, usa_barra], posicao) =>
      t.workout_prescriptions.push({ id: uid(), club_id: CLUB_ID, training_session_id: s.id, bloco, exercicio, series, repeticoes, usa_pr, porcentagem_pr: pct, usa_barra, observacoes_tecnico: exercicio === 'Agachamento livre' ? 'Descer até a paralela, subida explosiva.' : null, posicao, created_at: s.created_at })
    );
  }

  // Composição corporal da atleta das fotos
  const mariana = t.athletes[18].id;
  [[-84, 22.4], [-56, 21.6], [-28, 20.9], [-3, 20.1]].forEach(([dias, pct]) =>
    t.body_compositions.push({ id: uid(), athlete_id: mariana, club_id: CLUB_ID, date: addDaysISO(today, dias), percentual: pct, peso: 56.2, massa_magra: 56.2 * (1 - pct / 100), massa_gorda: 56.2 * pct / 100, protocolo: 'pollock7', dobras: {} })
  );

  // Adversários
  [
    ['Rodrigo Sanches Lira', '-73kg', 'sênior', 'clube', 'Esporte Clube Pinheiros', 'Canhoto. Forte no uchi-mata; entra bem no contra-ataque.', 'Masculino'],
    ['Kenji Yamamoto', '-66kg', 'sênior', 'pais', 'Japão', 'Muito rápido na troca de pegada. Seoi-nage de joelhos.', 'Masculino'],
    ['Aline Prates Moura', '-57kg', 'sênior', 'clube', 'Esporte Clube Pinheiros', 'Destra. Ataca o tempo todo com o-uchi-gari.', 'Feminino'],
    ['Sofia Kowalska', '-63kg', 'sênior', 'pais', 'Polônia', 'Muito forte fisicamente. Pegada de costas.', 'Feminino'],
    ['Helena Ribas', '-52kg', 'juvenil', 'clube', 'Sogipa', 'Revelação; perde rendimento após 3 min.', 'Feminino'],
    ['Marta Quintero', '-70kg', 'sênior', 'pais', 'Colômbia', 'Boa no tai-otoshi. Cuidado com o contra-golpe.', 'Feminino'],
  ].forEach(([nome, categoria_peso, classe_idade, tipo_origem, origem_valor, observacao, sexo]) =>
    t.adversarios.push({ id: uid(), club_id: CLUB_ID, nome, sexo, categoria_peso, classe_idade, tipo_origem, origem_valor, observacao, created_by_athlete: null, created_at: stamp(addDaysISO(today, -40), '10:00') })
  );

  // Competição
  // Competição que já passou (pede o resultado) e um treinamento de campo
  t.competitions.push({ id: uid(), club_id: CLUB_ID, tipo: 'competicao', nome: 'Copa BH de Judô', data: addDaysISO(today, -3), data_fim: null, data_pesagem: addDaysISO(today, -4), hora_pesagem: '17:00:00', local: 'Belo Horizonte', observacoes: null, audience: 'todos', target_group_ids: [], target_athlete_ids: [], created_at: stamp(addDaysISO(today, -30), '10:00') });
  t.competitions.push({ id: uid(), club_id: CLUB_ID, tipo: 'campo', nome: 'Treinamento de campo — seleção mineira', data: addDaysISO(today, 9), data_fim: addDaysISO(today, 13), data_pesagem: null, hora_pesagem: null, local: 'Pindamonhangaba (SP)', observacoes: 'Levar quimono reserva e documento.', audience: 'todos', target_group_ids: [], target_athlete_ids: [], created_at: stamp(addDaysISO(today, -5), '10:00') });
  t.adversario_observacoes.push({ id: uid(), adversario_id: t.adversarios[2].id, autor_id: COACH_ID, autor_tipo: 'tecnico', texto: 'Pegada forte na manga esquerda.', created_at: stamp(addDaysISO(today, -6), '10:00'), editado_em: null });
  t.competitions.push({ id: uid(), club_id: CLUB_ID, tipo: 'competicao', nome: 'Campeonato Mineiro Sênior', data: addDaysISO(today, 18), data_pesagem: addDaysISO(today, 17), hora_pesagem: '18:00:00', local: 'Belo Horizonte', observacoes: null, audience: 'incluir', target_group_ids: [G.sel], target_athlete_ids: [], created_at: stamp(addDaysISO(today, -20), '10:00') });

  return { t, G, perfis };
}

const { t: db, G } = gerar();

// WHOOP fictício: 5 atletas conectados, 30 dias de números (sempre os mesmos)
const WHOOP_IDS = [0, 2, 11, 18, 22].map((k) => db.athletes[k].id);
const whoopDays = (id: string) => {
  const seed = id.charCodeAt(id.length - 1) + id.charCodeAt(id.length - 2);
  return Array.from({ length: 30 }, (_, k) => {
    const w = Math.sin((k + seed) / 3);
    return {
      date: addDaysISO(todayISO(), -k),
      recovery_score: Math.round(58 + w * 26),
      hrv_ms: Math.round(70 + w * 18),
      resting_hr: Math.round(52 - w * 5),
      spo2: 96.5,
      sleep_hours: Math.round((7.1 + w * 0.9) * 10) / 10,
      sleep_performance: Math.round(82 + w * 12),
      sleep_efficiency: 91,
      strain: Math.round((13 + Math.cos((k + seed) / 2) * 4) * 10) / 10,
      day_kj: Math.round(9800 + w * 1800),
      steps: Math.round(9000 + w * 3000),
    };
  });
};
const ATLETA = db.athletes[18]; // Mariana Couto Ribeiro
const TOKEN = 'demo-token-mariana';

// ---------- consultas (imitam o PostgREST) ----------
const cmp = (a: any, b: any) => (a === b ? 0 : a === null || a === undefined ? 1 : b === null || b === undefined ? -1 : a < b ? -1 : 1);
const igual = (a: any, b: any) => String(a) === String(b);

class Query implements PromiseLike<any> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private from?: number;
  private to?: number;
  private one: '' | 'single' | 'maybe' = '';
  private payload: any;
  private cols = '*';
  private head = false;
  private wantCount = false;
  private returning = false;
  constructor(private table: string) {}

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    if (this.op === 'select') {
      this.cols = cols;
      this.head = !!opts?.head;
      this.wantCount = !!opts?.count;
    } else this.returning = true;
    return this;
  }
  insert(rows: any) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows: any) { this.op = 'upsert'; this.payload = rows; return this; }
  update(p: any) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: any) { this.filters.push((r) => igual(r[c], v)); return this; }
  neq(c: string, v: any) { this.filters.push((r) => !igual(r[c], v)); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] > v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this; }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.some((v) => igual(r[c], v))); return this; }
  is(c: string, v: any) { this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return this; }
  not(c: string, op: string, v: any) {
    if (op === 'is' && v === null) this.filters.push((r) => r[c] !== null && r[c] !== undefined);
    else if (op === 'eq') this.filters.push((r) => !igual(r[c], v));
    return this;
  }
  contains(c: string, vs: any[]) { this.filters.push((r) => vs.every((v) => (r[c] ?? []).includes(v))); return this; }
  match(o: Row) { Object.entries(o).forEach(([c, v]) => this.eq(c, v)); return this; }
  ilike(c: string, pat: string) {
    const re = new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');
    this.filters.push((r) => re.test(String(r[c] ?? '')));
    return this;
  }
  filter(c: string, op: string, v: any) { return op === 'eq' ? this.eq(c, v) : op === 'in' ? this : this; }
  or() { return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this; }
  range(a: number, b: number) { this.from = a; this.to = b; return this; }
  limit(n: number) { this.from = 0; this.to = n - 1; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  abortSignal() { return this; }

  private rows() { return (db[this.table] ??= []); }
  private embed(r: Row): Row {
    const m = this.cols.match(/(\w+)\(([^)]*)\)/);
    if (!m) return { ...r };
    const fk = this.table === 'athlete_groups' ? 'group_id' : `${this.table.replace(/s$/, '')}_id`;
    return { ...r, [m[1]]: (db[m[1]] ?? []).filter((x) => igual(x[fk], r.id)) };
  }
  private run() {
    const all = this.rows();
    const ok = (r: Row) => this.filters.every((f) => f(r));
    if (this.op === 'insert' || this.op === 'upsert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r: Row) => ({ id: uid(), club_id: CLUB_ID, created_at: new Date().toISOString(), ...r }));
      all.push(...list);
      return { data: this.returning ? (this.one ? list[0] : list) : null, error: null };
    }
    if (this.op === 'update') {
      const hit = all.filter(ok);
      hit.forEach((r) => Object.assign(r, this.payload));
      return { data: this.returning ? (this.one ? hit[0] ?? null : hit) : null, error: null };
    }
    if (this.op === 'delete') {
      const hit = all.filter(ok);
      db[this.table] = all.filter((r) => !ok(r));
      return { data: this.returning ? hit : null, error: null };
    }
    let out = all.filter(ok);
    if (this.orders.length) {
      out = [...out].sort((a, b) => {
        for (const o of this.orders) {
          const c = cmp(a[o.col], b[o.col]);
          if (c) return o.asc ? c : -c;
        }
        return 0;
      });
    }
    const count = out.length;
    if (this.from !== undefined) out = out.slice(this.from, (this.to ?? out.length) + 1);
    const data = out.map((r) => this.embed(r));
    if (this.head) return { data: null, error: null, count };
    if (this.one) {
      if (!data.length && this.one === 'single') return { data: null, error: { message: 'Nenhuma linha', code: 'PGRST116' } };
      return { data: data[0] ?? null, error: null };
    }
    return { data, error: null, count: this.wantCount ? count : null };
  }
  then<A, B>(ok?: (v: any) => A | PromiseLike<A>, err?: (e: any) => B | PromiseLike<B>) {
    return new Promise((res) => setTimeout(() => res(this.run()), 40)).then(ok, err);
  }
}

// ---------- funções do banco (rpc) ----------
const doAtleta = (tab: string) => db[tab].filter((r) => r.athlete_id === ATLETA.id);
const gruposDoAtleta = db.athlete_group_members.filter((m) => m.athlete_id === ATLETA.id).map((m) => m.group_id);
const paraAtleta = (s: Row) =>
  s.audience === 'todos' || !s.audience
    ? true
    : s.audience === 'incluir'
      ? (s.target_group_ids ?? []).some((g: string) => gruposDoAtleta.includes(g)) || (s.target_athlete_ids ?? []).includes(ATLETA.id)
      : !((s.target_group_ids ?? []).some((g: string) => gruposDoAtleta.includes(g)) || (s.target_athlete_ids ?? []).includes(ATLETA.id));
const sessaoAtleta = () => ({
  token: TOKEN, must_change_password: false,
  athlete: { id: ATLETA.id, nome: ATLETA.nome, classe: ATLETA.classe, categoria: ATLETA.categoria, photo_url: null },
  club: { id: CLUB.id, nome: CLUB.nome, escudo_url: CLUB.escudo_url },
  terms: { accepted_at: ATLETA.terms_accepted_at, version: TERMS_VERSION }, tutorial_pending: false,
});
const prsAtleta = () => [
  ['Agachamento livre', [95, 100, 105, 110, 115, 120]], ['Supino reto', [55, 60, 62.5, 65, 70]],
  ['Levantamento terra', [110, 120, 125, 135, 140]], ['Arremesso', [55, 60, 65, 70]],
].map(([exercicio, serie]: any, k) => ({
  id: `pr-${k}`, exercicio, peso_pr: serie[serie.length - 1], updated_at: stamp(addDaysISO(todayISO(), -4 - k * 3), '10:00'),
  history: serie.map((p: number, j: number) => ({ peso_pr: p, created_at: stamp(addDaysISO(todayISO(), -70 + j * 13 - k), '10:00') })),
}));

const RPC: Record<string, (a: Row) => any> = {
  athlete_login: () => sessaoAtleta(),
  athlete_get_session: () => sessaoAtleta(),
  athlete_set_password: () => sessaoAtleta(),
  athlete_logout: () => null,
  athlete_terms_status: () => ({ accepted_at: ATLETA.terms_accepted_at, version: TERMS_VERSION }),
  athlete_tutorial_pending: () => false,
  athlete_tutorial_done: () => null,
  athlete_save_push: () => null,
  athlete_my_profile: () => ({ nome: ATLETA.nome, display_name: 'Mariana', birth_date: '2004-03-18', photo_url: null }),
  athlete_home: () => {
    const today = todayISO();
    const psr = doAtleta('psr_records').find((r) => r.date === today);
    const peso = doAtleta('weight_records').find((r) => r.date === today);
    const ultimo = doAtleta('weight_records').sort((a, b) => cmp(b.date, a.date))[0];
    return {
      today,
      // ?pendente → bem-estar e peso de hoje ainda sem resposta (fotos dos formulários)
      psr: psr && !params.has('pendente') ? { id: psr.id, created_at: psr.created_at } : null,
      weight: peso && !params.has('pendente') ? { id: peso.id, weight: peso.weight, created_at: peso.created_at } : null,
      last_weight: ultimo ? { weight: ultimo.weight, date: ultimo.date } : null,
      pse: doAtleta('pse_records').filter((r) => r.date === today),
      weigh_day: params.has('pendente') || [1, 3, 5].includes(dow(today)),
      pr_catalog: true,
      sessions: db.training_sessions.filter((s) => s.date === today && paraAtleta(s)).sort((a, b) => cmp(a.start_time, b.start_time)),
    };
  },
  athlete_get_schedule: (a) => db.training_sessions.filter((s) => s.date >= a.p_from && s.date <= a.p_to && paraAtleta(s)).sort((x, y) => cmp(x.date + x.start_time, y.date + y.start_time)),
  athlete_get_history: (a) => ({
    pse: doAtleta('pse_records').filter((r) => r.date >= a.p_from && r.date <= a.p_to),
    psr: doAtleta('psr_records').filter((r) => r.date >= a.p_from && r.date <= a.p_to),
    weight: doAtleta('weight_records').filter((r) => r.date >= a.p_from && r.date <= a.p_to),
  }),
  athlete_list_prs: () => ({ catalog: db.club_exercises.filter((e) => e.exige_pr).map((e) => ({ id: e.id, nome: e.nome })), prs: prsAtleta() }),
  athlete_get_workout: (a) => ({
    prescriptions: db.workout_prescriptions.filter((p) => p.training_session_id === a.p_session).sort((x, y) => x.posicao - y.posicao),
    prs: prsAtleta().map((p) => ({ exercicio: p.exercicio, peso_pr: p.peso_pr })),
    completion: null,
  }),
  athlete_complete_workout: () => null,
  athlete_achievements: () => {
    const today = todayISO();
    const pse = doAtleta('pse_records');
    const dias = [...new Set([...pse, ...doAtleta('psr_records')].map((r) => r.date))].sort().reverse();
    const treinos = pse.filter((r) => !r.did_not_train).sort((a, b) => cmp(a.date, b.date));
    const marcos: Record<string, string> = {};
    [10, 50, 100].forEach((n) => treinos[n - 1] && (marcos[String(n)] = treinos[n - 1].date));
    const inicioMesAnterior = `${addDaysISO(today.slice(0, 8) + '01', -1).slice(0, 8)}01`;
    return {
      today, categoria: ATLETA.categoria, dias_respondidos: dias,
      dias_treino: [...new Set(db.training_sessions.filter((s) => s.date <= today && paraAtleta(s)).map((s) => s.date))].sort().reverse(),
      treinos: treinos.length, marcos_treinos: marcos,
      pse: pse.filter((r) => r.date >= inicioMesAnterior).map(({ date, training_type, rpe_score, duration_minutes, did_not_train }) => ({ date, training_type, rpe_score, duration_minutes, did_not_train })),
      pesos: doAtleta('weight_records').map(({ date, weight }) => ({ date, weight })),
      pesagens: db.competitions.map((c) => c.data_pesagem),
      prs: prsAtleta().map(({ exercicio, peso_pr, updated_at }) => ({ exercicio, peso_pr, updated_at })),
    };
  },
  athlete_body_composition: () => ({
    sexo: ATLETA.sexo,
    history: db.body_compositions.filter((b) => b.athlete_id === ATLETA.id).map((b) => ({ ...b, folds: { triceps: 14, subescapular: 12, peitoral: 9, axilar_media: 10, suprailiaca: 13, abdominal: 18, coxa: 21 } })),
  }),
  athlete_list_competitions: () =>
    db.competitions.filter(paraAtleta).map((c) => {
      const ultimo = doAtleta('weight_records').sort((a, b) => cmp(b.date, a.date))[0];
      return { ...c, categoria: ATLETA.categoria, peso_atual: ultimo?.weight ?? null, peso_data: ultimo?.date ?? null };
    }),
  athlete_list_competition_results: () =>
    db.competitions
      .filter((c) => c.tipo !== 'campo' && c.data <= todayISO() && paraAtleta(c))
      .map((c) => ({
        competition_id: c.id, nome: c.nome, data: c.data, data_pesagem: c.data_pesagem, hora_pesagem: c.hora_pesagem, local: c.local,
        categoria: ATLETA.categoria, result: c.resultado ?? null,
      })),
  athlete_save_competition_result: (a) => {
    const c = db.competitions.find((x) => x.id === a.p_competition_id);
    if (c) c.resultado = { id: uid(), colocacao: a.p_colocacao, lutas: a.p_lutas ?? null, vitorias: a.p_vitorias ?? null, derrotas: a.p_derrotas ?? null, updated_at: new Date().toISOString() };
    return null;
  },
  coach_competition_results_overview: () => [],
  // WHOOP: alguns atletas conectados, com 30 dias de números
  club_whoop_athletes: () =>
    WHOOP_IDS.map((id) => {
      const a = db.athletes.find((x) => x.id === id)!;
      const days = whoopDays(id);
      const last7 = days.slice(0, 7).map((d) => d.recovery_score);
      return {
        athlete_id: id, nome: a.nome, photo_url: null, classe: a.classe, categoria: a.categoria, active: true,
        whoop_name: a.nome.split(' ')[0], connected_at: stamp(addDaysISO(todayISO(), -40), '10:00'),
        last_sync_at: stamp(todayISO(), '06:30'), sync_error: false, last_day: days[0],
        recovery_7d: Math.round(last7.reduce((s, v) => s + v, 0) / last7.length),
      };
    }).sort((x, y) => x.nome.localeCompare(y.nome)),
  club_whoop_status: (args) =>
    WHOOP_IDS.includes(args.p_athlete_id)
      ? { connected: true, whoop_name: 'WHOOP', connected_at: stamp(addDaysISO(todayISO(), -40), '10:00'), last_sync_at: stamp(todayISO(), '06:30'), last_error: null, days: whoopDays(args.p_athlete_id) }
      : { connected: false, days: [] },
  athlete_list_adversarios: () => ({
    me: ATLETA.id,
    adversarios: db.adversarios.filter((a) => a.sexo === 'Feminino'),
    observacoes: db.adversario_observacoes,
  }),
  athlete_update_observacao: (a) => {
    const o = db.adversario_observacoes.find((x) => x.id === a.p_id);
    if (o) Object.assign(o, { texto: a.p_texto, editado_em: new Date().toISOString() });
    return null;
  },
  athlete_submit_pse: (a) => (db.pse_records.push({ id: uid(), athlete_id: ATLETA.id, date: a.p_date, training_type: a.p_training_type, rpe_score: a.p_rpe_score, did_not_train: a.p_did_not_train, duration_minutes: a.p_duration_minutes, observations: a.p_observations, created_at: new Date().toISOString() }), null),
  athlete_submit_psr: (a) => (db.psr_records.push({ id: uid(), athlete_id: ATLETA.id, date: a.p_date, psr_score: a.p_psr_score, fatigue_score: a.p_fatigue_score, sleep_score: a.p_sleep_score, muscle_soreness_score: a.p_muscle_soreness_score, stress_score: a.p_stress_score, mood_score: a.p_mood_score, created_at: new Date().toISOString() }), null),
  athlete_submit_weight: (a) => (db.weight_records.push({ id: uid(), athlete_id: ATLETA.id, date: a.p_date, weight: a.p_weight, created_at: new Date().toISOString() }), null),

  my_profile: () => ({ is_owner: false, support: null, coach: { nome: 'Paula Rezende', email: 'paula@carga.app', photo_url: null, role: 'admin', active: true, must_change_password: false, club: CLUB } }),
  current_club_id: () => CLUB_ID,
  coach_tutorial_pending: () => false,
  coach_tutorial_done: () => null,
  club_theme: () => null,
  coach_push_status: () =>
    db.athletes.filter((a) => a.active).map((a, k) => ({
      athlete_id: a.id, nome: a.nome, has_password: true, active_devices: k % 11 === 5 ? 0 : 1, expired_devices: k % 11 === 5 ? 1 : 0,
      last_sent_at: stamp(todayISO(), '07:00'), last_error: null, last_error_at: null,
    })),
  coach_competition_summary: () =>
    db.athletes.filter((a) => db.athlete_group_members.some((m) => m.athlete_id === a.id && m.group_id === G.sel)).map((a) => {
      const w = db.weight_records.filter((r) => r.athlete_id === a.id).sort((x, y) => cmp(y.date, x.date))[0];
      return { athlete_id: a.id, nome: a.nome, categoria: a.categoria, sexo: a.sexo, peso_atual: w?.weight ?? null, peso_data: w?.date ?? null };
    }),
};

// ---------- sessão do treinador ----------
const params = new URLSearchParams(window.location.search);
const modo = params.get('demo');
try {
  if (modo === 'atleta') localStorage.setItem('athlete_session_token', TOKEN);
  localStorage.setItem(`tutorial_visto_${ATLETA.id}`, '1');
  localStorage.setItem(`tutorial_visto_${COACH_ID}`, '1');
} catch {
  /* sem armazenamento */
}
const sessaoTreinador = modo === 'treinador'
  ? { access_token: 'demo', token_type: 'bearer', user: { id: COACH_ID, email: 'paula@carga.app', aud: 'authenticated' } }
  : null;

const ok = <T,>(data: T) => Promise.resolve({ data, error: null });

export function createClient(..._args: unknown[]) {
  return {
    from: (table: string) => new Query(table),
    rpc: (name: string, args: Row = {}) => {
      const fn = RPC[name];
      if (!fn) console.warn('[demo] rpc sem resposta:', name, args);
      return new Promise((res) => setTimeout(() => res({ data: fn ? fn(args) : null, error: null }), 60));
    },
    auth: {
      getSession: () => ok({ session: sessaoTreinador }),
      getUser: () => ok({ user: sessaoTreinador?.user ?? null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: () => ok({ session: sessaoTreinador, user: sessaoTreinador?.user ?? null }),
      signOut: () => ok(null),
      signUp: () => ok(null),
      updateUser: () => ok(null),
      resetPasswordForEmail: () => ok(null),
    },
    storage: {
      from: () => ({
        upload: () => ok({ path: '' }),
        remove: () => ok([]),
        list: () => ok([]),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    functions: { invoke: () => ok(null) },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel: () => undefined,
  };
}

export type SupabaseClient = ReturnType<typeof createClient>;
export type Session = any;
export type User = any;
