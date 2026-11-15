# Publicação dos apps iOS e Android

Este guia cobre a publicação do **Carga** nas lojas usando o mesmo código React/Vite da versão web. A versão publicada na Vercel continua igual: as mudanças nativas só entram em ação dentro do app instalado.

> **Handoff (15/11/2026):** o trabalho nativo está na branch `feat/capacitor-ios-android`, commit `8e71f49`, e ainda **não foi enviado ao remoto**. Quem for continuar deve usar o **HEAD dessa branch** (`git switch feat/capacitor-ios-android`), não a `main`. O passo a passo completo para outra IA está na **seção 9**.

## O que já está no repositório

- Capacitor 8 com projetos `ios/` e `android/`.
- Identificadores (provisórios, troque antes de criar os registros nas lojas):
  - Bundle ID / Application ID: `br.com.monitoramentocarga.app`
  - Nome exibido: `Carga`
- OneSignal (`@onesignal/capacitor-plugin`) com o atleta identificado pelo id da tabela `athletes` (External ID).
- Deep link `br.com.monitoramentocarga.app://` declarado no iOS e no Android.
- Ícones, splash screens e ícone de notificação do Android gerados a partir de `resources/`.
- Permissões de câmera e fotos no iOS, notificações no Android e textos em português.
- Entitlements do iOS (`Push Notifications` + App Group `group.br.com.monitoramentocarga.app.onesignal`).
- Assinatura Android opcional via `android/keystore.properties` (fora do Git).
- Edge Function `enviar-lembretes` envia para Web Push e para o OneSignal, sem quebrar a web quando o OneSignal não está configurado.

## O que depende de você

1. Conta no **Apple Developer Program** (US$ 99/ano) e acesso ao **App Store Connect**.
2. Conta no **Google Play Console** (US$ 25 único).
3. Conta no **OneSignal** (o plano gratuito atende o piloto; veja custos e limites na seção 2).
4. Projeto no **Firebase** (gratuito) para o FCM do Android.
5. Um Mac com **Xcode** e um computador com **Android Studio** para gerar os builds assinados.
6. Chave de assinatura Android (keystore) — guarde com backup. Com Play App Signing, ela é a chave de upload; se for perdida, o Google pode permitir um reset, mas o processo é lento e nem sempre está disponível.

## 1. Variáveis de ambiente do build

As variáveis `VITE_*` são gravadas no pacote no momento do build. Crie um `.env.local` na raiz (não versionado) com:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_VAPID_PUBLIC_KEY=...            # Web Push (Vercel)
VITE_PUBLIC_APP_URL=https://monitoramento-coral.vercel.app
VITE_ONESIGNAL_APP_ID=...            # OneSignal > Settings > Keys & IDs
```

Depois rode:

```bash
npm run native:sync       # build + copia o site para ios/ e android/
```

`VITE_ONESIGNAL_APP_ID` é obrigatório no build de loja. Sem ele, o app abre, mas a tela de notificações informa que os lembretes não estão configurados.

## 2. OneSignal

1. Crie um app no OneSignal e anote o **App ID**.
2. Em **Settings > Push & In-App**, configure:
   - **Apple (APNs)**: chave `.p8` do Apple Developer (recomendado) com Key ID e Team ID.
   - **Google (FCM)**: conta de serviço do Firebase (Service Account JSON).
3. Em **Settings > Keys & IDs**, copie também a **REST API Key**.
4. No Supabase, cadastre os segredos da Edge Function (não use `VITE_` aqui):

```bash
npx supabase secrets set \
  ONESIGNAL_APP_ID=... \
  ONESIGNAL_REST_API_KEY=...
