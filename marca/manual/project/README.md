# Carga

**Treine com medida.**

Carga é o app de monitoramento de carga de treino. O atleta registra no celular o esforço de cada treino (PSE), o bem-estar (PSR) e o peso. A comissão técnica acompanha o elenco, planeja a semana e vê a carga de cada atleta antes que ela vire lesão. Piloto em 2026 com uma equipe de judô de alto rendimento; serve para qualquer modalidade.

![Logo horizontal sobre fundo escuro](/_blob/a98b0e0ea8947e3546dc83c8e38e941a)

## Essência

| | |
|---|---|
| **Promessa** | O esforço de cada treino, medido. |
| **Para quem** | Comissões técnicas de clubes (quem contrata) e atletas (quem usa todo dia). |
| **O que nos diferencia** | Compara o treino **planejado** com o treino **percebido**, com métodos que a preparação física já usa (PSE da sessão, ACWR, monotonia). |
| **Personalidade** | Preciso como um preparador físico, direto como um técnico na beira do tatame, leve como um app de celular. |
| **Não somos** | Um app de "bem-estar" genérico, uma rede social de treino ou uma planilha bonita. |

**Assinatura:** "Treine com medida." O duplo sentido é proposital: medir o treino e treinar sem exagero.

## Logo

### O símbolo: a barra carregada

Uma barra com anilhas que crescem da ponta para o centro. Lida de longe, é um gráfico subindo; de perto, é a carga na barra. As duas leituras são o produto: **carga de treino** medida em números.

![Símbolo](/_blob/b422fb2c476f85fc8542e4877907b2ea)

Construção numa grade de 64:

- barra: 56 × 6, cantos 3
- anilhas: 7 × 20, 8 × 34 e 9 × 48 (cada uma cerca de 70% maior que a anterior), cantos 2,5
- presilha: 4 × 16, cantos 2
- a barra passa 4 unidades para fora da primeira anilha e 15 depois da presilha

### A palavra

"carga" é desenhada (não é fonte): traço único de 10 sobre altura de x de 36, terminações retas, "a" de um andar. Sempre em minúsculas. Nunca recrie a palavra com uma fonte: use os arquivos.

### Versões

| Versão | Quando usar |
|---|---|
| Horizontal escura | Padrão. Sites, cabeçalhos, apresentações em fundo `noite`. |
| Horizontal clara | Fundos claros (`gelo`, branco). Documentos e impressos. |
| Vertical | Espaços quadrados ou altos: capas, crachás, camisetas. |
| Símbolo | Avatar, ícone do app, marca-d'água, favicon. |
| Branca / preta | Uma cor só: carimbo, bordado, gravação a laser, fundo de foto. |

### Regras

- **Área de proteção:** em volta do logo, deixe livre a altura da anilha maior do símbolo.
- **Tamanho mínimo:** horizontal com 96 px (ou 25 mm) de largura; símbolo com 16 px.
- **Não faça:** mudar as cores do símbolo, separar as anilhas, girar, esticar, pôr sombra ou contorno, usar a palavra com outra fonte, aplicar sobre foto sem contraste (use a versão branca sobre área escura da foto).

## Cores

A base é a noite do ginásio: azul-marinho quase preto, com um azul elétrico como única cor de marca. As cores quentes são reservadas para a **escala de esforço**: só aparecem quando falam de PSE, carga ou risco.

| Token | Hex | Uso |
|---|---|---|
| `noite` | #050B18 | Fundo principal da marca. |
| `profundo` | #0B1426 | Cartões, ícone do app, áreas elevadas. |
| `linha` | #1B2A44 | Bordas finas e divisões no escuro. |
| `gelo` | #EAF2FA | Texto forte no escuro; fundo das faixas claras. |
| `nevoa` | #8DA2BF | Texto secundário e rótulos no escuro. |
| `azul` | #38BDF8 | Cor da marca: símbolo, botões, palavra destacada. |
| `azul-tinta` | #0369A1 | O azul em texto sobre fundos claros (contraste). |

### Escala de esforço (CR-10)

A escala de 0 a 10 vai do frio ao quente. É a assinatura visual da marca nos posts e no app: barras que crescem e mudam de cor com o esforço.

| Token | Hex | Notas da escala |
|---|---|---|
| `pse-0` | #38BDF8 | 0–1 · Repouso, muito fácil |
| `pse-2` | #2DD4BF | 2–3 · Fácil, moderado |
| `pse-4` | #A3E635 | 4–5 · Um pouco difícil, difícil · zona segura do ACWR |
| `pse-6` | #FACC15 | 6–7 · Muito difícil · atenção |
| `pse-8` | #FB923C | 8–9 · Acima do planejado |
| `pse-10` | #F43F5E | 10 · Máximo · risco alto |

Proporção numa peça: cerca de 70% `noite`/`profundo`, 20% `gelo` (texto), 10% `azul`. A escala entra só onde há dado.

## Tipografia

