# Activarea generatorului Reel

## GitHub

1. Creează un repository public, de exemplu `vav-social-ai`.
2. Încarcă întregul proiect, inclusiv `.github/workflows/render-video.yml`.
3. În `Settings → Actions → General → Workflow permissions`, activează `Read and write permissions`.
4. În `Settings → Secrets and variables → Actions` adaugă `VAV_CALLBACK_SECRET` (minimum 32 caractere).
5. Creează un fine-grained Personal Access Token cu acces numai la acest repository și dreptul de a porni `repository_dispatch`.

## Cloudflare

În `wrangler.jsonc`, adaugă la `vars`:

```json
"GITHUB_RENDER_REPO": "owner/vav-social-ai"
```

Salvează secretele fără a le pune în fișiere:

```bash
npx wrangler secret put GITHUB_RENDER_TOKEN
npx wrangler secret put VIDEO_CALLBACK_SECRET
```

`VIDEO_CALLBACK_SECRET` trebuie să fie aceeași valoare ca `VAV_CALLBACK_SECRET` din GitHub.

## Deploy și test

```bash
npm ci
npm test
npm run typecheck
npx wrangler d1 migrations apply vav-social-ai --remote
npx wrangler deploy
```

În Telegram:

```text
/start
/generate Cum AI-агент ускоряет обработку заказов
/video_status ID
/publishvideo ID
```

Botul trimite mai întâi poza și textul. După randare trimite automat Reel-ul cu voce
și subtitrări. Nimic nu se publică înainte de `/publishvideo ID` sau `/publish3`.