npx supabase functions deploy enviar-lembretes
```

Sem esses segredos, a função continua enviando apenas Web Push (Vercel). Com eles, envia também para os apps, usando o id do atleta como External ID.

### iOS no Xcode (uma vez)

O projeto já tem `App.entitlements` com `aps-environment` e o App Group. No Xcode, abra `ios/App/App.xcodeproj` e confirme:

1. Target **App** > **Signing & Capabilities**:
   - Team da sua conta Apple.
   - **Push Notifications**.
   - **Background Modes** > **Remote notifications**.
   - **App Groups** > `group.br.com.monitoramentocarga.app.onesignal`.
2. Ainda falta criar manualmente (exige Xcode):
   - **File > New > Target > Notification Service Extension**, nome `OneSignalNotificationServiceExtension`, mínimo iOS 15.
   - No target da extensão: mesma App Group, e substituir `NotificationService.swift` pelo código da [documentação do OneSignal](https://documentation.onesignal.com/docs/en/capacitor-sdk-setup#4-add-notification-service-extension).
   - A extensão habilita entrega confirmada e imagens em notificações. Os lembretes atuais (texto) funcionam sem ela, mas a recomendação é incluí-la antes de publicar.
   - Passo a passo detalhado, incluindo Bundle ID, assinatura e ordem das Build Phases: **seção 9.7**.

> O Capacitor 8 usa Swift Package Manager. O OneSignal já está resolvido via SPM, então não é necessário `pod install`.

### Custos e limites do OneSignal

O OneSignal **não é usado pela versão web**; ele atende apenas os apps iOS/Android. Por isso, o limite de web push do OneSignal não se aplica a este projeto.

**Plano Free (US$ 0/mês)** — suficiente para o piloto:

- push mobile ilimitado para organizações com até **1.000 MAU** (usuários ativos mensais);
- envios ilimitados pela API;
- MAU é qualquer pessoa que abriu o app mobile nos últimos 30 dias, **mesmo sem ter aceitado notificações**; a conta soma todos os clubes;
- web push do OneSignal: até 10.000 inscritos por envio (não usado aqui).

**Growth (a partir de US$ 19/mês)** — necessário se passar de 1.000 MAU ou precisar de recursos extras:

- cobrança por MAU de mobile push (atualmente US$ 0,012/MAU);
- confirme o valor no simulador do OneSignal antes de contratar.

**Outros custos da publicação:**

- Apple Developer: US$ 99/ano.
- Google Play Console: US$ 25 único.
- Firebase/FCM: US$ 0.
- Supabase/Vercel: mantidos como estão.

> Valores consultados em 15/11/2026. Preços podem mudar; confira [onesignal.com/pricing](https://onesignal.com/pricing) antes de contratar.

O plano Free é US$ 0, mas o app nativo só recebe push depois que o OneSignal estiver configurado com APNs/FCM e o build tiver `VITE_ONESIGNAL_APP_ID`. Sem isso, a web continua normal e o app nativo mostra “notificações não configuradas”.

## 3. Android

1. Baixe o `google-services.json` do **mesmo projeto Firebase** usado no OneSignal e coloque em `android/app/google-services.json` (ignorado pelo Git).
2. Rode `npm run native:sync` e abra `npm run native:android`.
3. Confira em **Android Studio**:
   - `applicationId` = `br.com.monitoramentocarga.app`
   - `versionCode` e `versionName` em `android/app/build.gradle`
   - minSdk 24, targetSdk 36
4. Gere a keystore de upload (guarde o arquivo e as senhas):

```bash
keytool -genkeypair -v -keystore carga-upload.jks -alias carga \
  -keyalg RSA -keysize 2048 -validity 10000
```

5. Crie `android/keystore.properties` (fora do Git). O caminho de `storeFile` é relativo a `android/app/`:

```properties
storeFile=../../carga-upload.jks
storePassword=...
keyAlias=carga
keyPassword=...
```

Sem esse arquivo o build de debug continua funcionando normalmente.

6. Gere o **Android App Bundle**:

```bash
cd android
./gradlew bundleRelease
# saída: app/build/outputs/bundle/release/app-release.aab
```

## 4. App Store Connect

1. Em **Apps > + > New App**: plataforma iOS, nome `Carga`, bundle ID `br.com.monitoramentocarga.app`, SKU livre.
2. No Xcode: destino **Any iOS Device (arm64)** > **Product > Archive** > **Distribute App > App Store Connect**.
3. Preencha na ficha:
   - Categoria: **Health & Fitness** (ou Esportes).
   - Classificação etária e política de privacidade: `https://monitoramento-coral.vercel.app/privacidade`.
   - **App Privacy**: declare dados de saúde/fitness (PSE, bem-estar, peso, sono/WHOOP), contato (nome, CPF/e-mail), fotos e identificadores. O app não usa dados para rastreamento publicitário; marque “Não” para tracking.
   - **Criptografia**: já declarado `ITSAppUsesNonExemptEncryption = false`.
4. Envie para revisão com uma **conta de teste** de atleta e uma de treinador, e instruções curtas no campo de notas:
   - O atleta entra com CPF e senha; a comissão cria o acesso.
   - As notificações são necessárias para os lembretes de PSE/PSR/peso.
   - A WHOOP é opcional e abre o OAuth no navegador.
5. **Exclusão de conta:** a Apple exige que apps com conta ofereçam a exclusão **dentro do app** (Guideline 5.1.1(v)); apenas “sair” ou “mandar e-mail” costuma ser rejeitado. Hoje as contas são criadas pela comissão, mas isso não dispensa o fluxo. Inclua um botão “Excluir minha conta” (com confirmação e prazo/conclusão informados) ou outro fluxo aprovado pela Apple antes de enviar. O mesmo vale para o Google Play, que pede uma opção de exclusão e uma URL de solicitação no formulário de segurança dos dados.

## 5. Google Play Console