| Papel | Fonte | Como |
|---|---|---|
| Títulos | **Archivo Expanded** (Google Fonts, eixo de largura em 125%) | Peso 850–900, entrelinha 0,9–1, espaçamento −2%. Uma palavra-chave em `azul`. |
| Texto | **Archivo** (largura normal) | Peso 400–750, 15–20 px, entrelinha 1,5–1,6. |
| Números e rótulos | **Martian Mono** | Notas, minutos, UA, datas. Rótulos em maiúsculas com espaçamento +8%. |

Uma família só para títulos e texto mantém tudo coeso; a monoespaçada deixa os números com cara de instrumento de medida.

## Voz

Fala como um bom preparador físico: número na frente, frase curta, sem jargão de tecnologia. Português do Brasil.

| Faça | Evite |
|---|---|
| "Responda a PSE em 10 segundos." | "Registre sua percepção subjetiva de esforço de forma ágil." |
| "A carga subiu rápido demais?" | "Insights inteligentes sobre sua performance!" |
| "Cada clube vê só os próprios dados." | "Segurança de nível empresarial." |
| "PSE 7 × 90 min = 630 UA" | "Calcule sua carga com nossa tecnologia." |

Regras: verbos no imperativo para o atleta ("Responda", "Pese-se"); explique cada sigla na primeira vez (PSE, PSR, ACWR); cite o método quando falar de ciência (Foster, Gabbett); nada de emoji como enfeite; nunca prometa "prevenir lesões": o Carga **mostra o risco**, quem decide é a comissão.

## Ícones

Traço de 2 px com pontas arredondadas, no estilo Lucide (o mesmo do app). Ícones em `azul` sobre `profundo`, ou em `noite` sobre `azul` quando ativos. Nada de ícones preenchidos coloridos ou ilustrações 3D.

## Movimento

A marca se move como uma barra sendo carregada: a barra entra primeiro, as anilhas encaixam uma a uma com um leve quique (0,6 s, curva elástica). Números contam até o valor. Gráficos crescem de baixo para cima. Sempre respeite "reduzir movimento" do aparelho.

## Instagram

**Perfil:** `@carga.app` (confirme se está livre antes de criar). Nome: **Carga · Carga de treino**.

**Bio (até 150 caracteres):**

> Treine com medida.
> O atleta registra o esforço; a comissão vê a carga do elenco.
> PSE · PSR · ACWR · lembretes
> ↓ Leve para o seu clube

**Foto de perfil:** símbolo azul centrado sobre `noite` (arquivo `perfil.png`).

**Destaques:** Como usar · Atletas · Comissão · Ciência · Novidades (capas prontas).

**Grade de lançamento:** 9 posts em 4:5 (1080 × 1350). Publique na ordem 01 → 09; no perfil o 09 fica no topo e a grade fecha com o 01 embaixo à direita.

![Prévia da grade](/_blob/6e34193a441135cd553afe51c33cb76b)

### Legendas de lançamento

1. **Treine com medida.** Chegou o Carga: o atleta conta como foi o treino e a comissão técnica vê a carga do elenco inteiro. Sem planilha, sem relato de memória.
2. **De 0 a 10, quanto pesou o treino?** É a PSE, a percepção subjetiva de esforço. Uma nota simples que, somada ao tempo de treino, vira um dos indicadores mais usados na preparação física.
3. **Esforço × tempo = carga.** PSE 7 num treino de 90 minutos = 630 UA (unidades arbitrárias). É o método de Foster, e o Carga faz a conta sozinho a cada treino.
4. **A carga subiu rápido demais?** O ACWR compara a semana atual com a média das quatro anteriores. Entre 0,8 e 1,3, zona segura. Acima de 1,5, atenção redobrada.
5. **O lembrete chega depois do treino.** Bem-estar antes, PSE depois e aviso no dia da pesagem, no horário que o clube escolher.
6. **O elenco inteiro numa tela.** Quem respondeu, quem treinou acima do planejado e quem ainda não deu sinal. (Dados ilustrativos.)
7. **Chegou recuperado ao treino?** A PSR mostra como o atleta chega: de 0 (nada recuperado) a 10 (pronto para tudo). Dá tempo de ajustar o treino antes de começar.
8. **Sem loja. Instala pelo navegador.** Abra o link do clube, adicione à tela de início e permita as notificações. Funciona no iPhone (iOS 16.4+) e no Android.
9. **Leve o Carga para o seu clube.** Cada clube vê só os próprios dados. Fale com a gente pelo link na bio ou pelo Direct.

**Hashtags (no primeiro comentário):** #preparacaofisica #cargadetreino #PSE #cienciadoesporte #judo #treinamentoesportivo #monitoramento #altorendimento

### Stories

Dois modelos em 9:16: **Dica de treino** e **Aviso** (ex.: dia de pesagem). Mantêm 220 px livres em cima e 260 px embaixo para a interface do Instagram.

## Arquivos

No repositório do app, pasta `marca/`: `logo/` (SVG de todas as versões), `instagram/` (PNG prontos para postar) e os scripts `gerar-logos.mjs` e `gerar-instagram.mjs`, que recriam tudo a partir destas cores e fontes. O site institucional fica em `site/`.
