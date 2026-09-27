# VAV Social AI 2.0

Automatizare Instagram strict pe servicii gratuite: Cloudflare Workers Free, Workers AI, D1, Telegram Bot API și Instagram Graph API. Cele 21 de variante vizuale sunt generate local și publicate ca JPEG static.

Versiunea 2.0 adaugă Reels verticale cu scenariu, imagine AI, voce rusă locală Piper,
subtitrări și randare FFmpeg în GitHub Actions. Nu folosește servicii TTS sau video cu plată.

## Ce include

- trei cronuri zilnice: `04:00`, `09:00`, `15:00 UTC` (`07:00`, `12:00`, `18:00 Moscova`);
- 3 postări originale pe zi în rusă: 2 Reels (sloturile 1 și 3) + 1 postare foto (slotul 2);
- selecție de noutăți din surse publice AI, CRM, marketing și business; dacă sursele nu răspund, generează conținut evergreen fără a inventa știri;
- rotație între AI agents, CRM/vânzări, retail, comenzi/plăți/livrare, analytics/marketing, procese și securitate;
- prompt editorial de nivel senior: hook, valoare practică, întrebare, CTA și hashtaguri, fără statistici sau promisiuni inventate;
- D1 pentru stări, istoric și prevenirea publicării duble;
- Telegram: `/daily3`, `/publish3`, `/status`, `/next`, `/preview`, `/redo`, `/approve`, `/publish`, `/skip`;
- Telegram AI: `/generate <prompt>` creează text, imagine, voce și Reel în rusă; `/ask <prompt>` răspunde la întrebări;
- `/video <temă>`, `/video_status ID` și `/publishvideo ID` controlează fluxul video;
- trei variante vizuale pentru fiecare postare; `/redo [id]` trece la următoarea și trimite imediat noul preview;
- Instagram Graph API cu publicare în doi pași (`media` + `media_publish`);
- verificarea stării containerului Instagram și așteptare până la `FINISHED` înainte de publicare;
- răspuns automat în Instagram Direct la cuvântul `АВТОМАТИЗАЦИЯ`, cu notificare Telegram;
- protecție împotriva retransmiterilor Telegram: fiecare `update_id` este procesat o singură dată, iar generarea AI rulează în fundal după confirmarea imediată a webhook-ului;
- preview Telegram compatibil cu limita descrierii foto: imaginea primește un titlu scurt, iar textul complet este trimis separat;
- mod sigur cu aprobare și mod opțional de autopublicare.

## Configurare

Pe Windows, `DEPLOY-WINDOWS.cmd` folosește OAuth Device Authorization pentru a evita erorile de callback `localhost` și CSRF state mismatch.

```bash
npm install
npm run generate
npm run typecheck
npm test
npx wrangler d1 migrations apply vav-social-ai --remote
npx wrangler secret put META_ACCESS_TOKEN
npx wrangler secret put META_IG_USER_ID
npx wrangler secret put META_WEBHOOK_VERIFY_TOKEN
npx wrangler secret put META_APP_SECRET
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put GITHUB_RENDER_TOKEN
npx wrangler secret put VIDEO_CALLBACK_SECRET
npx wrangler deploy
```

Secretele necesare sunt descrise în `.dev.vars.example`. Nu salva tokenurile în `wrangler.jsonc` sau în Git.

După deploy, configurează Telegram:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "content-type: application/json" \
  -d '{"url":"https://vav-social-ai.vav-ai-secretar-cloudflare.workers.dev/telegram/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
```

Verificare:

```bash
curl https://vav-social-ai.vav-ai-secretar-cloudflare.workers.dev/health
```

## Instagram Direct auto-reply

În Meta App Dashboard configurează webhook-ul Instagram:

- Callback URL: `https://vav-social-ai.vav-ai-secretar-cloudflare.workers.dev/instagram/webhook`
- Verify token: valoarea secretului `META_WEBHOOK_VERIFY_TOKEN`
- câmp abonat: `messages`

Aplicația trebuie să aibă permisiunea Meta pentru administrarea mesajelor Instagram.
Worker-ul validează semnătura Meta cu `META_APP_SECRET`, memorează ID-ul fiecărui mesaj
în D1 și nu răspunde de două ori la retransmiterea aceluiași webhook.

Automatizarea este activă în modul de aprobare. `AUTO_PUBLISH=false` înseamnă că fiecare cron trimite preview-ul în Telegram. După cele trei preview-uri, `/publish3` publică întregul pachet. Setează `AUTO_PUBLISH=true` numai după reactivarea completă a contului Cloudflare și o publicare de test reușită.

## Generare AI din Telegram

Exemple:

```text
/generate Cum reduce un AI-agent timpul de procesare a comenzilor retail
/ask Ce procese merită automatizate mai întâi într-un magazin?
/daily3
/publish3
```

Generarea folosește binding-ul Cloudflare Workers AI. Pe planul Workers Free există o
alocare zilnică gratuită; când aceasta este epuizată, cererile ulterioare eșuează și
pot fi reluate după resetarea limitei. Rezultatul nu se publică automat.

## Reels cu voce rusă

Renderer-ul este în `.github/workflows/render-video.yml` și `video-renderer/`.

1. Worker-ul creează textul și imaginea prin Workers AI.
2. Worker-ul pornește workflow-ul GitHub `render-vav-reel`.
3. Piper generează local vocea rusă `ru_RU-denis-medium`.
4. FFmpeg produce MP4 H.264, 1080×1920, cu animație și subtitrări.
5. MP4-ul este publicat ca asset în release-ul public `vav-media`.
6. GitHub anunță Worker-ul; botul trimite preview și aşteaptă `/publishvideo ID`.
7. Worker-ul publică prin Instagram Content Publishing API ca `REELS`.

Repository-ul GitHub trebuie să fie public pentru ca Meta și Telegram să poată descărca
fișierul video fără autentificare. În GitHub Actions se salvează secretul
`VAV_CALLBACK_SECRET`, identic cu `VIDEO_CALLBACK_SECRET` din Cloudflare. În
`wrangler.jsonc`, setează `GITHUB_RENDER_REPO` la `owner/repository`.