1. **Create app**: nome `Carga`, idioma padrão Português (Brasil), app gratuito.
2. **App content**:
   - Política de privacidade: `https://monitoramento-coral.vercel.app/privacidade`.
   - **Data safety**: informe dados de saúde/fitness, informações pessoais, fotos e identificadores de dispositivo. Dados criptografados em trânsito; exclusão mediante solicitação.
   - **Permissão de notificações** (`POST_NOTIFICATIONS`): declare que é usada para lembretes de treino.
   - Classificação de conteúdo e público-alvo (o app é para atletas adolescentes e adultos; siga as políticas de saúde e menores).
3. **Testing > Internal testing**: suba o `.aab`, adicione os testadores e valide push, login e fotos em um aparelho real.
4. **Testing > Closed testing (obrigatório para conta pessoal nova)**: contas pessoais criadas depois de 13/11/2023 precisam de um teste fechado com **pelo menos 12 testadores opt-in por 14 dias consecutivos** antes de pedir acesso à produção. Teste interno **não** conta. Só depois responda ao questionário de acesso à produção.
5. **Production > Create release**: envie o mesmo `.aab` (ou um novo com `versionCode` maior). Desde 31/08/2026, apps novos e atualizações precisam de `targetSdk 36` (o projeto já está em 36); o Android 16 também força edge-to-edge, então teste o layout com as barras do sistema.

## 6. Checklist de validação em aparelho real

- [ ] Login do atleta com CPF e senha.
- [ ] Pedido de permissão de notificação aparece e o atleta consegue liberar.
- [ ] Lembrete de PSE chega com o app fechado e abre a tela certa ao tocar.
- [ ] Trocar de atleta no mesmo aparelho não mistura notificações (logout no OneSignal).
- [ ] Foto de treino pela câmera e pela galeria.
- [ ] Compartilhar cartão/CSV abre a folha nativa (salvar em Arquivos/WhatsApp).
- [ ] Política de privacidade abre no navegador, não dentro do app.
- [ ] WHOOP conecta e volta para o app.
- [ ] Web na Vercel continua recebendo Web Push normalmente.

## 7. Atualizações futuras

- Conteúdo web novo: `npm run native:sync` e gere um novo build.
- Sempre aumente `versionCode` (Android) e `CURRENT_PROJECT_VERSION`/build (iOS).
- `versionName`/`MARKETING_VERSION` = versão visível na loja.
- Reenvie os segredos da Edge Function só se mudar de app no OneSignal.

## 8. Pendências conhecidas

- **Enviar a branch ao remoto.** Sem isso, outra pessoa/IA que clonar o repositório não verá `ios/`, `android/` nem este guia.
- Trocar `br.com.monitoramentocarga.app` se você já tiver um identificador próprio. **Depois de criar o app nas lojas, o ID não pode mudar.**
- Criar a Notification Service Extension no Xcode (não é possível gerar sem Xcode).
- Substituir os ícones provisórios se houver uma versão definitiva da marca.
- Revisar a política de privacidade para citar o OneSignal e o Firebase como operadores de push, o prazo de retenção e como pedir a exclusão dos dados.
- Implementar a exclusão de conta dentro do app (Apple 5.1.1(v) e Google Play). Não trate como opcional: é uma causa comum de rejeição.
- Produzir screenshots reais do app em iPhone (6,9") e iPad (13"), já que o projeto suporta iPad, e o feature graphic 1024 × 500 do Android.
- Fazer o teste fechado do Google Play (12 testadores por 14 dias) se a conta for pessoal e tiver sido criada depois de 13/11/2023.
- Verificar o privacy manifest do iOS no archive e os avisos de API de motivo obrigatório do App Store Connect.

## 9. Runbook para outra IA (handoff)

> Leia esta seção inteira antes de executar. As seções 1–8 continuam válidas como referência; esta organiza a ordem, as credenciais e os critérios de conclusão.

### 9.1 Objetivo, regras e limites

**Objetivo:** publicar o mesmo app React/Vite nas lojas iOS e Android com Capacitor + OneSignal, mantendo a versão web da Vercel funcionando exatamente como hoje.

**Regras que não podem ser quebradas:**

- Preserve o comportamento da web. As mudanças nativas devem continuar condicionais (`isNativeApp()`), sem carregar plugins nativos no bundle da Vercel.
- Não faça commit de `.env.local`, `android/keystore.properties`, `*.jks`, `google-services.json`, chave `.p8` da Apple ou JSON da conta de serviço do Firebase.
- Não invente credenciais, não crie contas em nome do responsável e não aceite contratos/termos por ele.
- Não troque o bundle ID depois de criar o app no App Store Connect ou no Play Console.
- Não remova as permissões já declaradas (câmera, fotos, notificações, background remoto) sem confirmar que o recurso correspondente saiu do app.

**Uma IA consegue fazer:** editar código e documentação, rodar `npm`/Gradle/Xcode via linha de comando, gerar assets, preparar textos de loja, revisar configurações, publicar a Edge Function e validar builds quando o ambiente e as credenciais existirem.

