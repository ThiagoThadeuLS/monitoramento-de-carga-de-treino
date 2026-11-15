# Publicação dos apps iOS e Android

Este guia cobre a publicação do **Carga** nas lojas usando o mesmo código React/Vite da versão web. A versão publicada na Vercel continua igual: as mudanças nativas só entram em ação dentro do app instalado.

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
3. Conta no **OneSignal** (plano gratuito atende o piloto).
4. Projeto no **Firebase** (gratuito) para o FCM do Android.
5. Um Mac com **Xcode** e um computador com **Android Studio** para gerar os builds assinados.
6. Chave de assinatura Android (keystore) — guarde com backup; sem ela não é possível atualizar o app depois.

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

> O Capacitor 8 usa Swift Package Manager. O OneSignal já está resolvido via SPM, então não é necessário `pod install`.

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
# saída: android/app/build/outputs/bundle/release/app-release.aab
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
5. A Apple exige exclusão de conta para apps com criação de conta. Hoje as contas são criadas pela comissão. Se o revisor exigir exclusão dentro do app, inclua um botão “Excluir minha conta” ou um pedido por e-mail na política de privacidade antes de enviar.

## 5. Google Play Console

1. **Create app**: nome `Carga`, idioma padrão Português (Brasil), app gratuito.
2. **App content**:
   - Política de privacidade: `https://monitoramento-coral.vercel.app/privacidade`.
   - **Data safety**: informe dados de saúde/fitness, informações pessoais, fotos e identificadores de dispositivo. Dados criptografados em trânsito; exclusão mediante solicitação.
   - **Permissão de notificações** (`POST_NOTIFICATIONS`): declare que é usada para lembretes de treino.
   - Classificação de conteúdo e público-alvo (o app é para atletas adolescentes e adultos; siga as políticas de saúde e menores).
3. **Testing > Internal testing**: suba o `.aab`, adicione os testadores e valide push, login e fotos em um aparelho real.
4. **Production > Create release**: envie o mesmo `.aab` (ou um novo com `versionCode` maior).

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

- Trocar `br.com.monitoramentocarga.app` se você já tiver um identificador próprio. **Depois de criar o app nas lojas, o ID não pode mudar.**
- Criar a Notification Service Extension no Xcode (não é possível gerar sem Xcode).
- Substituir os ícones provisórios se houver uma versão definitiva da marca.
- Revisar a política de privacidade para citar o OneSignal e o Firebase como operadores de push.
- Configurar a exclusão de conta conforme a exigência da Apple/Google.
