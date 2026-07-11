# condar — apps nativos (Capacitor)

Os três front-ends (`web-portaria`, `web-morador`, `web-sindico`) são empacotados
como apps Android nativos com **Capacitor**, reaproveitando 100% do código web e
do design system `@condar/ui` (regra de reúso do projeto). Cada app tem seu
próprio projeto Android versionado em `apps/<app>/android/`.

| App          | appId                    | Nome exibido    |
| ------------ | ------------------------ | --------------- |
| web-portaria | `br.com.condar.portaria` | condar Portaria |
| web-morador  | `br.com.condar.morador`  | condar          |
| web-sindico  | `br.com.condar.sindico`  | condar Síndico  |

## Como o app fala com a API

No navegador o dev server proxeia `/api` → API. No app nativo não há proxy:
o cliente HTTP compartilhado (`@condar/ui`) usa `VITE_API_URL` quando definido.
**Sempre defina `VITE_API_URL` (URL pública HTTPS da API) ao gerar o build
nativo**, além de `VITE_TENANT_ID` se quiser pré-preencher o login:

```bash
cd apps/web-morador
VITE_API_URL=https://api.condar.com.br pnpm app:sync
```

## Gerar o APK (debug)

Pré-requisitos: JDK 17+ e Android SDK (ou Android Studio).

```bash
cd apps/web-morador
VITE_API_URL=https://api.condar.com.br pnpm app:android
# APK em android/app/build/outputs/apk/debug/app-debug.apk
```

Ou abra `apps/web-morador/android` no Android Studio e rode/assine por lá.

## Scripts

- `pnpm app:sync` — build web + copia `dist/` para o projeto Android (`cap sync`).
- `pnpm app:android` — o anterior + `gradlew assembleDebug` (gera o APK).

## Publicação (release)

1. Gere um keystore próprio e configure a assinatura em
   `android/app/build.gradle` (não versionar o keystore).
2. `cd android && ./gradlew bundleRelease` → `.aab` para a Play Store.
3. Suba um app por perfil (portaria/morador/síndico) — os `appId` já são distintos.

## iOS

Basta `npx cap add ios` em cada app (requer macOS/Xcode); a config
(`capacitor.config.ts`) já é compartilhada entre plataformas.

## PWA

Os três apps continuam instaláveis como PWA direto do navegador
(manifest + service worker via `vite-plugin-pwa`) — útil como alternativa
sem loja de apps.
