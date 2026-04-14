# Public Pages i18n — 8 Languages

## Context

The auth/landing pages need to work for users from 8 language markets. English is the canonical source-of-truth for the whole platform (landing + app). Norwegian Bokmål is a secondary but important full translation. Six additional languages are scoped to the **public-facing pages only** (signup, login, welcome/waitlist, auth callback, password reset flows):

- English (en) — canonical, default fallback
- Norwegian Bokmål (nb) — full app translation
- Spanish (es) — tone leans Argentinian, code stays generic
- French (fr)
- Arabic (ar) — tone leans Egyptian, code stays generic, **RTL layout**
- Mandarin (zh) — Simplified script
- Korean (ko)
- Japanese (ja)

The authenticated platform stays English + Norwegian only for now.

**Why this matters**: Sprucelab is invitation-only beta today, but the public pages are the first thing any investor / partner / curious BIM professional sees. Norwegian-only default turns away 95% of the world. Having the public pages respect browser language makes the platform feel like a real product to international visitors.

## Current state (blocker)

The auth pages are **not** i18n-ready. Hardcoded Norwegian strings directly in JSX in:
- `frontend/src/pages/Welcome.tsx` — ~40-50 strings (hero copy, timeline labels, form fields, footer meta)
- `frontend/src/pages/Login.tsx` — ~15 strings (form labels, button, error messages)
- `frontend/src/pages/Signup.tsx` — ~20 strings (form + consent + error messages)
- `frontend/src/pages/AuthCallback.tsx` — ~5 strings (loading, error states)

The existing `en.json` / `nb.json` (911 lines each) contain keys for the authenticated platform but nothing for these auth pages. The user's guidance "ALL user-facing text MUST use the i18n system" from CLAUDE.md was aspirational when the auth pages were written in a rush.

Existing i18n plumbing at `frontend/src/i18n/index.ts` is solid — already uses `i18next-browser-languagedetector`, `localStorage` caching, fallback to English — just needs more locales and a namespace split.

## Goals

1. **English canonical** — all source strings in `en.json`. Other files are translations of it.
2. **Namespace split**: `public` (auth pages) and `app` (authenticated platform). Only `public` has 8 languages; `app` stays en + nb.
3. **Refactor the 4 auth pages** to use `t()` everywhere. Zero hardcoded user-facing text remains.
4. **6 new locale files** with only the `public` namespace, draft-quality (no native review, trust the model).
5. **Language picker** in the corner of the public pages. Auto-detect via `navigator.language` on first visit, persist choice in `localStorage`.
6. **RTL layout** for Arabic — `<html dir="rtl">` when locale is `ar`, CSS mirroring where needed for the welcome card + timeline.
7. **Font loading** — lazy-load Noto fonts per non-Latin locale: Noto Naskh Arabic for `ar`, Noto Sans JP for `ja`, Noto Sans KR for `ko`, Noto Sans SC for `zh`. Only fetched when that locale is active. Latin locales keep Fraunces + Plex Mono.

## Implementation

### Phase 1 — Infrastructure (must land before any translation content)

**1. Namespace split in `frontend/src/i18n/index.ts`**

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// app namespace (authenticated platform)
import enApp from './locales/en/app.json';
import nbApp from './locales/nb/app.json';

// public namespace (auth pages)
import enPublic from './locales/en/public.json';
import nbPublic from './locales/nb/public.json';
import esPublic from './locales/es/public.json';
import frPublic from './locales/fr/public.json';
import arPublic from './locales/ar/public.json';
import zhPublic from './locales/zh/public.json';
import koPublic from './locales/ko/public.json';
import jaPublic from './locales/ja/public.json';

export const languages = [
  { code: 'en', name: 'English',        nativeName: 'English',       flag: '🇺🇸', dir: 'ltr', fontLocale: 'latin' },
  { code: 'nb', name: 'Norwegian',      nativeName: 'Norsk',         flag: '🇳🇴', dir: 'ltr', fontLocale: 'latin' },
  { code: 'es', name: 'Spanish',        nativeName: 'Español',       flag: '🇪🇸', dir: 'ltr', fontLocale: 'latin' },
  { code: 'fr', name: 'French',         nativeName: 'Français',      flag: '🇫🇷', dir: 'ltr', fontLocale: 'latin' },
  { code: 'ar', name: 'Arabic',         nativeName: 'العربية',        flag: '🇸🇦', dir: 'rtl', fontLocale: 'arabic' },
  { code: 'zh', name: 'Chinese',        nativeName: '中文',           flag: '🇨🇳', dir: 'ltr', fontLocale: 'cjk-sc' },
  { code: 'ko', name: 'Korean',         nativeName: '한국어',          flag: '🇰🇷', dir: 'ltr', fontLocale: 'cjk-kr' },
  { code: 'ja', name: 'Japanese',       nativeName: '日本語',          flag: '🇯🇵', dir: 'ltr', fontLocale: 'cjk-jp' },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { app: enApp, public: enPublic },
      nb: { app: nbApp, public: nbPublic },
      es: { public: esPublic },
      fr: { public: frPublic },
      ar: { public: arPublic },
      zh: { public: zhPublic },
      ko: { public: koPublic },
      ja: { public: jaPublic },
    },
    ns: ['app', 'public'],
    defaultNS: 'app',
    fallbackLng: 'en',
    supportedLngs: ['en', 'nb', 'es', 'fr', 'ar', 'zh', 'ko', 'ja'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });
