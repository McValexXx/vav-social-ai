# Transfer pe alt cont Cloudflare

Pachetul nu conține tokenuri reale. Pentru instalarea pe alt cont trebuie refăcute legăturile care aparțin contului Cloudflare vechi:

1. Autorizare Wrangler în contul Cloudflare nou.
2. Creare D1 cu numele `vav-social-ai`.
3. Înlocuire în `wrangler.jsonc` a valorilor `account_id`, `database_id` și `PUBLIC_BASE_URL` cu cele ale contului nou.
4. Aplicarea migrărilor `0001`–`0005`.
5. Salvarea directă ca secrete Cloudflare a valorilor Meta și Telegram.
6. Deploy și verificarea endpoint-ului `/health`.
7. Mutarea webhook-ului Telegram pe URL-ul nou.
8. Configurarea webhook-ului Instagram pentru `messages`.
9. Test în modul sigur: `AUTO_PUBLISH=false`, `/daily3`, `/publish <id>`.
10. Activarea automatizării numai după un test complet reușit.

Nu copia tokenurile vechi din conversații sau arhive. Tokenul Telegram expus anterior trebuie regenerat în BotFather. Tokenul Meta trebuie regenerat sau reautorizat pentru aplicația și contul Instagram corecte.

Programul zilnic configurat este:

- 07:00 Moscova — rubrica 1;
- 12:00 Moscova — rubrica 2;
- 18:00 Moscova — rubrica 3.

Fiecare cron generează o postare nouă și trimite preview în Telegram. Publicarea rămâne manuală cât timp `AUTO_PUBLISH=false`.
