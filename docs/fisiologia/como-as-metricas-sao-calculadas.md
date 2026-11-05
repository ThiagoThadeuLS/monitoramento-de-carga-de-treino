# Como as métricas são calculadas

4 de novembro de 2026

## O que o atleta registra

Todas as métricas saem de três registros feitos pelo atleta no app, sempre com a data de hoje no horário de Brasília (o atleta não escolhe o dia).

| Registro | Escala | Frequência | Observação |
| --- | --- | --- | --- |
| PSE (percepção subjetiva de esforço) | 1 a 10 (escala de Foster / CR-10) | Uma por treino; várias no mesmo dia | Junto vai a duração em minutos (1 a 600) e o tipo: Técnico, Randori ou Físico. O app sugere a duração do treino do cronograma. O atleta pode marcar "não treinei" com motivo. |
| PSR (percepção subjetiva de recuperação / bem-estar) | 6 itens de 1 a 10, onde 10 é sempre o melhor estado | Uma por dia | Itens: Recuperação, Fadiga (10 = sem fadiga), Sono, Dor muscular (10 = sem dor), Estresse (10 = calmo) e Humor. |
| Peso | kg com uma casa decimal | Um por dia, nos dias de pesagem do clube | Comparado com o limite da categoria até a pesagem oficial. |

As contas descritas aqui são as mesmas do código enviado junto (arquivo metricas.ts), que reúne as funções usadas pelo sistema.

## Carga da sessão e carga diária

A carga interna segue o método de Foster: PSE × duração em minutos, em unidades arbitrárias (UA).

```latex
\text{Carga da sessão (UA)} = \text{PSE} \times \text{duração (min)}
```

```latex
\text{Carga diária}_d = \sum_{\text{sessões do dia } d} \text{PSE} \times \text{duração}
```

- A sessão fica fora da conta quando o atleta marcou "não treinei" ou quando falta a PSE ou a duração. A tela avisa quantas PSE ficaram sem duração no período.
- Os três tipos de treino (Técnico, Randori, Físico) entram juntos na carga diária, sem peso diferente.
- Dia sem nenhuma sessão conta como carga 0 nas janelas de 7 e 28 dias.

Exemplo: Randori de 90 min com PSE 7 (630 UA) + Físico de 60 min com PSE 5 (300 UA) = 930 UA no dia.

## ACWR (relação aguda : crônica)

O ACWR usa médias móveis simples (não exponenciais), com a semana atual incluída na crônica (modelo acoplado). D = data de referência escolhida na tela (padrão: hoje).

```latex
\text{Aguda} = \sum_{i=0}^{6} \text{Carga}_{D-i}
```

```latex
\text{Crônica} = \frac{1}{4}\sum_{i=0}^{27} \text{Carga}_{D-i}
```

```latex
\text{ACWR} = \frac{\text{Aguda}}{\text{Crônica}}
```

| Faixa | ACWR | Cor na tela |
| --- | --- | --- |
| Abaixo | menor que 0,8 | azul |
| Ideal | 0,8 a 1,3 | verde |
| Atenção | acima de 1,3 até 1,5 | amarelo |
| Risco | acima de 1,5 | vermelho |

- Sem carga nos últimos 28 dias, o ACWR fica vazio ("—").
- Se o primeiro registro do atleta tem menos de 21 dias, o nome aparece com "\*": o ACWR ainda é pouco confiável.
- **ACWR do grupo:** primeiro calcula a carga média diária por atleta (soma das cargas do dia ÷ número de atletas ativos da seleção, inclusive quem não treinou). Depois aplica as mesmas fórmulas a essa série média.
- A tela mostra 28 dias de gráfico e busca 56 dias de dados, para que cada ponto tenha os 28 dias de histórico da crônica.

## Monotonia e strain

Monotonia e strain usam os mesmos 7 dias da carga aguda, com dia sem treino valendo 0.

```latex
\bar{x} = \frac{\text{Aguda}}{7} \qquad \sigma = \sqrt{\frac{1}{7}\sum_{i=0}^{6}\left(\text{Carga}_{D-i} - \bar{x}\right)^2}
```

```latex
\text{Monotonia} = \frac{\bar{x}}{\sigma} \qquad \text{Strain} = \text{Aguda} \times \text{Monotonia}
```

- O desvio-padrão é o populacional (divide por 7, não por 6).
- Monotonia acima de 2 aparece em destaque ("semana pouco variada").
- Sem carga na semana, ou com todos os 7 dias iguais (desvio 0), monotonia e strain ficam vazios.
- A tabela também mostra quantos treinos com carga o atleta teve nos 7 dias.

## PSE e PSR nos gráficos e alertas

Os gráficos de período resumem cada dia com média, mediana ou moda das respostas de todos os atletas selecionados; dia sem resposta fica vazio (não vira 0).

| Indicador | Valor usado | Estatística |
| --- | --- | --- |
| PSE do grupo por dia | Nota de cada sessão ("não treinei" fica fora); um atleta com 2 treinos entra 2 vezes | Média ou moda, todos os tipos juntos ou um gráfico por tipo |
| PSE esperada | PSE planejada no cronograma para os treinos do dia | Média dos treinos do dia (só os treinos destinados aos atletas filtrados) |
| PSR do grupo por dia | Somente o item Recuperação | Média |
| Cartão "Hoje" do treinador | Todas as PSE do dia / Recuperação de cada PSR | Média com 1 casa |
| Ficha do atleta | Valores do próprio atleta | Média do dia |