**Depende do responsável humano:** criar/pagar contas Apple, Google, OneSignal e Firebase; aceitar contratos; fazer 2FA; criar chaves APNs/FCM; operar as telas do App Store Connect e do Play Console; gravar screenshots em aparelho real; aprovar política de privacidade e textos legais; enviar o app para revisão.

### 9.2 Estado atual do handoff

- Branch: `feat/capacitor-ios-android`.
- Commit do trabalho nativo: `8e71f49` (`feat: apps iOS e Android com Capacitor e OneSignal`). Este guia foi atualizado depois; use o HEAD da branch.
- No momento da escrita, a branch **não tem upstream** e ainda não foi enviada ao GitHub. Antes de qualquer coisa:
  ```bash
  git push -u origin feat/capacitor-ios-android
  ```
- O commit `8e71f49` estava com working tree limpo; a única alteração posterior é este guia.
- Validação já executada neste commit: `npm run typecheck`, `npm run lint`, `npm test` (150 testes), `npm run build` e `npx cap doctor`.
- Os builds nativos **ainda não foram compilados/assinados**. Na máquina em que este guia foi escrito não havia Xcode completo, Java nem Android SDK instalados; confirme o ambiente antes de prometer um build.

### 9.3 Pré-requisitos de ambiente

| Ferramenta | Mínimo | Como verificar |
|---|---|---|
| Node.js | 22 | `node --version` |
| Xcode (macOS) | 26.0 | `xcodebuild -version` |
| Xcode Command Line Tools | — | `xcode-select -p` |
| Android Studio | 2025.2.1 | menu **Help > About** |
| Android SDK | API 36 | **Tools > SDK Manager** |
| JDK | o embutido no Android Studio | `cd android && ./gradlew -v` |

- O Capacitor 8 usa **Swift Package Manager**. Não é necessário CocoaPods e não existe `Podfile`/`.xcworkspace`; abra `ios/App/App.xcodeproj`.
- O JDK não precisa ser instalado separadamente se o Android Studio estiver completo. Se `java` não existir no terminal, use o JBR do Android Studio ou defina `JAVA_HOME`.
- Instale dependências e confira o projeto:
  ```bash
  npm ci
  npx cap doctor
  ```
- `npx cap doctor` pode reclamar de Xcode/Java ausentes; isso é esperado em máquina sem toolchain nativo, mas precisa estar verde antes de gerar build de loja.

### 9.4 Ordem de execução

| # | Fase | Quem faz | Saída |
|---|---|---|---|
| 1 | Decidir o bundle ID definitivo | responsável + IA | ID congelado |
| 2 | Criar contas e chaves | responsável | credenciais em mãos |
| 3 | Preencher `.env.local` e arquivos nativos | IA | build configurado |
| 4 | Validar web e sincronizar | IA | checks verdes |
| 5 | Configurar iOS e enviar ao TestFlight | responsável + IA | build na Apple |
| 6 | Configurar Android e gerar o `.aab` | responsável + IA | build assinado |
| 7 | Preencher as fichas das lojas | responsável + IA | lojas prontas |
| 8 | Teste fechado / revisão | responsável | app enviado ou aprovado |
| 9 | Pós-publicação | IA | atualização documentada |

Não pule a etapa 1: tudo depende do identificador final.

### 9.5 Decidir e trocar o bundle ID

O valor atual é provisório:

```text
br.com.monitoramentocarga.app
```

Se o responsável tiver um domínio/identificador próprio, troque **antes** de criar os registros nas lojas. Depois de criar o app, o ID não pode mudar.

Para encontrar todos os lugares:

```bash
grep -rn "br.com.monitoramentocarga.app" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  --exclude-dir=public --exclude-dir=assets .
```

> O próprio `docs/PUBLICACAO.md` aparece no resultado porque cita o ID; ignore-o. As pastas `public/` geradas dentro de `ios/` e `android/` são cópias do build e serão refeitas pelo `cap sync`.

| Arquivo | O que ajustar |
|---|---|
| `capacitor.config.ts` | `appId` |
| `ios/App/App.xcodeproj/project.pbxproj` | `PRODUCT_BUNDLE_IDENTIFIER` (duas ocorrências) |
| `ios/App/App/Info.plist` | `CFBundleURLName` e `CFBundleURLSchemes` |
| `ios/App/App/App.entitlements` | App Group `group.<novo-id>.onesignal` |
| `ios/App/App/capacitor.config.json` | gerado por `cap sync`; não editar à mão |
| `android/app/build.gradle` | `namespace` e `applicationId` |
| `android/app/src/main/java/.../MainActivity.java` | `package` e mover a pasta para o novo caminho |
| `android/app/src/main/AndroidManifest.xml` | `android:scheme` do deep link |
| `android/app/src/main/res/values/strings.xml` | `package_name` e `custom_url_scheme` |

