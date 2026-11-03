import React from 'react';
import { TourStep } from './Tour';

const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <strong className="text-white">{children}</strong>;
const List: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="space-y-1">
    {items.map((it, k) => (
      <li key={k} className="flex gap-2">
        <span className="text-sky-400 flex-shrink-0">•</span>
        <span>{it}</span>
      </li>
    ))}
  </ul>
);

type AthleteTab = 'pse' | 'psr' | 'weight' | 'schedule' | 'history' | 'adversarios';

/** Tour do atleta: passa por todas as abas e explica cada uma. */
export function athleteTourSteps(nome: string, setTab: (t: AthleteTab) => void): TourStep[] {
  const first = nome.split(' ')[0];
  return [
    {
      title: `Bem-vindo, ${first}!`,
      body: (
        <>
          <p>Este é o app de monitoramento de carga do seu clube. Em poucos passos vamos mostrar cada tela e para que ela serve.</p>
          <p>Suas respostas ajudam a comissão técnica a ajustar a carga de treino e prevenir lesões.</p>
        </>
      ),
      before: () => setTab('psr'),
    },
    {
      target: 'athlete-card',
      title: 'Seu perfil',
      body: <p>Aqui aparecem seu nome, classe e categoria. O botão <B>Sair</B> encerra o acesso neste aparelho — os lembretes continuam chegando.</p>,
    },
    {
      target: 'athlete-tabs',
      title: 'As abas',
      body: (
        <List
          items={[
            <><B>PSE</B>: esforço de cada treino</>,
            <><B>PSR</B>: como você está antes de treinar</>,
            <><B>Peso</B>: registro de pesagem</>,
            <><B>Agenda</B>: treinos programados para você</>,
            <><B>Histórico</B>: suas respostas e sua evolução</>,
            <><B>Adversários</B> (Rivais no celular): fichas de quem você pode enfrentar</>,
          ]}
        />
      ),
    },
    {
      target: 'athlete-form',
      before: () => setTab('psr'),
      title: 'PSR — bem-estar',
      body: (
        <>
          <p>
            Responda <B>uma vez por dia, antes do primeiro treino</B>. Arraste cada barra de 1 (muito ruim) a 10 (excelente): recuperação, disposição,
            sono, dor muscular, estresse e humor.
          </p>
          <p>Seja sincero: notas abaixo de 5 viram alerta para a comissão técnica.</p>
        </>
      ),
    },
    {
      target: 'athlete-form',
      before: () => setTab('pse'),
      title: 'PSE — esforço do treino',
      body: (
        <>
          <p>
            Responda <B>depois de cada treino</B>: escolha o tipo (técnico, randori ou físico), confira a <B>duração</B> em minutos (já vem do cronograma) e
            dê uma nota de 1 a 10 para o quanto foi pesado. Se teve dois treinos, envie duas respostas.
          </p>
          <p>A nota × a duração é a sua <B>carga de treino</B>, que a comissão técnica acompanha.</p>
          <p>
            Se não treinou, marque <B>Não treinei</B> e escreva o motivo — ele é obrigatório.
          </p>
        </>
      ),
    },
    {
      target: 'athlete-form',
      before: () => setTab('weight'),
      title: 'Peso',
      body: <p>Nos dias de pesagem definidos pelo clube, registre seu peso em quilos, como aparece na balança (ex.: 72,5).</p>,
    },
    {
      target: 'athlete-schedule',
      before: () => setTab('schedule'),
      title: 'Agenda da semana',
      body: (
        <>
          <p>Mostra só os treinos destinados a você, com horário, tipo e PSE esperada. Use as setas para ver a semana passada e a próxima.</p>
          <p>
            Quando o treino tiver <B>Ver anotações</B>, toque nele para ler o recado do treinador.
          </p>
        </>
      ),
    },
    {
      target: 'athlete-history',
      before: () => setTab('history'),
      title: 'Histórico',
      body: (
        <>
          <p>Veja suas respostas e a evolução da PSE, PSR, carga e peso nos últimos 7, 30 ou 90 dias.</p>
          <p>
            Enviou algo errado hoje? Toque em <B>Corrigir</B>: a resposta é apagada e o formulário abre para enviar de novo. Lá embaixo fica o{' '}
            <B>termo de uso dos dados</B> que você aceitou.
          </p>
        </>
      ),
    },
    {
      target: 'athlete-adversaries',
      before: () => setTab('adversarios'),
      title: 'Adversários',
      body: (
        <>
          <p>Fichas de atletas de outros clubes e países: categoria, classe e origem. Busque e filtre para estudar quem você pode enfrentar.</p>
          <p>
            Toque num adversário para ver os detalhes e deixar <B>observações táticas</B>. Você também pode cadastrar um adversário novo e apagar as
            observações que escreveu.
          </p>
          <p>
            <B>Apagar para mim</B> tira a ficha só da sua lista (dá para trazer de volta em &quot;Apagados para mim&quot;).
          </p>
        </>
      ),
    },
    {
      before: () => setTab('pse'),
      title: 'Lembretes no celular',
      body: (
        <List
          items={[
            <><B>PSR</B>: a partir do horário de início definido pelo clube, nos dias de treino</>,
            <><B>PSE</B>: 20 minutos depois do fim de cada treino</>,
            <><B>Peso</B>: nos dias e horário de pesagem</>,
            <>Sem resposta, o aviso <B>se repete a cada 20 minutos</B>.</>,
          ]}
        />
      ),
    },
    {
      target: 'help',
      title: 'Pronto!',
      body: <p>Sempre que tiver dúvida, toque neste botão <B>?</B> para ver o tour de novo.</p>,
    },
  ];
}