- **Mediana:** valores ordenados; com quantidade par, média dos dois do meio.
- **Moda:** com empate, a linha mostra o maior valor e a dica mostra todos.
- **Alerta de PSE alta:** PSE acima de 6 no dia escolhido.
- **Alerta de PSR baixa:** pelo menos um dos 6 itens abaixo de 5 no dia escolhido.
- **Respostas em falta:** só conta dias com treino no cronograma destinado ao atleta e depois do prazo do clube (padrão 22h). Espera-se 1 PSR por dia de treino e 1 PSE por treino; resposta depois do prazo aparece como "atrasada". Cada treino programado é ligado à PSE do mesmo tipo, na ordem do horário; "não treinei" sem tipo vale para todos os treinos do dia.

## Peso e plano até a pesagem

O limite de peso cai em degraus conforme a pesagem oficial se aproxima, sempre em relação ao peso da categoria (ex.: -66 = 66 kg; categorias "+" não têm limite).

| Fase | Dias até a pesagem | Máximo acima da categoria | Exemplo -66 kg |
| --- | --- | --- | --- |
| Longe da competição | 14 ou mais | 8% | 71,2 kg |
| Semana anterior | 7 a 13 | 5% | 69,3 kg |
| Semana da competição | 1 a 6 | 3% | 67,9 kg |
| Dia da pesagem | 0 | 0% | 66,0 kg |

```latex
\text{Limite} = \left\lfloor \text{categoria} \times \left(1 + \frac{\%}{100}\right) \right\rfloor_{0,1\,\text{kg}}
```

| Status | Regra |
| --- | --- |
| No peso | Até 0,05 kg acima da categoria (tolerância de balança) |
| Dentro do limite | Abaixo do limite da fase atual |
| Atenção | Dentro do limite de agora, mas acima do limite da próxima fase, que começa em até 7 dias |
| Acima do limite | Acima do limite da fase (ou acima da categoria no dia da pesagem) |

- O limite é arredondado para baixo, em 0,1 kg.
- **Tendência semanal:** usa o primeiro e o último peso dos últimos 21 dias, se estiverem a 3 dias ou mais de distância: (último − primeiro) ÷ dias × 7. A projeção para a pesagem = peso atual + tendência × semanas restantes.
- Última pesagem com mais de 14 dias: o app pede um registro novo.

## Filtros e períodos

Todas as telas do treinador usam o mesmo filtro de atletas, e cada tela tem seu próprio recorte de datas.

| Tela | Período | Quem entra |
| --- | --- | --- |
| Carga (ACWR, monotonia) | Data de referência escolhida; usa os 56 dias anteriores | Atletas ativos da seleção |
| Período (gráficos de PSE e PSR) | De / até, no máximo 1 ano; atalhos Hoje, 7, 15 e 30 dias (padrão: 14 dias) | Seleção; filtro extra por tipo de treino |
| Alertas do dia | Um dia só, separado do período | Seleção |
| Hoje | Um dia | Atletas ativos da seleção |
| Ficha do atleta | Período escolhido; carga sempre até hoje | O próprio atleta |

- **Filtro de atletas:** une os grupos marcados e os atletas marcados (um atleta em dois grupos conta uma vez). Nada marcado = todos.
- **Público dos treinos:** cada treino do cronograma vale para todos, só para certos grupos/atletas ou para todos exceto alguns. Isso define a PSE esperada mostrada e quem deveria responder.
- **Datas:** sempre no horário de Brasília; a data da resposta é a do dia do envio, definida pelo servidor.

## Pontos para validação da fisiologia

Estas são as escolhas de cálculo que mais mudam o resultado e que pedimos para a fisiologia confirmar ou ajustar.

- [ ] **ACWR por média móvel simples e acoplada.** A alternativa é média exponencial (EWMA) ou crônica sem a semana atual. Qual modelo o clube prefere?
- [ ] **Faixas do ACWR** (0,8 / 1,3 / 1,5) e **limite de monotonia** (2): servem para o judô deste elenco?
- [ ] **ACWR do grupo** divide a carga pelo total de atletas selecionados, inclusive quem está sem registros (lesionado, viajando). Isso puxa a média para baixo. Devemos contar só quem registrou?
- [ ] **PSE sem duração** fica fora da carga (a tela avisa quantas). Usar a duração do cronograma no lugar?
- [ ] **Tipos de treino com o mesmo peso** na carga (Técnico, Randori, Físico). Deveriam ser separados ou ponderados?
- [ ] **Gráfico de PSR usa só o item Recuperação.** Criar um índice de bem-estar com os 6 itens (soma ou média)?
- [ ] **Alertas com limite fixo** (PSE acima de 6; item da PSR abaixo de 5) igual para todos. Comparar com a média do próprio atleta (ex.: z-score) seria mais sensível?
- [ ] **Dados insuficientes:** ACWR marcado como pouco confiável com menos de 21 dias de histórico. O prazo está bom?
- [ ] **Plano de peso:** percentuais 8% / 5% / 3% por fase e tolerância de 0,05 kg seguem a regra atual do clube; confirmar.