Depois de trocar:

```bash
npm run native:sync
```

Também atualize, fora do repositório:

- o **App ID** e o **App Group** no Apple Developer;
- o pacote do app Android no **Firebase** (o `google-services.json` precisa ser gerado de novo);
- a conta de serviço do Firebase no **OneSignal**, se você trocar de projeto Firebase (o App ID do OneSignal não muda);
- os registros no **App Store Connect** e no **Play Console**.

### 9.6 Matriz de credenciais

| Credencial | Onde obter | Onde configurar | Observação |
|---|---|---|---|
| Team ID da Apple | Apple Developer > Membership | Xcode > Signing | Também usado no OneSignal |
| Chave APNs `.p8` + Key ID | Apple Developer > Keys > Apple Push Notifications service (APNs) | OneSignal > Apple (APNs) | Baixa uma vez; guarde com backup |
| App ID / bundle ID | decisão do projeto | Apple Developer, App Store Connect, Xcode | Não muda depois de publicado |
| App Group | Apple Developer > Identifiers > App Groups | Apple Developer (registro) e Xcode (app + extensão) | `group.<bundle-id>.onesignal` |
| App ID do OneSignal | OneSignal > Settings > Keys & IDs | `.env.local` (`VITE_ONESIGNAL_APP_ID`) e segredo `ONESIGNAL_APP_ID` no Supabase | Mesmo app para iOS e Android |
| REST API Key do OneSignal | OneSignal > Settings > Keys & IDs | segredo `ONESIGNAL_REST_API_KEY` no Supabase | **Nunca** use `VITE_` |
| `google-services.json` | Firebase > app Android com o pacote final | `android/app/google-services.json` | Não confundir com a conta de serviço |
| JSON da conta de serviço do Firebase | Firebase > Configurações do projeto > Contas de serviço | OneSignal > Google (FCM) | Usado pelo OneSignal para enviar |
| Keystore Android + senhas | `keytool` (veja 9.8) | `android/keystore.properties` + backup fora do Git | Sem a chave de upload (ou reset aprovado pelo Google) não há atualização |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase > Settings > API | `.env.local` e Vercel | Build-time |
| `VITE_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` | Vercel e `.env.local` | Web Push continua igual |
| `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | `npx web-push generate-vapid-keys` | segredos do Supabase | Nunca use `VITE_` |
| WHOOP Client ID/Secret + `APP_PUBLIC_URL` | painel da WHOOP | segredos do Supabase | Já existente; confira o redirect |

Lembretes:

- Variáveis `VITE_*` são **gravadas no build**. Mudou o valor? Rode `npm run native:sync` de novo e gere novos builds.
- `ONESIGNAL_APP_ID` e `ONESIGNAL_REST_API_KEY` são segredos de servidor. Configure com `npx supabase secrets set` e faça o deploy da função.
- A chave `.p8` da Apple e o JSON da conta de serviço do Firebase são downloads únicos; guarde-os em cofre de senhas.
- `google-services.json` não é exatamente um segredo, mas é específico do ambiente e está ignorado pelo Git.
- Os segredos já usados pela web/WHOOP (`WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `APP_PUBLIC_URL`, `CRON_SECRET` e `VAPID_*`) devem ser conferidos no Supabase; este runbook não os recria.

### 9.7 iOS: do zero ao TestFlight

1. **Apple Developer**
   - Crie um **App ID explícito** com o bundle final.
   - Habilite **Push Notifications** e **App Groups** nesse App ID.
   - Crie o App Group `group.<bundle-id>.onesignal` em **Identifiers > App Groups** e associe ao App ID.
   - Crie uma **chave APNs** em **Keys > + > Apple Push Notifications service (APNs)**. Guarde o `.p8`, o **Key ID** e o **Team ID**. A mesma chave serve para desenvolvimento e produção; o download do `.p8` só aparece uma vez.

2. **OneSignal**
   - No mesmo app do OneSignal, adicione a plataforma **Apple (APNs)** e envie o `.p8` com Key ID e Team ID.
   - Confirme que o App ID do OneSignal é o mesmo usado no build.

3. **Xcode**
   - Abra `ios/App/App.xcodeproj`.
   - Target **App** > **Signing & Capabilities**: escolha o Team e mantenha **Automatically manage signing**.
   - Confirme **Push Notifications**, **Background Modes > Remote notifications** e **App Groups** com o grupo exato.
   - O `App.entitlements` já traz `aps-environment = development`; na assinatura de distribuição o Xcode troca para produção. Se o archive reclamar, confira o provisioning profile.