```

**2. Directory restructure**

Move current flat files into nested dirs:
```
frontend/src/i18n/locales/
  en/app.json        ← current en.json renamed
  en/public.json     ← new, draft
  nb/app.json        ← current nb.json renamed
  nb/public.json     ← new, draft
  es/public.json     ← new
  fr/public.json     ← new
  ar/public.json     ← new
  zh/public.json     ← new
  ko/public.json     ← new
  ja/public.json     ← new
```

**3. Font loading helper** — `frontend/src/i18n/fonts.ts`

```ts
const loadedLocales = new Set<string>();

export function loadFontsFor(fontLocale: string) {
  if (loadedLocales.has(fontLocale)) return;
  loadedLocales.add(fontLocale);

  const links: Record<string, string> = {
    arabic: 'https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;500;700&display=swap',
    'cjk-sc': 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap',
    'cjk-kr': 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap',
    'cjk-jp': 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap',
  };
  const href = links[fontLocale];
  if (!href) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
```

Wire into `frontend/src/i18n/index.ts` as a `languageChanged` listener, or call from a `useEffect` in the Welcome/Login/Signup pages.

**4. RTL toggle** — small effect in `App.tsx` or a shared hook:

```ts
useEffect(() => {
  const lang = i18n.language;
  const entry = languages.find(l => l.code === lang);
  document.documentElement.dir = entry?.dir ?? 'ltr';
  document.documentElement.lang = lang;
}, [i18n.language]);
```

### Phase 2 — Refactor auth pages

Audit and replace every hardcoded string. For each string:
1. Pick a key in the `public` namespace (e.g., `welcome.timeline.registered`)
2. Replace JSX literal with `{t('welcome.timeline.registered')}`
3. Add to `en/public.json` (canonical English)
4. Add Norwegian translation to `nb/public.json`

Pages to refactor (estimated string counts):
- `Welcome.tsx` — 40-50 strings
- `Login.tsx` — 15 strings
- `Signup.tsx` — 20 strings
- `AuthCallback.tsx` — 5 strings

Example key structure:

```json
{
  "welcome": {
    "tag": "Beta · Invitation only",
    "heading": "Thanks, {{name}}.",
    "lede": "Sprucelab is in closed beta. We're opening access manually for each account during the first weeks — so we get to meet you, not just your email address.",
    "timeline": {
      "registered": "Registered",
      "applicationPending": "Application under review",
      "accessOpening": "Access opens",
      "firstLogin": "First login",
      "weAreReviewing": "We're reviewing",
      "pageAutoloads": "Page loads automatically",
      "getStarted": "Get started"
    },
    "expand": {
      "label": "Tell us more about your use case",
      "role": "Your role",
      "useCase": "What you'd use Sprucelab for",
      "save": "Save",
      "saved": "Saved"
    },
    "footer": {
      "queueId": "Queue ID",
      "fetching": "Status: fetching…"
    },
    "signOut": "Sign out"
  },
  "login": {
    "title": "Sign in to Sprucelab",
    "email": "Email",
    "password": "Password",
    "submit": "Sign in",
    "magicLink": "Email me a sign-in link instead",
    "noAccount": "No account yet?",
    "signUpLink": "Apply for access",
    "errors": {
      "invalidCredentials": "Wrong email or password.",
      "rateLimited": "Too many attempts. Try again in a minute.",
      "unexpected": "Something went wrong. Try again."
    }
  },
  "signup": {
    "title": "Apply for access",
    "subtitle": "Sprucelab is invitation-only beta. Tell us who you are and we'll review your application.",
    "firstName": "First name",
    "lastName": "Last name",
    "companyName": "Company (optional)",
    "email": "Work email",
    "password": "Password",
    "passwordHint": "At least 10 characters.",
    "consent": "I agree to be contacted about my application.",
    "submit": "Apply",
    "submitting": "Sending…",
    "success": "Thanks. Check your email to confirm, then we'll review your application.",
    "errors": {
      "passwordTooShort": "Password must be at least 10 characters.",
      "emailTaken": "An account with that email already exists.",
      "unexpected": "Couldn't send your application. Try again."
    }
  },
  "authCallback": {
    "processing": "Confirming your sign-in…",
    "error": "Could not complete sign-in. Try again from the login page."
  },
  "language": {
    "label": "Language",
    "switchTo": "Switch to {{language}}"
  }
}
```

### Phase 3 — Translations (trust-the-model pass)

Draft the 6 new locale files with public-namespace content only. Use the English canonical keys as source. **No native review** — user accepts draft quality. Put a commented note at the top of each file: `"_meta": {"status": "machine-draft-trust-the-model"}` so we can find them later if we do want review.

### Phase 4 — Language picker UI

Small dropdown component in the corner of the welcome/login/signup pages. Shows current language's flag + native name. Click opens list of 8 options. Sets i18n language + persists to localStorage. Positioned top-right in a way that doesn't collide with the existing Sprucelab wordmark (top-left) or the "Logg ut" (top-right, but only rendered when authenticated).

File: `frontend/src/components/public/LanguagePicker.tsx`

### Phase 5 — RTL polish for Arabic

The welcome page layout needs RTL check:
- Hero card alignment (currently left-aligned on the panel)
- Timeline — the dots/labels/meta layout (dot on the left now, should swap to right in RTL)
- Footer meta positioning
- 3D scene (works fine in RTL, just a backdrop)

Most of the layout uses CSS grid/flex which respects `dir="rtl"` automatically. The `Welcome.css` file uses `text-align: left` explicitly in a few places — audit and swap for `text-align: start` where appropriate.

## Files to create / modify

**New:**
- `frontend/src/i18n/locales/en/public.json`
- `frontend/src/i18n/locales/nb/public.json`
- `frontend/src/i18n/locales/es/public.json`
- `frontend/src/i18n/locales/fr/public.json`
- `frontend/src/i18n/locales/ar/public.json`
- `frontend/src/i18n/locales/zh/public.json`
- `frontend/src/i18n/locales/ko/public.json`
- `frontend/src/i18n/locales/ja/public.json`
- `frontend/src/i18n/fonts.ts`
- `frontend/src/components/public/LanguagePicker.tsx`

**Move:**
- `frontend/src/i18n/locales/en.json` → `en/app.json`
- `frontend/src/i18n/locales/nb.json` → `nb/app.json`

**Modify:**
- `frontend/src/i18n/index.ts` — namespace split, 8 locale registration, languages array with dir + fontLocale
- `frontend/src/pages/Welcome.tsx` — refactor to `t()` calls
- `frontend/src/pages/Welcome.css` — audit `text-align: left` → `start`, verify RTL flow
- `frontend/src/pages/Login.tsx` — refactor to `t()` calls
- `frontend/src/pages/Signup.tsx` — refactor to `t()` calls
- `frontend/src/pages/AuthCallback.tsx` — refactor to `t()` calls
- `frontend/src/App.tsx` — add RTL/lang attribute effect

## Verification

1. `yarn dev` — open sprucelab in Chrome with `?preview=1`
2. `i18n.changeLanguage('ar')` in console → page flips to RTL, Arabic font loads, copy is Arabic
3. Switch to each language via picker — verify strings render, no missing keys, no console warnings about missing translations
4. Reload with `navigator.language` set to various values (via Chrome DevTools → Sensors → Locales) — verify auto-detect lands on the right language
5. Verify authenticated `/` still works — `app` namespace continues to load only en + nb, no regression
6. Visual check welcome page in RTL: hero card, timeline, footer, sign-out button all read in the correct direction
7. Lighthouse run on welcome page — verify Noto font load doesn't destroy performance; consider `font-display: swap`

## Decisions finalized before implementation starts

- ✓ English is canonical source-of-truth
- ✓ Norwegian is full translation (both namespaces)
- ✓ 6 other languages are public-only
- ✓ Browser language auto-detect via `navigator.language`, persist in localStorage
- ✓ Manual language picker (corner of public pages)
- ✓ Draft-quality translations, no native review
- ✓ Simplified Chinese (not Traditional)
- ✓ Lazy-load Noto fonts per locale
- ✓ Arabic gets RTL layout

## Deferred / out of scope

- Traditional Chinese (`zh-TW`) — add later if needed for a Taiwan/HK push
- Full app translation into es/fr/ar/zh/ko/ja — intentionally limited to public pages
- Email template translation — emails stay English for now
- Native-speaker review — flagged as a ship-gate before public launch but skipped for this pass
- Locale-specific date/number/currency formatting — use `Intl` APIs with `i18n.language` as needed, not a big deal since the public pages don't show much numeric content
- Vercel edge geo (`x-vercel-ip-country`) — second-signal enrichment, not needed for v1

## Estimated effort

~3 focused hours. Phase 1 (infra) is ~45 min. Phase 2 (auth page refactor) is ~90 min. Phase 3 (draft translations) is ~30 min. Phase 4 (language picker) is ~20 min. Phase 5 (RTL polish) is ~20 min.