type CoachTab = 'overview' | 'period' | 'load' | 'schedule' | 'management' | 'adversaries';
type Section = 'athletes' | 'groups' | 'team' | 'colors';

/** Tour do treinador: passa por todas as abas e seções da gestão. */
export function coachTourSteps(
  nome: string,
  isAdmin: boolean,
  setTab: (t: CoachTab) => void,
  setSection: (s: Section) => void
): TourStep[] {
  const first = nome.split(' ')[0];
  const go = (t: CoachTab, s?: Section) => () => {
    setTab(t);
    if (s) setSection(s);
  };
  const steps: (TourStep | false)[] = [
    {
      title: `Bem-vindo, ${first}!`,
      before: go('overview'),
      body: (
        <>
          <p>Vamos passar por todas as telas do painel da comissão técnica e explicar o que cada uma faz.</p>
          <p>O tour só mostra — nada é alterado.</p>
        </>
      ),
    },
    {
      target: 'coach-banner',
      title: 'Seu painel',
      body: <p>Mostra o clube, seu nome e seu papel (<B>admin do clube</B> ou <B>treinador</B>). O admin também gerencia treinadores e cores.</p>,
    },
    {
      target: 'coach-tabs',
      title: 'As abas',
      body: (
        <List
          items={[
            <><B>Dia</B>: respostas de hoje</>,
            <><B>Período</B>: gráficos, alertas e quem não respondeu</>,
            <><B>Carga</B>: carga interna, ACWR, monotonia e strain</>,
            <><B>Agenda</B>: cronograma e horário dos avisos</>,
            <><B>Adversários</B>: fichas de atletas de outros clubes</>,
            <><B>Gestão</B>: atletas, grupos, treinadores e cores</>,
          ]}
        />
      ),
    },
    {
      target: 'daily-filters',
      before: go('overview'),
      title: 'Dia: escolha a data e os atletas',
      body: <p>Escolha o dia e filtre por grupos ou pessoas específicas. <B>Atualizar dados</B> busca as respostas mais recentes.</p>,
    },
    {
      target: 'daily-cards',
      title: 'Resumo do dia',
      body: <p>Quantos atletas responderam PSE, PSR e peso, com as médias do dia, e o total do elenco ativo.</p>,
    },
    {
      target: 'daily-table',
      title: 'Acompanhamento individual',
      body: (
        <>
          <p>Todas as respostas de cada atleta no dia: cada PSE com o tipo de treino, a PSR e o peso.</p>
          <p>
            Alertas automáticos: <B>dor muscular</B>, <B>fadiga alta</B> e <B>esforço máximo</B>. Toque no <B>nome</B> para abrir a ficha completa do
            atleta.
          </p>
        </>
      ),
    },
    {
      target: 'period-filters',
      before: go('period'),
      title: 'Período: filtros',
      body: (
        <List
          items={[
            <>Datas <B>De / Até</B> ou atalhos (Hoje, 7, 15, 30 dias)</>,
            <>Filtro por <B>grupos ou pessoas</B> — vale para toda a tela</>,
            <>Tipos de treino e modo <B>condensado</B> ou <B>por tipo</B> nos gráficos de PSE</>,
            <><B>Exportar</B>: baixa PSE (com carga), PSR ou peso em planilha para o Excel</>,
          ]}
        />
      ),
    },
    {
      target: 'period-charts',
      title: 'Gráficos de PSE e PSR',
      body: (
        <p>
          Evolução diária do grupo. Nas setas do gráfico de PSE você alterna entre <B>média</B> e <B>moda</B>. A linha tracejada é a <B>PSE esperada</B> do
          cronograma, para comparar com o que os atletas sentiram. Toque num dia para ver os valores.
        </p>
      ),
    },
    {
      target: 'period-missing',
      title: 'Sem resposta no prazo',
      body: (
        <p>
          Quem não respondeu PSR ou PSE de cada treino até o fim do horário das notificações. Quem respondeu depois aparece como <B>Atrasado</B>.
        </p>
      ),
    },
    {
      target: 'period-day',
      title: 'Alertas de um dia',
      body: (
        <List
          items={[
            <><B>PSE acima de 6</B></>,
            <><B>Não treinaram</B> — toque para ler o motivo</>,
            <><B>PSR abaixo de 5</B> em qualquer variável</>,
          ]}
        />
      ),
    },
    {
      target: 'load-filters',
      before: go('load'),
      title: 'Carga interna',
      body: (
        <>
          <p>
            A carga de cada treino é <B>PSE × duração em minutos</B> (método de Foster), em UA. Escolha até que dia calcular e quais atletas; o botão{' '}
            <B>Exportar</B> baixa a tabela.
          </p>
          <p>“Como ler os indicadores” explica cada número.</p>
        </>
      ),
    },
    {
      target: 'load-cards',
      title: 'Resumo da carga',
      body: (
        <List
          items={[
            <>Carga média dos últimos 7 dias por atleta</>,
            <><B>ACWR</B> do grupo: carga dos 7 dias ÷ média semanal dos 28 dias. Zona ideal: 0,8 a 1,3</>,
            <>Quantos estão <B>em risco</B> (ACWR acima de 1,5) e com <B>monotonia alta</B> (acima de 2)</>,
          ]}
        />
      ),
    },
    {
      target: 'load-table',
      title: 'Carga por atleta',
      body: (
        <p>
          Carga aguda, crônica, ACWR, monotonia e strain de cada atleta. Toque no atleta para abrir a <B>ficha</B>: gráficos de carga, ACWR, PSE, PSR e
          peso, com exportação.
        </p>
      ),
    },
    {
      target: 'schedule-reminders',
      before: go('schedule'),
      title: 'Agenda: horário dos avisos e pesagem',
      body: (
        <>
          <p>
            Defina <B>das … às …</B>: a PSR começa a ser cobrada no início, e quem não responder até o fim entra na tabela “Sem resposta”.
          </p>
          <p>Marque também os dias e o horário do lembrete de pesagem.</p>
        </>
      ),
    },
    {
      target: 'schedule-week',
      title: 'Cronograma da semana',
      body: (
        <>
          <p>
            Programe a semana passada, a atual e a próxima (as mais antigas são apagadas). Cada treino tem horário, tipo, <B>PSE esperada</B>, anotações e
            <B> para quem</B>: todos, somente alguns grupos/pessoas ou todos exceto.
          </p>
          <p>O horário de fim define quando sai o lembrete de PSE. Toque num treino para ver detalhes e editar.</p>
        </>
      ),
    },
    {
      target: 'coach-content',
      before: go('adversaries'),
      title: 'Atletas adversários',
      body: (
        <>
          <p>Fichas de atletas de outros clubes ou países: categoria, classe, origem e observações (estilo de luta, pontos fortes). Busque e filtre por classe e origem.</p>
          <p>
            Não quer ver uma ficha? <B>Apagar para mim</B> tira só da sua lista; os outros continuam vendo. Quem cadastrou pode <B>excluir para todos</B>.
          </p>
        </>
      ),
    },
    {
      target: 'management-tabs',
      before: go('management', 'athletes'),
      title: 'Gestão: atletas',
      body: (
        <p>
          Cadastre atletas com <B>CPF</B>. Eles entram com o CPF e a senha inicial é o <B>nome completo junto, em minúsculas</B>; no primeiro acesso criam a
          própria senha e aceitam o termo de uso dos dados. Você também pode abrir a <B>ficha</B>, editar, voltar a senha para a inicial e{' '}
          <B>inativar</B> (bloqueia o acesso e mantém o histórico — excluir apaga tudo).
        </p>
      ),
    },
    {
      target: 'coach-content',
      before: go('management', 'groups'),
      title: 'Gestão: grupos',
      body: <p>Crie grupos (ex.: Pesados, Sub-18). Um atleta pode estar em vários. Os grupos servem para programar treinos e filtrar as análises.</p>,
    },
    isAdmin && {
      target: 'coach-content',
      before: go('management', 'team'),
      title: 'Gestão: treinadores',
      body: <p>Cadastre outros treinadores do clube (eles recebem uma senha temporária), defina quem é admin, desative acessos e troque o escudo do clube.</p>,
    },
    isAdmin && {
      target: 'coach-content',
      before: go('management', 'colors'),
      title: 'Gestão: cores',
      body: <p>Escolha uma paleta pronta ou informe o hexadecimal das suas cores. Vale para todos os treinadores e atletas do clube.</p>,
    },
    {
      target: 'help',
      before: go('overview'),
      title: 'Pronto!',
      body: <p>Sempre que tiver dúvida, toque neste botão <B>?</B> para ver o tour de novo.</p>,
    },
  ];
  return steps.filter(Boolean) as TourStep[];
}