4. **Notification Service Extension (NSE)**
   - **File > New > Target > Notification Service Extension**.
   - Product Name: `OneSignalNotificationServiceExtension`; mínimo **iOS 15**; em seguida escolha **Don't Activate**.
   - Confira o Bundle Identifier da extensão (normalmente `<bundle-id>.OneSignalNotificationServiceExtension`) e o mesmo Team.
   - **Signing & Capabilities** da extensão: adicione **App Groups** com o mesmo grupo do app.
   - Substitua o conteúdo de `NotificationService.swift` pelo código oficial da [documentação do OneSignal](https://documentation.onesignal.com/docs/en/capacitor-sdk-setup#4-add-notification-service-extension).
   - Como o projeto usa SPM, o pacote do OneSignal já fica disponível para a extensão; **não rode `pod install`**.
   - Se aparecer o erro “Cycle Inside…”, mova a Build Phase **Embed Foundation Extensions** (ou **Embed App Extensions**) para antes de **Run Script**.
   - A NSE é recomendada para entrega confirmada e imagens. Lembretes só de texto funcionam sem ela, mas o teste de “confirmed” no OneSignal não.

5. **App Store Connect e TestFlight**
   - Crie o app em **App Store Connect > Apps > +** com o bundle ID final (antes do upload).
   - Selecione **Any iOS Device (arm64)**.
   - **Product > Archive** > **Distribute App > App Store Connect > Upload**.
   - Aguarde o processamento no App Store Connect e distribua para **TestFlight** (testadores internos).
   - Aumente `CURRENT_PROJECT_VERSION` a cada upload; `MARKETING_VERSION` é a versão visível.

6. **Ficha do App Store**
   - Categoria **Health & Fitness** (ou Esportes), política de privacidade e URL de suporte.
   - Screenshots reais: o target suporta iPhone e iPad (`TARGETED_DEVICE_FAMILY = "1,2"`), então prepare as exigidas pelo App Store Connect (atualmente 6,9" de iPhone e 13" de iPad; a tela de upload lista exatamente quais).
   - **App Privacy:** declare saúde/fitness (PSE, bem-estar, peso, sono/WHOOP), contato (nome, CPF/e-mail), fotos e identificadores. Não marque rastreamento publicitário.
   - **Criptografia:** `ITSAppUsesNonExemptEncryption = false` já está no `Info.plist`.
   - **Notas de revisão:** explique que é um app de clube/esporte, que a comissão cria o acesso, que as notificações são lembretes de PSE/PSR/peso e que a WHOOP é opcional. Envie contas de teste de atleta e de treinador.
   - **Exclusão de conta:** implemente o fluxo dentro do app antes de enviar (veja 9.1 e seção 4).
   - **Risco 4.2:** a Apple pode entender que é só um site em WebView. As integrações nativas (push, câmera, compartilhamento, arquivos, deep link) ajudam, mas esteja preparado para explicar o valor nativo ou adicionar funcionalidade se houver rejeição.
   - **Privacy manifest:** no archive, verifique se o pacote do OneSignal traz `PrivacyInfo.xcprivacy` e se o App Store Connect não acusa API de motivo obrigatório. Se acusar, adicione o manifesto ao app.

### 9.8 Android: do zero ao teste fechado

1. **Firebase**
   - Crie/use um projeto no Firebase.
   - Adicione um app **Android** com o pacote final.
   - Baixe `google-services.json` e coloque em `android/app/google-services.json`.
   - Em **Configurações do projeto > Contas de serviço**, gere o JSON da conta de serviço para o OneSignal (é outro arquivo; não vai no app).

2. **OneSignal**
   - Adicione a plataforma **Google (FCM)** e envie o JSON da conta de serviço.
   - O plugin já cuida do Gradle; **não adicione** `apply plugin: 'com.google.gms.google-services'` manualmente (o `build.gradle` já aplica quando o arquivo existe).

3. **Build e teste em aparelho**
   ```bash
   npm run native:sync
   npm run native:android
   ```
   - No Android Studio, confirme **SDK 36**, `applicationId`, `versionCode` e `versionName`.
   - Rode em aparelho real com **Google Play Services** (emulador precisa de imagem com Play Store e cold boot).
   - O projeto já tem `POST_NOTIFICATIONS`; no Android 13+ o OneSignal pede a permissão em tempo de execução.
   - `targetSdk 36` é obrigatório desde 31/08/2026. O Android 16 força edge-to-edge; teste o layout com as barras de status/navegação.

4. **Keystore de upload** (rode na raiz do repositório)
   ```bash
   keytool -genkeypair -v -keystore carga-upload.jks -alias carga \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   - Se `keytool` não existir no PATH, use o do Android Studio:
     ```bash
     "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" \
       -genkeypair -v -keystore carga-upload.jks -alias carga \
       -keyalg RSA -keysize 2048 -validity 10000
     ```
   - Crie `android/keystore.properties` (fora do Git):
     ```properties
     storeFile=../../carga-upload.jks
     storePassword=...
     keyAlias=carga
     keyPassword=...
     ```
   - Guarde o `.jks` e as senhas em local seguro. Com **Play App Signing**, essa é a chave de **upload**; a chave de assinatura do app fica com o Google.

5. **Gerar o AAB**
   ```bash
   cd android
   ./gradlew bundleRelease
   # saída: app/build/outputs/bundle/release/app-release.aab
   ```
   - Se o arquivo sair sem assinatura, o Play recusa. Confira `keystore.properties` e o `signingConfig`.
   - AAB não instala direto com `adb install`; use `bundletool` ou o teste interno do Play.
   - Aumente `versionCode` a cada upload; `versionName` é a versão visível.

6. **Play Console**
   - **Create app**: nome `Carga`, idioma Português (Brasil), gratuito.
   - **Ficha da loja**: descrição curta e completa, ícone 512 × 512, feature graphic 1024 × 500 e screenshots reais de telefone (e tablet, se aplicável).
   - **App content**: política de privacidade, **Data safety** (saúde/fitness, informações pessoais, fotos, identificadores; dados criptografados em trânsito; opção de exclusão), classificação de conteúdo, público-alvo (atletas adolescentes e adultos; siga as políticas de saúde e menores), anúncios, acesso ao app (contas de teste) e declarações de saúde/governo/finanças quando aparecerem.
   - **Data deletion:** informe a URL de solicitação e mantenha a exclusão dentro do app coerente com o formulário.
   - **Play App Signing:** inscreva-se e guarde a chave de upload.
   - **Internal testing**: valide push, login, fotos e WHOOP em aparelho real.
   - **Closed testing**: conta pessoal criada depois de 13/11/2023 exige **12 testadores opt-in por 14 dias consecutivos**. Teste interno não substitui. Só depois solicite acesso à produção e responda ao questionário.
   - **Production**: envie o mesmo `.aab` ou um novo com `versionCode` maior.

### 9.9 Comandos de validação

Antes de qualquer build de loja:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npx cap doctor
npm run native:sync
git status --short
```

- Todos os checks precisam passar. `npm run native:sync` faz build + cópia para `ios/` e `android/`.
- `git status` não pode mostrar `.env.local`, keystore, `google-services.json` ou chaves.
- Build iOS: compile/archive no Xcode; push só funciona em aparelho físico.
- Build Android: `./gradlew assembleDebug` para testar e `./gradlew bundleRelease` para a loja.

Testes mínimos em aparelho real (além do checklist da seção 6):

- [ ] Push com o app **fechado** chega e, ao tocar, abre a tela certa.
- [ ] No OneSignal, a subscription tem **External ID = id do atleta** e status **Subscribed**.
- [ ] Atleta A ativa os lembretes; logout; atleta B entra. Push para A não chega no aparelho de B.
- [ ] Câmera, galeria, compartilhamento e links externos funcionam.
- [ ] Android 16: layout não fica sob as barras do sistema; ícone de notificação aparece como silhueta branca.
- [ ] Web na Vercel continua recebendo Web Push.

Para testar o OneSignal:

1. Abra o app e permita notificações.
2. Em **Audience > Users & subscriptions > Subscriptions**, confirme o External ID do atleta.
3. Envie um teste para esse External ID pelo dashboard.
4. Confira a entrega e o evento **confirmed** (com a NSE instalada no iOS).

### 9.10 Revisão e rejeições comuns

**iOS**

- Exclusão de conta ausente ou só por e-mail.
- Guideline 4.2: app parece um site em WebView sem valor nativo.
- App Privacy/Data Safety diferente do que o app realmente coleta.
- Falta de conta de demonstração ou instruções de revisão.
- Links de privacidade/suporte quebrados.
- Alegações de saúde/performance sem respaldo.
- Permissões sem texto claro (câmera/fotos já estão explicadas no `Info.plist`).

**Android**

- Formulário de segurança dos dados incompleto ou incoerente com a exclusão.
- Público-alvo/classificação de conteúdo incorretos para dados de saúde e menores.
- Teste fechado de 12 testadores/14 dias não concluído.
- Instruções de acesso ao app ausentes.
- `versionCode` repetido ou AAB sem assinatura.
- `targetSdk` abaixo de 36.

Corrija a causa antes de reenviar; não conte com aprovação por argumentação.

### 9.11 Troubleshooting

| Sintoma | Causa provável | Correção |
|---|---|---|
| `google-services.json not found` | arquivo ausente/vazio | colocar em `android/app/` e rodar `npm run native:sync` |
| Push Android não chega | pacote diferente no Firebase, FCM sem conta de serviço ou aparelho sem Play Services | conferir pacote, JSON no OneSignal e aparelho real |
| Push iOS não chega | capability/entitlement, chave APNs, perfil ou permissão | conferir Push + Background + App Group, APNs no OneSignal e aparelho físico |
| NSE não executa / sem “confirmed” | extensão não embutida, App Group diferente ou deployment target | conferir target, Embed Foundation/App Extensions e App Group exato |
| Erro de App Group | nome/capitalização diferente no portal ou em um dos targets | usar exatamente `group.<bundle-id>.onesignal` nos dois targets |
| Archive não assina | Team/provisioning ou entitlement `development` | usar assinatura automática e conferir o perfil de distribuição |
| `java` não encontrado | JDK fora do PATH | usar o JBR do Android Studio ou definir `JAVA_HOME` |
| Gradle não acha SDK 36 | SDK não instalado | instalar API 36 no SDK Manager |
| Play recusa `versionCode` | código já usado | aumentar `versionCode` |
| AAB não instala | AAB não é APK | usar `bundletool` ou teste interno do Play |
| OneSignal sem subscription | `VITE_ONESIGNAL_APP_ID` ausente, SDK não inicializou, permissão negada ou `login` falhou | conferir build, console e `athlete_get_session` |
| App nativo diz “notificações não configuradas” | build sem `VITE_ONESIGNAL_APP_ID` | refazer o build com a variável e sincronizar |
| Web Push parou | VAPID/Edge Function alterados | conferir segredos e deploy; mudanças nativas não devem afetar a web |
| `cap sync` falha | dependências/SPM | `npm ci`, `npx cap doctor`, limpar DerivedData e sincronizar de novo |
| Layout sob as barras no Android 16 | edge-to-edge obrigatório | revisar `safe-area-inset-*` e testar em aparelho/emulador API 36 |

### 9.12 Definição de pronto

Só considere a publicação concluída quando **todos** forem verdadeiros:

- [ ] Branch enviada ao remoto e acessível para a próxima pessoa/IA.
- [ ] Bundle ID final congelado; todas as referências trocadas; `npm run native:sync` sem erro.
- [ ] `.env.local` completo; build de loja inclui `VITE_ONESIGNAL_APP_ID`.
- [ ] Segredos `ONESIGNAL_APP_ID`/`ONESIGNAL_REST_API_KEY` configurados e Edge Function publicada.
- [ ] `google-services.json` no Android e conta de serviço do Firebase no OneSignal.
- [ ] Chave APNs no OneSignal; Push, Background Modes e App Group no Xcode; NSE criada e embutida.
- [ ] Keystore Android + `keystore.properties` + backup; AAB assinado.
- [ ] Build iOS no TestFlight; AAB no teste interno/fechado do Android.
- [ ] Push com app fechado, troca de atleta e links validados em aparelho real.
- [ ] Exclusão de conta dentro do app e política de privacidade atualizada (OneSignal/Firebase, retenção e exclusão).
- [ ] Fichas completas: textos, screenshots, ícones, política/suporte, App Privacy/Data Safety, classificação etária e contas de teste.
- [ ] Teste fechado de 12 testadores/14 dias concluído (se aplicável) e acesso à produção liberado.
- [ ] Apps enviados/revisados nas duas lojas; web da Vercel continua funcionando.
- [ ] Credenciais e backups guardados; processo de nova versão documentado.

### 9.13 Perguntas para o responsável

Antes de executar, confirme com quem vai publicar:

1. A conta **Apple Developer** e o acesso ao **App Store Connect** estão ativos? Qual é o Team ID?
2. A conta **Google Play** é pessoal ou organizacional? Foi criada depois de 13/11/2023? (Isso define o teste de 12 testadores/14 dias.)
3. Qual é o **bundle ID definitivo**? Existe domínio próprio?
4. Quem é o dono das contas **OneSignal** e **Firebase**? Podemos receber acesso de membro?
5. Quais são as **contas de teste** de atleta e de treinador para a revisão?
6. Qual é o **e-mail de suporte**, o contato de privacidade e a entidade legal?
7. Qual é a **política de exclusão de conta**: o que apagar, o que reter por obrigação legal e em quanto tempo?
8. Os **ícones/splash** atuais são definitivos? Quem grava as **screenshots** em iPhone/iPad e Android?
9. As credenciais de produção da **WHOOP** e o redirect já estão configurados?
10. Quem vai **enviar para revisão** e responder às lojas?

### 9.14 Prompt de handoff

Se outra IA for continuar, use algo como:

```text
Você vai continuar a publicação do app Carga. Leia docs/PUBLICACAO.md inteiro,
começando pela seção 9. Trabalhe na branch feat/capacitor-ios-android e não altere
o comportamento da versão web; mudanças nativas devem ser condicionais.

Antes de executar, liste as credenciais que faltam e peça ao responsável. Siga a
ordem da seção 9.4, valide com os comandos da seção 9.9 e pare quando depender de
conta, pagamento, 2FA, Xcode/App Store Connect ou Play Console.

Não invente credenciais, não faça commit de segredos e não troque o bundle ID
depois de criar o app nas lojas.
```
