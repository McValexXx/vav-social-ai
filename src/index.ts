import { POSTS, type SocialPost } from "./content";
import { TOPICS, topicByNumber } from "./topics";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI: Ai;
  PUBLIC_BASE_URL: string;
  META_API_VERSION: string;
  AUTOMATION_ENABLED: string;
  AUTO_PUBLISH: string;
  META_ACCESS_TOKEN?: string;
  META_IG_USER_ID?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
  META_APP_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  GITHUB_RENDER_TOKEN?: string;
  GITHUB_RENDER_REPO?: string;
  VIDEO_CALLBACK_SECRET?: string;
}

type DbPost = SocialPost & {
  image_path: string;
  status: string;
  instagram_media_id: string | null;
  variant: number;
  batch_date: string | null;
  batch_slot: number | null;
  source_template: number | null;
  source_name: string | null;
  source_title: string | null;
  source_url: string | null;
  source_published_at: string | null;
};

type InstagramInboundMessage = {
  id: string;
  senderId: string;
  text: string;
};

type NewsItem = {
  source: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
};

type ContentLane = {
  key: string;
  name: string;
  templateId: number;
  angle: string;
  keywords: string[];
};

type GeneratedPostText = {
  title: string;
  caption: string;
};

type DbVideo = {
  post_id: number;
  status: string;
  narration: string;
  video_url: string | null;
  github_run_url: string | null;
  instagram_container_id: string | null;
  instagram_media_id: string | null;
  last_error: string | null;
};

type VideoCallback = {
  post_id?: unknown;
  status?: unknown;
  video_url?: unknown;
  run_url?: unknown;
  error?: unknown;
};

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

const NEWS_FEEDS = [
  { name: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { name: "Google AI", url: "https://blog.google/technology/ai/rss/" },
  { name: "Cloudflare", url: "https://blog.cloudflare.com/rss/" },
  { name: "Salesforce", url: "https://www.salesforce.com/blog/feed/" },
  { name: "HubSpot", url: "https://blog.hubspot.com/marketing/rss.xml" }
] as const;

const CONTENT_LANES: ContentLane[] = [
  {
    key: "ai-agents",
    name: "AI-агенты и новая автоматизация",
    templateId: 1,
    angle: "покажи, как новая AI-возможность меняет ежедневную работу компании и что руководителю проверить уже сейчас",
    keywords: ["agent", "ai", "model", "assistant", "automation", "автомат"]
  },
  {
    key: "crm-sales",
    name: "CRM, продажи и клиентский сервис",
    templateId: 2,
    angle: "переведи тему в практику B2B-продаж, CRM, скорости ответа и контроля воронки",
    keywords: ["crm", "sales", "customer", "lead", "marketing", "service", "revenue"]
  },
  {
    key: "retail-commerce",
    name: "Retail, e-commerce и запасы",
    templateId: 3,
    angle: "объясни влияние на retail, ассортимент, остатки, закупки и покупательский опыт",
    keywords: ["retail", "commerce", "shop", "inventory", "store", "product", "checkout"]
  },
  {
    key: "orders-integrations",
    name: "Заказы, оплата, доставка и интеграции",
    templateId: 4,
    angle: "покажи связанную цепочку от заявки до оплаты и доставки и где бизнес теряет время без интеграций",
    keywords: ["order", "payment", "delivery", "workflow", "integration", "api", "operations"]
  },
  {
    key: "analytics-growth",
    name: "Аналитика, маркетинг и рост",
    templateId: 5,
    angle: "дай руководителю понятный вывод про данные, конверсию, CAC, эффективность маркетинга или управленческие решения",
    keywords: ["analytics", "data", "growth", "conversion", "campaign", "measurement", "insight"]
  },
  {
    key: "process-efficiency",
    name: "Бизнес-процессы и эффективность",
    templateId: 6,
    angle: "разложи тему в короткий процесс до/после и покажи, какие ручные действия можно убрать",
    keywords: ["process", "productivity", "workflow", "automation", "efficiency", "operations"]
  },
  {
    key: "security-audit",
    name: "Безопасность, аудит и устойчивость",
    templateId: 7,
    angle: "объясни риск без запугивания и предложи конкретный чек-лист аудита или безопасного внедрения",
    keywords: ["security", "risk", "privacy", "fraud", "trust", "compliance", "attack"]
  }
];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

async function seed(env: Env): Promise<void> {
  for (const post of POSTS) {
    await env.DB.prepare(`INSERT OR IGNORE INTO posts (id, slug, title, caption, image_path)
      VALUES (?, ?, ?, ?, ?)`).bind(post.id, post.slug, post.title, post.caption, post.imagePath).run();
  }
}

async function logEvent(env: Env, eventType: string, postId?: number, details?: string): Promise<void> {
  await env.DB.prepare("INSERT INTO events (event_type, post_id, details) VALUES (?, ?, ?)")
    .bind(eventType, postId ?? null, details?.slice(0, 1500) ?? null).run();
}

async function telegram(env: Env, method: string, payload: Record<string, unknown>): Promise<unknown> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is missing");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json() as { ok: boolean; description?: string };
  if (!response.ok || !body.ok) throw new Error(body.description ?? `Telegram ${method} failed`);
  return body;
}

async function sendText(env: Env, text: string): Promise<void> {
  if (!env.TELEGRAM_CHAT_ID) return;
  await telegram(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML" });
}

async function syncTelegramCommands(env: Env): Promise<void> {
  await telegram(env, "setMyCommands", {
    commands: [
      { command: "daily3", description: "Создать 3 публикации на сегодня" },
      { command: "publish3", description: "Опубликовать сегодняшний пакет" },
      { command: "generate", description: "Создать текст, изображение, голос и Reel" },
      { command: "video", description: "Создать Reel по теме" },
      { command: "video_status", description: "Статус рендера Reel" },
      { command: "publishvideo", description: "Опубликовать готовый Reel" },
      { command: "topics", description: "Показать 100 тем" },
      { command: "topic", description: "Создать пост по номеру темы" },
      { command: "random", description: "Случайная тема и публикация" },
      { command: "ask", description: "Задать вопрос AI" },
      { command: "status", description: "Статус автоматизации" },
      { command: "preview", description: "Показать следующее превью" },
      { command: "redo", description: "Сменить дизайн публикации" },
      { command: "publish", description: "Опубликовать одну публикацию" },
      { command: "skip", description: "Пропустить публикацию" },
      { command: "help", description: "Все команды" }
    ]
  });
}

async function getNext(env: Env): Promise<DbPost | null> {
  return await env.DB.prepare(`SELECT id, slug, title, caption, image_path, status, instagram_media_id, variant,
    batch_date, batch_slot, source_template, source_name, source_title, source_url, source_published_at
    FROM posts WHERE status IN ('draft','previewed','approved','failed') ORDER BY id LIMIT 1`).first<DbPost>();
}

const POST_COLUMNS = `id, slug, title, caption, image_path, status, instagram_media_id, variant,
  batch_date, batch_slot, source_template, source_name, source_title, source_url, source_published_at`;

function postLabel(post: DbPost): string {
  return post.batch_date
    ? `${post.batch_date} · ${post.batch_slot ?? "?"}/3`
    : post.source_name === "Telegram AI" ? `AI · ID ${post.id}` : `${post.id}/7`;
}

function generatedImagePath(postId: number, variant = 0): string {
  return `/generated/${postId}-${variant}.jpg`;
}

function base64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function d1BlobBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (Array.isArray(value) && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return Uint8Array.from(value);
  }
  throw new Error("Некорректные данные изображения в D1");
}

function jpegBytes(value: unknown): Uint8Array<ArrayBuffer> {
  const bytes = d1BlobBytes(value);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error("Cloudflare AI вернул файл, который не является JPEG");
  }
  return bytes;
}

export function safeImageText(value: string, maxLength: number): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s.,:;!?()\-]/gu, " ")
    .replace(/\b(?:nsfw|nude|nudity|naked|sex|sexual|porn|erotic|fetish|weapon|blood|gore|drug|наркотик\w*|оружи\w*|кров\w*|обнаж\w*|эротик\w*|секс\w*)\b/giu, "business technology")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function isImageSafetyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:\b8007\b|NSFW|unsafe content|safety filter)/i.test(message);
}

async function createPostImage(env: Env, postId: number, variant: number, title: string, topic: string): Promise<string> {
  const prompt = [
    "Premium editorial Instagram visual for a modern B2B technology and automation company.",
    `Business topic: ${safeImageText(topic, 700)}. Main idea: ${safeImageText(title, 160)}.`,
    "Square composition, sophisticated dark navy and electric blue palette, realistic business technology scene,",
    "strong focal point, cinematic studio lighting, clean luxury advertising aesthetic, high detail,",
    "no words, no letters, no logos, no watermark, no interface screenshots."
  ].join(" ");
  const imageAi = env.AI as unknown as {
    run(model: string, input: Record<string, unknown>): Promise<unknown>;
  };
  let result: { image?: string };
  try {
    result = await imageAi.run(IMAGE_MODEL, { prompt: prompt.slice(0, 2048), steps: 4 }) as { image?: string };
  } catch (error) {
    if (!isImageSafetyError(error)) throw error;
    await logEvent(env, "image_safety_retry", postId, "Cloudflare 8007; safe business fallback used");
    result = await imageAi.run(IMAGE_MODEL, {
      prompt: [
        "Safe corporate editorial illustration for a B2B automation company.",
        "Abstract artificial intelligence network, geometric data streams, business analytics and workflow automation.",
        "Empty modern office environment, no people, dark navy and electric blue palette, premium studio lighting,",
        "square composition, clean professional advertising aesthetic, no words, no letters, no logos, no watermark."
      ].join(" "),
      steps: 4
    }) as { image?: string };
  }
  if (!result.image) throw new Error("AI не вернул изображение");
  const bytes = base64Bytes(result.image);
  if (bytes.byteLength === 0 || bytes.byteLength > 1_900_000) {
    throw new Error(`Некорректный размер изображения: ${bytes.byteLength} байт`);
  }
  await env.DB.prepare(`INSERT OR REPLACE INTO generated_images (post_id, variant, jpeg)
    VALUES (?, ?, ?)`).bind(postId, variant, bytes.buffer).run();
  return generatedImagePath(postId, variant);
}

async function getPostById(env: Env, id: number): Promise<DbPost | null> {
  return await env.DB.prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE id=?`).bind(id).first<DbPost>();
}

async function sendPreviewPhoto(env: Env, post: DbPost, caption: string): Promise<void> {
  if (!env.TELEGRAM_CHAT_ID) throw new Error("TELEGRAM_CHAT_ID is missing");
  const generated = post.image_path.match(/^\/generated\/(\d+)-(\d+)\.jpg$/);
  if (!generated) {
    await telegram(env, "sendPhoto", {
      chat_id: env.TELEGRAM_CHAT_ID,
      photo: `${env.PUBLIC_BASE_URL}${post.image_path}`,
      caption,
      parse_mode: "HTML"
    });
    return;
  }
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is missing");
  const row = await env.DB.prepare("SELECT jpeg FROM generated_images WHERE post_id=? AND variant=?")
    .bind(Number(generated[1]), Number(generated[2])).first<{ jpeg: number[] }>();
  if (!row?.jpeg) throw new Error("Сгенерированное изображение не найдено в D1");
  const bytes = jpegBytes(row.jpeg);
  const form = new FormData();
  form.set("chat_id", env.TELEGRAM_CHAT_ID);
  form.set("caption", caption);
  form.set("parse_mode", "HTML");
  form.set("photo", new Blob([bytes], { type: "image/jpeg" }), `vav-${post.id}-${post.variant}.jpg`);
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: form
  });
  const body = await response.json() as { ok: boolean; description?: string };
  if (!response.ok || !body.ok) throw new Error(body.description ?? "Telegram sendPhoto failed");
}

async function preview(env: Env, post: DbPost): Promise<void> {
  if (!env.TELEGRAM_CHAT_ID) throw new Error("TELEGRAM_CHAT_ID is missing");
  await sendPreviewPhoto(env, post,
    `<b>${escapeHtml(postLabel(post))} — ${escapeHtml(post.title)}</b>\nВариант дизайна: ${post.variant + 1}/3`);
  await sendText(env, `<b>Текст публикации</b>\n\n${escapeHtml(post.caption).slice(0, 3800)}`);
  await env.DB.prepare("UPDATE posts SET status='previewed', previewed_at=CURRENT_TIMESTAMP, last_error=NULL WHERE id=?")
    .bind(post.id).run();
  await logEvent(env, "preview", post.id);
}

function videoRendererConfigured(env: Env): boolean {
  return Boolean(env.GITHUB_RENDER_TOKEN && env.GITHUB_RENDER_REPO && env.VIDEO_CALLBACK_SECRET);
}

async function getVideo(env: Env, postId: number): Promise<DbVideo | null> {
  return env.DB.prepare(`SELECT post_id, status, narration, video_url, github_run_url,
    instagram_container_id, instagram_media_id, last_error FROM videos WHERE post_id=?`)
    .bind(postId).first<DbVideo>();
}

async function createVideoNarration(env: Env, post: DbPost): Promise<string> {
  const prompt = `Создай текст русской озвучки для вертикального Instagram Reel бренда VAV Group.
Тема: ${post.title}
Материал публикации: ${post.caption.slice(0, 1700)}
Длительность: 25–35 секунд, 65–90 слов. Начни с сильного честного hook. Используй короткие фразы, один практический вывод и заверши призывом написать «АВТОМАТИЗАЦИЯ» в Direct. Не произноси хэштеги. Не выдумывай цифры, клиентов или результаты. Верни только текст озвучки.`;
  const result = await env.AI.run(AI_MODEL, {
    messages: [
      { role: "system", content: "Ты — режиссёр коротких B2B-видео и редактор русской речи. Пиши естественно, убедительно и без канцелярита." },
      { role: "user", content: prompt }
    ],
    max_tokens: 260,
    temperature: 0.55
  }) as AiTextResult;
  const narration = result.response?.trim().replace(/^```\w*\s*|\s*```$/g, "");
  if (!narration) throw new Error("AI не подготовил текст озвучки");
  return narration.slice(0, 1800);
}

async function queueVideo(env: Env, post: DbPost): Promise<DbVideo> {
  if (!videoRendererConfigured(env)) {
    throw new Error("Рендер видео ещё не подключён: отсутствуют GitHub secrets");
  }
  const existing = await getVideo(env, post.id);
  if (existing && ["queued", "rendering", "ready", "publishing", "published"].includes(existing.status)) return existing;
  const narration = existing?.narration || await createVideoNarration(env, post);
  await env.DB.prepare(`INSERT INTO videos (post_id, status, narration, last_error, requested_at)
    VALUES (?, 'queued', ?, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(post_id) DO UPDATE SET status='queued', narration=excluded.narration,
      video_url=NULL, github_run_url=NULL, instagram_container_id=NULL, instagram_media_id=NULL,
      last_error=NULL, requested_at=CURRENT_TIMESTAMP, completed_at=NULL, published_at=NULL`)
    .bind(post.id, narration).run();

  const repo = env.GITHUB_RENDER_REPO!;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("GITHUB_RENDER_REPO должен быть в формате owner/repository");
  const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.GITHUB_RENDER_TOKEN}`,
      "accept": "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "VAV-Social-AI/2.0",
      "x-github-api-version": "2022-11-28"
    },
    body: JSON.stringify({
      event_type: "render-vav-reel",
      client_payload: {
        post_id: String(post.id),
        title: post.title,
        narration,
        image_url: `${env.PUBLIC_BASE_URL}${post.image_path}`,
        callback_url: `${env.PUBLIC_BASE_URL}/video/callback`
      }
    })
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 900);
    await env.DB.prepare("UPDATE videos SET status='failed', last_error=? WHERE post_id=?")
      .bind(`GitHub HTTP ${response.status}: ${details}`, post.id).run();
    throw new Error(`GitHub renderer: HTTP ${response.status}`);
  }
  await logEvent(env, "video_queued", post.id, repo);
  const queued = await getVideo(env, post.id);
  if (!queued) throw new Error("Не удалось сохранить задачу видео");
  return queued;
}

async function sendVideoPreview(env: Env, post: DbPost, videoUrl: string): Promise<void> {
  if (!env.TELEGRAM_CHAT_ID) return;
  await telegram(env, "sendVideo", {
    chat_id: env.TELEGRAM_CHAT_ID,
    video: videoUrl,
    caption: `<b>Reel готов · ${escapeHtml(postLabel(post))}</b>\n${escapeHtml(post.title)}\n\nОпубликовать: /publishvideo ${post.id}`,
    parse_mode: "HTML",
    supports_streaming: true
  });
}

async function acceptVideoCallback(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = env.VIDEO_CALLBACK_SECRET ? `Bearer ${env.VIDEO_CALLBACK_SECRET}` : "";
  if (!expected || !secureEqual(authorization, expected)) return json({ ok: false, error: "unauthorized" }, 401);
  let payload: VideoCallback;
  try {
    payload = await request.json<VideoCallback>();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const postId = Number(payload.post_id);
  const status = String(payload.status ?? "");
  if (!Number.isSafeInteger(postId) || !["rendering", "ready", "failed"].includes(status)) {
    return json({ ok: false, error: "invalid_payload" }, 400);
  }
  const videoUrl = typeof payload.video_url === "string" ? payload.video_url : null;
  const runUrl = typeof payload.run_url === "string" ? payload.run_url : null;
  const error = typeof payload.error === "string" ? payload.error.slice(0, 1500) : null;
  if (status === "ready" && (!videoUrl || !/^https:\/\//i.test(videoUrl))) {
    return json({ ok: false, error: "video_url_required" }, 400);
  }
  await env.DB.prepare(`UPDATE videos SET status=?, video_url=COALESCE(?, video_url),
    github_run_url=COALESCE(?, github_run_url), last_error=?,
    completed_at=CASE WHEN ? IN ('ready','failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE post_id=?`).bind(status, videoUrl, runUrl, error, status, postId).run();
  await logEvent(env, `video_${status}`, postId, error ?? videoUrl ?? runUrl ?? undefined);
  const post = await getPostById(env, postId);
  if (post && status === "ready" && videoUrl) {
    ctx.waitUntil(sendVideoPreview(env, post, videoUrl).catch(async error => {
      const details = error instanceof Error ? error.message : String(error);
      await logEvent(env, "video_preview_failed", postId, details);
      await sendText(env, `⚠️ Reel ID ${postId} готов, но Telegram не показал видео автоматически. Повторить: /video_status ${postId}`);
    }));
  }
  if (status === "failed") ctx.waitUntil(sendText(env, `❌ Рендер Reel ID ${postId} завершился ошибкой: ${escapeHtml(error ?? "неизвестная ошибка")}`));
  return json({ ok: true });
}

async function metaPost(env: Env, path: string, data: Record<string, string>): Promise<any> {
  if (!env.META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN is missing");
  const body = new URLSearchParams({ ...data, access_token: env.META_ACCESS_TOKEN });
  const response = await fetch(`https://graph.instagram.com/${env.META_API_VERSION}${path}`, { method: "POST", body });
  const result = await response.json() as any;
  if (!response.ok || result.error) throw new Error(result.error?.message ?? "Instagram API error");
  return result;
}

async function metaGet(env: Env, path: string, fields: string): Promise<any> {
  if (!env.META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN is missing");
  const url = new URL(`https://graph.instagram.com/${env.META_API_VERSION}${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", env.META_ACCESS_TOKEN);
  const response = await fetch(url);
  const result = await response.json() as any;
  if (!response.ok || result.error) throw new Error(result.error?.message ?? "Instagram API error");
  return result;
}

async function metaJsonPost(env: Env, path: string, data: Record<string, unknown>): Promise<any> {
  if (!env.META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN is missing");
  const url = new URL(`https://graph.instagram.com/${env.META_API_VERSION}${path}`);
  url.searchParams.set("access_token", env.META_ACCESS_TOKEN);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await response.json() as any;
  if (!response.ok || result.error) throw new Error(result.error?.message ?? "Instagram API error");
  return result;
}

function secureEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.byteLength !== b.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < a.byteLength; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function validMetaSignature(rawBody: ArrayBuffer, signature: string | null, secret?: string): Promise<boolean> {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, rawBody);
  const expected = `sha256=${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
  return secureEqual(expected, signature);
}

export function containsAutomationKeyword(text: string): boolean {
  return /(?:автоматизац|automatiz)/iu.test(text.normalize("NFKC"));
}

function instagramMessages(payload: any): InstagramInboundMessage[] {
  if (payload?.object !== "instagram" || !Array.isArray(payload.entry)) return [];
  const messages: InstagramInboundMessage[] = [];
  for (const entry of payload.entry) {
    if (!Array.isArray(entry?.messaging)) continue;
    for (const event of entry.messaging) {
      const text = event?.message?.text;
      const id = event?.message?.mid;
      const senderId = event?.sender?.id;
      if (typeof text === "string" && typeof id === "string" && typeof senderId === "string" && !event?.message?.is_echo) {
        messages.push({ id, senderId, text });
      }
    }
  }
  return messages;
}

const INSTAGRAM_AUTO_REPLY = [
  "Здравствуйте! Спасибо за интерес к автоматизации VAV Group.",
  "Чтобы предложить подходящее решение, напишите, пожалуйста:",
  "1. Сфера вашего бизнеса",
  "2. Какой процесс хотите автоматизировать",
  "3. Сколько обращений или заказов получаете в месяц",
  "Валентин изучит задачу и свяжется с вами."
].join("\n");

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function processInstagramMessage(env: Env, message: InstagramInboundMessage): Promise<void> {
  const matched = containsAutomationKeyword(message.text);
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO instagram_messages
    (message_id, sender_id, message_text, keyword_matched) VALUES (?, ?, ?, ?)`)
    .bind(message.id, message.senderId, message.text.slice(0, 4000), matched ? 1 : 0).run();
  if ((inserted.meta?.changes ?? 0) === 0 || !matched) return;

  try {
    await metaJsonPost(env, "/me/messages", {
      recipient: { id: message.senderId },
      message: { text: INSTAGRAM_AUTO_REPLY }
    });
    await env.DB.prepare(`UPDATE instagram_messages SET replied=1, replied_at=CURRENT_TIMESTAMP,
      error=NULL WHERE message_id=?`).bind(message.id).run();
    await logEvent(env, "instagram_auto_reply", undefined, `sender=${message.senderId}`);
    await sendText(env, `💬 <b>Новый лид из Instagram</b>\nКлючевое слово: АВТОМАТИЗАЦИЯ\nСообщение: ${escapeHtml(message.text.slice(0, 600))}`);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    await env.DB.prepare("UPDATE instagram_messages SET error=? WHERE message_id=?")
      .bind(details.slice(0, 1500), message.id).run();
    await logEvent(env, "instagram_auto_reply_failed", undefined, details);
    await sendText(env, `❌ Не удалось ответить лиду Instagram: ${escapeHtml(details)}`);
  }
}

function verifyInstagramWebhook(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode === "subscribe" && env.META_WEBHOOK_VERIFY_TOKEN && secureEqual(token, env.META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(challenge, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response("Forbidden", { status: 403 });
}

async function acceptInstagramWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const rawBody = await request.arrayBuffer();
  const signatureValid = await validMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), env.META_APP_SECRET);
  if (!signatureValid) return json({ ok: false, error: "invalid_signature" }, 401);
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const messages = instagramMessages(payload);
  ctx.waitUntil(Promise.all(messages.map(message => processInstagramMessage(env, message))).then(() => undefined));
  return json({ ok: true, accepted: messages.length });
}

async function waitForContainer(env: Env, containerId: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const state = await metaGet(env, `/${containerId}`, "status_code,status");
    if (state.status_code === "FINISHED") return;
    if (state.status_code === "ERROR" || state.status_code === "EXPIRED") {
      throw new Error(`Instagram container ${state.status_code}: ${state.status ?? "unknown error"}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error("Instagram is still processing the image. Retry /publish in one minute.");
}

async function publishImage(env: Env, post: DbPost): Promise<string> {
  if (!env.META_IG_USER_ID) throw new Error("META_IG_USER_ID is missing");
  const imageUrl = `${env.PUBLIC_BASE_URL}${post.image_path}`;
  try {
    const container = await metaPost(env, `/${env.META_IG_USER_ID}/media`, {
      image_url: imageUrl,
      caption: post.caption
    });
    if (!container.id) throw new Error("Instagram did not return a container ID");
    await waitForContainer(env, String(container.id));
    const published = await metaPost(env, `/${env.META_IG_USER_ID}/media_publish`, {
      creation_id: String(container.id)
    });
    await env.DB.prepare(`UPDATE posts SET status='published', instagram_media_id=?, published_at=CURRENT_TIMESTAMP,
      last_error=NULL WHERE id=?`).bind(String(published.id), post.id).run();
    await logEvent(env, "published", post.id, String(published.id));
    return String(published.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare("UPDATE posts SET status='failed', last_error=? WHERE id=?").bind(message, post.id).run();
    await logEvent(env, "publish_failed", post.id, message);
    throw error;
  }
}

async function publishReel(env: Env, post: DbPost, video: DbVideo): Promise<string> {
  if (!env.META_IG_USER_ID) throw new Error("META_IG_USER_ID is missing");
  if (!video.video_url || !["ready", "publishing"].includes(video.status)) {
    throw new Error(`Reel ещё не готов. Статус: ${video.status}`);
  }
  let containerId = video.instagram_container_id;
  try {
    if (!containerId) {
      const container = await metaPost(env, `/${env.META_IG_USER_ID}/media`, {
        media_type: "REELS",
        video_url: video.video_url,
        caption: post.caption,
        share_to_feed: "true"
      });
      if (!container.id) throw new Error("Instagram did not return a Reel container ID");
      containerId = String(container.id);
      await env.DB.prepare("UPDATE videos SET status='publishing', instagram_container_id=?, last_error=NULL WHERE post_id=?")
        .bind(containerId, post.id).run();
    }
    await waitForContainer(env, containerId);
    const published = await metaPost(env, `/${env.META_IG_USER_ID}/media_publish`, { creation_id: containerId });
    const mediaId = String(published.id);
    await env.DB.prepare(`UPDATE videos SET status='published', instagram_media_id=?, published_at=CURRENT_TIMESTAMP,
      last_error=NULL WHERE post_id=?`).bind(mediaId, post.id).run();
    await env.DB.prepare(`UPDATE posts SET status='published', instagram_media_id=?, published_at=CURRENT_TIMESTAMP,
      last_error=NULL WHERE id=?`).bind(mediaId, post.id).run();
    await logEvent(env, "reel_published", post.id, mediaId);
    return mediaId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stillProcessing = message.includes("still processing");
    await env.DB.prepare("UPDATE videos SET status=?, last_error=? WHERE post_id=?")
      .bind(stillProcessing ? "publishing" : "failed", message.slice(0, 1500), post.id).run();
    if (!stillProcessing) {
      await env.DB.prepare("UPDATE posts SET status='failed', last_error=? WHERE id=?")
        .bind(message.slice(0, 1500), post.id).run();
    }
    await logEvent(env, "reel_publish_failed", post.id, message);
    throw error;
  }
}

async function publishPost(env: Env, post: DbPost): Promise<string> {
  const video = await getVideo(env, post.id);
  if (video) {
    if (["ready", "publishing"].includes(video.status)) return publishReel(env, post, video);
    if (["queued", "rendering"].includes(video.status)) throw new Error(`Reel ID ${post.id} ещё создаётся. Статус: ${video.status}`);
  }
  return publishImage(env, post);
}

function moscowDate(now = new Date()): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dateSerial(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function xmlTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

export function parseNewsFeed(xml: string, source: string): NewsItem[] {
  const rssBlocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const atomBlocks = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? [];
  return [...rssBlocks, ...atomBlocks].map(block => {
    const atomLink = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
    const title = xmlTag(block, "title");
    const url = xmlTag(block, "link") || decodeXml(atomLink);
    const summary = xmlTag(block, "description") || xmlTag(block, "summary") || xmlTag(block, "content");
    const publishedAt = xmlTag(block, "pubDate") || xmlTag(block, "published") || xmlTag(block, "updated");
    return { source, title, url, summary: summary.slice(0, 900), publishedAt };
  }).filter(item => item.title.length > 8 && /^https?:\/\//i.test(item.url));
}

async function fetchNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(NEWS_FEEDS.map(async feed => {
    const response = await fetch(feed.url, {
      headers: { "user-agent": "VAVSocialAI/1.0 (+https://vavgroup.pro)" }
    });
    if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);
    return parseNewsFeed(await response.text(), feed.name);
  }));
  const items = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const unique = new Map<string, NewsItem>();
  for (const item of items) {
    const key = item.url.replace(/[?#].*$/, "").toLowerCase();
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].sort((left, right) => {
    const a = Date.parse(left.publishedAt) || 0;
    const b = Date.parse(right.publishedAt) || 0;
    return b - a;
  });
}

function laneFor(date: string, slot: number): ContentLane {
  return CONTENT_LANES[(dateSerial(date) * 3 + slot - 1) % CONTENT_LANES.length];
}

function relevance(item: NewsItem, lane: ContentLane): number {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const keywordScore = lane.keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 4 : 0), 0);
  const published = Date.parse(item.publishedAt);
  const ageDays = Number.isFinite(published) ? Math.max(0, (Date.now() - published) / 86_400_000) : 60;
  return keywordScore + Math.max(0, 8 - ageDays / 5);
}

function chooseNews(items: NewsItem[], lane: ContentLane, usedUrls: Set<string>): NewsItem | null {
  const candidates = items
    .filter(item => !usedUrls.has(item.url))
    .map(item => ({ item, score: relevance(item, lane) }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.score >= 4 ? candidates[0].item : null;
}

function cleanGeneratedText(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseGeneratedPost(value: string, fallbackTitle: string): GeneratedPostText {
  const cleaned = cleanGeneratedText(value);
  const delimited = cleaned.match(/(?:ЗАГОЛОВОК|TITLE)\s*:\s*([^\n]+)\n+(?:ТЕКСТ|CAPTION)\s*:\s*([\s\S]+)/i);
  if (delimited) {
    return { title: delimited[1].trim().slice(0, 120), caption: delimited[2].trim().slice(0, 2100) };
  }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<GeneratedPostText>;
      if (typeof parsed.title === "string" && typeof parsed.caption === "string") {
        return { title: parsed.title.trim().slice(0, 120), caption: parsed.caption.trim().slice(0, 2100) };
      }
    } catch {
      // Fall back to the plain response below.
    }
  }
  const looseTitle = cleaned.match(/["']?title["']?\s*:\s*["']([^"'\n]{4,160})["']/i)?.[1];
  const looseCaption = cleaned.match(/["']?caption["']?\s*:\s*["']([\s\S]*?)["']\s*\}?\s*$/i)?.[1];
  if (looseTitle && looseCaption) {
    return {
      title: looseTitle.trim().slice(0, 120),
      caption: looseCaption.replaceAll("\\n", "\n").replaceAll('\\"', '"').trim().slice(0, 2100)
    };
  }
  const lines = cleaned.split("\n").map(line => line.trim()).filter(Boolean);
  const firstLine = lines.shift() ?? fallbackTitle;
  const title = (/^\s*\{?\s*["']?(?:title|caption)["']?\s*:/i.test(firstLine) ? fallbackTitle : firstLine)
    .replace(/^#+\s*/, "").slice(0, 120);
  return { title, caption: (lines.join("\n\n") || cleaned).slice(0, 2100) };
}

function malformedGeneratedPost(post: DbPost): boolean {
  return /^\s*\{?\s*["']?(?:title|caption)["']?\s*:/i.test(post.title)
    || post.title.includes('"caption"');
}

async function createDailyPostText(env: Env, lane: ContentLane, news: NewsItem | null): Promise<GeneratedPostText> {
  const sourceBrief = news
    ? `Проверенный источник: ${news.source}\nЗаголовок материала: ${news.title}\nКраткое описание: ${news.summary || "нет описания"}\nСсылка: ${news.url}\nДата: ${news.publishedAt || "не указана"}`
    : "Свежий источник сейчас недоступен. Создай evergreen-публикацию и НЕ называй её новостью.";
  const system = `Ты — контент-директор VAV Group и команда B2B-маркетинга с 30-летней совокупной практикой.
Создай оригинальную публикацию для русскоязычного Instagram. Цель — сохранения, комментарии, переходы в профиль и новые подписчики без ложного кликбейта.
Правила:
1. Верни только два блока без JSON и без Markdown: ЗАГОЛОВОК: одна строка, затем ТЕКСТ: полный текст публикации.
2. title: сильный конкретный hook до 85 символов, без недоказанных обещаний.
3. caption: 600–1500 символов, короткие абзацы, максимум 3 уместных emoji.
4. Формула: интрига → почему это важно бизнесу → 3 практических вывода → вопрос аудитории → CTA написать «АВТОМАТИЗАЦИЯ» в Direct → 5–8 релевантных хэштегов.
5. Не выдумывай цифры, исследования, клиентов, цитаты и функции продукта. Не копируй исходный текст.
6. Если дан источник, честно укажи в конце «Источник: НАЗВАНИЕ» и не выдавай прогноз за факт.
7. Пиши уверенно, современно, профессионально и понятно собственнику бизнеса.`;
  const user = `Рубрика: ${lane.name}.\nМаркетинговый угол: ${lane.angle}.\n${sourceBrief}`;
  const result = await env.AI.run(AI_MODEL, {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_tokens: 850,
    temperature: 0.72
  }) as AiTextResult;
  const output = result.response?.trim();
  if (!output) throw new Error("AI не вернул ежедневную публикацию");
  return parseGeneratedPost(output, news?.title ?? lane.name);
}

async function dailyPosts(env: Env, date: string): Promise<DbPost[]> {
  const rows = await env.DB.prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE batch_date=? ORDER BY batch_slot`)
    .bind(date).all<DbPost>();
  return rows.results;
}

async function generateDailyPost(env: Env, date: string, slot: number, newsItems: NewsItem[]): Promise<DbPost> {
  const existing = await env.DB.prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE batch_date=? AND batch_slot=?`)
    .bind(date, slot).first<DbPost>();
  if (existing && !malformedGeneratedPost(existing) && existing.image_path.startsWith("/generated/")) return existing;

  const current = await dailyPosts(env, date);
  const usedUrls = new Set(current.map(post => post.source_url).filter((url): url is string => Boolean(url)));
  const lane = laneFor(date, slot);
  const news = chooseNews(newsItems, lane, usedUrls);
  const generated = await createDailyPostText(env, lane, news);
  const template = POSTS.find(post => post.id === lane.templateId) ?? POSTS[0];
  const slug = `daily-${date}-${slot}-${lane.key}`;
  if (existing) {
    const imagePath = await createPostImage(env, existing.id, 0, generated.title, `${lane.name}. ${news?.title ?? lane.angle}`);
    await env.DB.prepare(`UPDATE posts SET title=?, caption=?, image_path=?, status='draft', last_error=NULL,
      source_template=?, source_name=?, source_title=?, source_url=?, source_published_at=? WHERE id=?`)
      .bind(generated.title, generated.caption, imagePath, lane.templateId, news?.source ?? null,
        news?.title ?? null, news?.url ?? null, news?.publishedAt ?? null, existing.id).run();
    await logEvent(env, "daily_repair", existing.id, `${date} slot=${slot} lane=${lane.key}`);
    const repaired = await getPostById(env, existing.id);
    if (!repaired) throw new Error("Исправленная публикация не найдена в D1");
    return repaired;
  }
  const inserted = await env.DB.prepare(`INSERT INTO posts
    (slug, title, caption, image_path, status, batch_date, batch_slot, source_template,
     source_name, source_title, source_url, source_published_at)
    VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`)
    .bind(slug, generated.title, generated.caption, template.imagePath, date, slot, lane.templateId,
      news?.source ?? null, news?.title ?? null, news?.url ?? null, news?.publishedAt ?? null).run();
  const id = Number(inserted.meta.last_row_id);
  const imagePath = await createPostImage(env, id, 0, generated.title, `${lane.name}. ${news?.title ?? lane.angle}`);
  await env.DB.prepare("UPDATE posts SET image_path=? WHERE id=?").bind(imagePath, id).run();
  await env.DB.prepare(`INSERT INTO ai_generations (generation_type, prompt, output)
    VALUES ('daily_post', ?, ?)`)
    .bind(`${date} slot=${slot} lane=${lane.key} source=${news?.url ?? "evergreen"}`, generated.caption).run();
  await logEvent(env, "daily_generate", id, `${date} slot=${slot} lane=${lane.key}`);
  const post = await getPostById(env, id);
  if (!post) throw new Error("Созданная публикация не найдена в D1");
  return post;
}

async function generateDailyBatch(env: Env, date = moscowDate()): Promise<DbPost[]> {
  await seed(env);
  const news = await fetchNews();
  const posts: DbPost[] = [];
  for (const slot of [1, 2, 3]) {
    const post = await generateDailyPost(env, date, slot, news);
    posts.push(post);
    if ((slot === 1 || slot === 3) && videoRendererConfigured(env)) await queueVideo(env, post);
  }
  return posts;
}

async function previewDailyBatch(env: Env, posts: DbPost[]): Promise<void> {
  for (const post of posts) {
    if (["draft", "failed"].includes(post.status)) await preview(env, post);
  }
  await sendText(env, `Готовы 3 публикации на ${posts[0]?.batch_date ?? moscowDate()}.\nПроверить и опубликовать все: /publish3\nСменить дизайн одной: /redo ID`);
}

async function publishDailyBatch(env: Env, date = moscowDate()): Promise<void> {
  const posts = (await dailyPosts(env, date)).filter(post => ["previewed", "approved", "failed"].includes(post.status));
  if (!posts.length) {
    await sendText(env, "На сегодня нет подготовленных публикаций. Используйте /daily3");
    return;
  }
  const published: string[] = [];
  const failed: string[] = [];
  for (const post of posts) {
    try {
      const mediaId = await publishPost(env, post);
      published.push(`${post.batch_slot}/3 — ${post.title} (<code>${mediaId}</code>)`);
    } catch (error) {
      failed.push(`${post.batch_slot}/3 — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await sendText(env, [
    published.length ? `✅ <b>Опубликовано</b>\n${published.join("\n")}` : "",
    failed.length ? `❌ <b>Ошибки</b>\n${failed.map(escapeHtml).join("\n")}` : ""
  ].filter(Boolean).join("\n\n"));
}

async function statusText(env: Env): Promise<string> {
  const rows = await env.DB.prepare("SELECT status, COUNT(*) count FROM posts GROUP BY status").all<{ status: string; count: number }>();
  const counts = Object.fromEntries(rows.results.map(r => [r.status, r.count]));
  const next = await getNext(env);
  const today = moscowDate();
  const todayRows = await dailyPosts(env, today);
  const videoRows = await env.DB.prepare("SELECT status, COUNT(*) count FROM videos GROUP BY status")
    .all<{ status: string; count: number }>();
  const videoCounts = Object.fromEntries(videoRows.results.map(row => [row.status, row.count]));
  return [
    "<b>VAV Social AI</b>",
    `Автоматизация: <b>${env.AUTOMATION_ENABLED === "true" ? "включена" : "выключена"}</b>`,
    `Автопубликация: <b>${env.AUTO_PUBLISH === "true" ? "включена" : "ручное подтверждение"}</b>`,
    `Всего опубликовано: ${counts.published ?? 0}`,
    `Сегодня подготовлено: ${todayRows.length}/3`,
    `Сегодня опубликовано: ${todayRows.filter(post => post.status === "published").length}/3`,
    `Reels готовы: ${videoCounts.ready ?? 0}; создаются: ${(videoCounts.queued ?? 0) + (videoCounts.rendering ?? 0)}`,
    `Видеорендер: <b>${videoRendererConfigured(env) ? "подключён" : "не настроен"}</b>`,
    `Следующий пост: ${next ? `${postLabel(next)} — ${next.title} (${next.status})` : "нет"}`
  ].join("\n");
}

type AiTextResult = { response?: string };

async function generateWithAi(env: Env, prompt: string, mode: "post" | "answer"): Promise<string> {
  const cleanPrompt = prompt.trim().slice(0, 1500);
  if (!cleanPrompt) throw new Error(mode === "post"
    ? "Используйте: /generate <тема или задание>"
    : "Используйте: /ask <вопрос>");

  const system = mode === "post"
    ? `Ты — контент-директор VAV Group и B2B-маркетолог с 30-летней практикой. Создай профессиональную публикацию для Instagram на русском языке по заданию пользователя.
Структура: сильный честный hook, короткие абзацы, практическая ценность, вопрос аудитории, призыв написать «АВТОМАТИЗАЦИЯ» в Direct и 5–8 релевантных хэштегов.
Темы бренда: AI-агенты, CRM, продажи, автоматизация заказов, retail, оплата, доставка, аналитика, маркетинг, консалтинг, безопасность и рост бизнеса.
Не придумывай статистику, новости, клиентов и гарантированные результаты.
Верни только два блока без JSON и без Markdown: ЗАГОЛОВОК: одна строка, затем ТЕКСТ: полный текст публикации.`
    : `Ты — полезный бизнес-ассистент VAV Group. Ответь на русском языке ясно, конкретно и профессионально. Не выдумывай факты. Если данных недостаточно, прямо укажи это. Дай практический ответ без лишних вступлений.`;

  const result = await env.AI.run(AI_MODEL, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: cleanPrompt }
    ],
    max_tokens: mode === "post" ? 650 : 800,
    temperature: 0.6
  }) as AiTextResult;
  const output = result.response?.trim();
  if (!output) throw new Error("AI не вернул текст. Повторите запрос.");

  await env.DB.prepare(`INSERT INTO ai_generations (generation_type, prompt, output)
    VALUES (?, ?, ?)`).bind(mode, cleanPrompt, output.slice(0, 12000)).run();
  await logEvent(env, mode === "post" ? "ai_generate_post" : "ai_answer", undefined, cleanPrompt);
  return output;
}

async function generateCustomPost(env: Env, prompt: string): Promise<DbPost> {
  const cleanPrompt = prompt.trim().slice(0, 1500);
  if (!cleanPrompt) throw new Error("Используйте: /generate <тема или задание>");
  const output = await generateWithAi(env, cleanPrompt, "post");
  const generated = parseGeneratedPost(output, cleanPrompt);
  const slug = `custom-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const inserted = await env.DB.prepare(`INSERT INTO posts
    (slug, title, caption, image_path, status, source_name, source_title)
    VALUES (?, ?, ?, ?, 'draft', 'Telegram AI', ?)`)
    .bind(slug, generated.title, generated.caption, POSTS[0].imagePath, cleanPrompt).run();
  const id = Number(inserted.meta.last_row_id);
  try {
    const imagePath = await createPostImage(env, id, 0, generated.title, cleanPrompt);
    await env.DB.prepare("UPDATE posts SET image_path=? WHERE id=?").bind(imagePath, id).run();
    const post = await getPostById(env, id);
    if (!post) throw new Error("Созданная публикация не найдена в D1");
    await logEvent(env, "ai_generate_package", id, cleanPrompt);
    return post;
  } catch (error) {
    await env.DB.prepare("DELETE FROM posts WHERE id=?").bind(id).run();
    throw error;
  }
}

async function claimTelegramUpdate(env: Env, updateId: unknown): Promise<boolean> {
  const id = Number(updateId);
  if (!Number.isSafeInteger(id)) return true;
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO telegram_updates (update_id)
    VALUES (?)`).bind(id).run();
  return (inserted.meta?.changes ?? 0) > 0;
}

async function runTelegramAiCommand(env: Env, command: "/generate" | "/ask", arg: string): Promise<void> {
  try {
    if (command === "/generate") {
      const post = await generateCustomPost(env, arg);
      await preview(env, post);
      if (videoRendererConfigured(env)) {
        await queueVideo(env, post);
        await sendText(env, `✅ Текст и изображение готовы. Озвучка и Reel поставлены в рендер.\nСтатус: /video_status ${post.id}\nПосле готовности: /publishvideo ${post.id}\nДругое изображение: /redo ${post.id}`);
      } else {
        await sendText(env, `✅ Текст и новое изображение готовы.\nОпубликовать фото: /publish ${post.id}\nСделать другое изображение: /redo ${post.id}\n⚠️ Видеорендер пока не подключён.`);
      }
    } else {
      const generated = await generateWithAi(env, arg, "answer");
      await sendText(env, `<b>Ответ</b>\n\n${escapeHtml(generated).slice(0, 3800)}`);
    }
  } catch (error) {
    await sendText(env, `❌ ${escapeHtml(error instanceof Error ? error.message : String(error))}`);
  }
}

async function sendVideoStatus(env: Env, postId: number): Promise<void> {
  const video = await getVideo(env, postId);
  if (!video) {
    await sendText(env, `Для публикации ID ${postId} видео ещё не создавалось.`);
    return;
  }
  if (video.status === "ready" && video.video_url) {
    const post = await getPostById(env, postId);
    if (post) {
      await sendVideoPreview(env, post, video.video_url);
      return;
    }
  }
  const labels: Record<string, string> = {
    queued: "в очереди",
    rendering: "создаётся",
    ready: "готово",
    publishing: "обрабатывается Instagram",
    published: "опубликовано",
    failed: "ошибка"
  };
  await sendText(env, [
    `<b>Reel ID ${postId}</b>`,
    `Статус: ${labels[video.status] ?? escapeHtml(video.status)}`,
    video.status === "ready" ? `Опубликовать: /publishvideo ${postId}` : "",
    video.last_error ? `Ошибка: ${escapeHtml(video.last_error)}` : ""
  ].filter(Boolean).join("\n"));
}

async function sendTopicList(env: Env): Promise<void> {
  await sendText(env, "<b>100 тем VAV Group</b>\nВыберите номер, например: <code>/topic 25</code>");
  for (let start = 0; start < TOPICS.length; start += 20) {
    const lines = TOPICS.slice(start, start + 20)
      .map((topic, offset) => `<b>${start + offset + 1}.</b> ${escapeHtml(topic)}`);
    await sendText(env, lines.join("\n"));
  }
}

export function parseTelegramCommand(text: string): { command: string; arg: string } {
  const normalized = text.normalize("NFKC").replace(/[\u00A0\u2007\u202F]/g, " ").trim();
  const match = normalized.match(/^\/(\w+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/u);
  if (!match) return { command: normalized.toLowerCase(), arg: "" };
  return { command: `/${match[1].toLowerCase()}`, arg: (match[2] ?? "").trim() };
}

async function handleTelegram(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!env.TELEGRAM_WEBHOOK_SECRET || receivedSecret !== env.TELEGRAM_WEBHOOK_SECRET) return json({ ok: false }, 403);
  const update = await request.json() as any;
  const message = update.message;
  if (!message?.chat?.id || !message.text) return json({ ok: true });
  const chatId = String(message.chat.id);
  if (env.TELEGRAM_CHAT_ID && chatId !== env.TELEGRAM_CHAT_ID) return json({ ok: true });
  const { command, arg } = parseTelegramCommand(String(message.text));
  try {
    await seed(env);
    if (!await claimTelegramUpdate(env, update.update_id)) return json({ ok: true, duplicate: true });
    if (command === "/start" || command === "/help") {
      await syncTelegramCommands(env);
      await sendText(env, "<b>VAV Social AI 2.0</b>\n/topics — показать 100 готовых тем\n/topic 25 — создать пакет по номеру\n/random — случайная тема\n/daily3 — 3 публикации: 2 Reels + 1 фото\n/publish3 — опубликовать сегодняшний пакет\n/generate &lt;задание&gt; — текст + изображение + голос + Reel\n/video &lt;тема&gt; — создать Reel\n/video_status ID — проверить рендер\n/publishvideo ID — опубликовать Reel\n/ask &lt;вопрос&gt; — получить ответ AI\n/status — состояние\n/preview — превью\n/redo [id] — новый дизайн и новый Reel\n/publish [id] — опубликовать готовый формат\n/skip [id] — пропустить");
    } else if (command === "/status") {
      await sendText(env, await statusText(env));
    } else if (command === "/generate" || command === "/video" || command === "/ask") {
      const aiCommand = command === "/ask" ? "/ask" : "/generate";
      await sendText(env, aiCommand === "/generate" ? "🎬 Создаю текст, изображение, озвучку и Reel…" : "🧠 Готовлю ответ…");
      ctx.waitUntil(runTelegramAiCommand(env, aiCommand, arg));
    } else if (command === "/video_status") {
      const postId = Number(arg);
      if (!Number.isSafeInteger(postId)) await sendText(env, "❌ Используйте: /video_status ID");
      else await sendVideoStatus(env, postId);
    } else if (command === "/publishvideo") {
      const postId = Number(arg);
      if (!Number.isSafeInteger(postId)) {
        await sendText(env, "❌ Используйте: /publishvideo ID");
      } else {
        const post = await getPostById(env, postId);
        const video = await getVideo(env, postId);
        if (!post || !video) throw new Error("Reel не найден");
        await sendText(env, `🚀 Публикую Reel ID ${postId}…`);
        ctx.waitUntil(publishReel(env, post, video).then(mediaId =>
          sendText(env, `✅ Reel опубликован: ${escapeHtml(post.title)}\nID: <code>${mediaId}</code>`)
        ).catch(error => sendText(env, `❌ ${escapeHtml(error instanceof Error ? error.message : String(error))}`)));
      }
    } else if (command === "/topics") {
      await sendTopicList(env);
    } else if (command === "/topic") {
      const topic = topicByNumber(arg);
      if (!topic) {
        await sendText(env, "❌ Укажите номер от 1 до 100, например: <code>/topic 25</code>");
      } else {
        await sendText(env, `✍️ Тема ${Number(arg)}: ${escapeHtml(topic)}\nСоздаю текст и изображение…`);
        ctx.waitUntil(runTelegramAiCommand(env, "/generate", topic));
      }
    } else if (command === "/random") {
      const number = Math.floor(Math.random() * TOPICS.length) + 1;
      const topic = TOPICS[number - 1];
      await sendText(env, `🎲 Тема ${number}: ${escapeHtml(topic)}\nСоздаю текст и изображение…`);
      ctx.waitUntil(runTelegramAiCommand(env, "/generate", topic));
    } else if (command === "/daily3") {
      await sendText(env, "🧠 Собираю свежие темы и готовлю 3 публикации. Превью придут сюда автоматически.");
      ctx.waitUntil(generateDailyBatch(env).then(posts => previewDailyBatch(env, posts)).catch(error =>
        sendText(env, `❌ Не удалось подготовить пакет: ${escapeHtml(error instanceof Error ? error.message : String(error))}`)
      ));
    } else if (command === "/publish3") {
      await sendText(env, "🚀 Принято. Публикую сегодняшний пакет последовательно.");
      ctx.waitUntil(publishDailyBatch(env).catch(error =>
        sendText(env, `❌ Ошибка пакетной публикации: ${escapeHtml(error instanceof Error ? error.message : String(error))}`)
      ));
    } else if (command === "/next") {
      const post = await getNext(env);
      await sendText(env, post ? `${postLabel(post)} — <b>${post.title}</b>\nID: ${post.id}\nСтатус: ${post.status}\nДизайн: ${post.variant + 1}/3` : "Все публикации обработаны.");
    } else if (command === "/preview") {
      const post = await getNext(env);
      if (!post) await sendText(env, "Нет публикаций для предпросмотра."); else await preview(env, post);
    } else if (["/redo", "/approve", "/skip", "/publish"].includes(command)) {
      const post = arg
        ? await getPostById(env, Number(arg))
        : await getNext(env);
      if (!post) throw new Error("Публикация не найдена");
      if (command === "/redo") {
        const nextVariant = (post.variant + 1) % 3;
        const original = POSTS.find(item => item.id === (post.source_template ?? post.id));
        const nextImagePath = post.image_path.startsWith("/generated/")
          ? await createPostImage(env, post.id, nextVariant, post.title, post.source_title ?? post.caption.slice(0, 600))
          : nextVariant === 0
            ? original?.imagePath
            : original?.imagePath.replace(".jpg", `-v${nextVariant + 1}.jpg`);
        if (!nextImagePath) throw new Error("Исходный дизайн не найден");
        await env.DB.prepare("UPDATE posts SET variant=?, image_path=?, status='draft', last_error=NULL WHERE id=?")
          .bind(nextVariant, nextImagePath, post.id).run();
        const remade = { ...post, variant: nextVariant, image_path: nextImagePath, status: "draft" };
        const hadVideo = Boolean(await getVideo(env, post.id));
        if (hadVideo) {
          await env.DB.prepare("DELETE FROM videos WHERE post_id=?").bind(post.id).run();
          if (videoRendererConfigured(env)) await queueVideo(env, remade);
        }
        await logEvent(env, "redo", post.id, `variant=${nextVariant + 1}`);
        await preview(env, remade);
      } else if (command === "/approve") {
        await env.DB.prepare("UPDATE posts SET status='approved', last_error=NULL WHERE id=?").bind(post.id).run();
        await sendText(env, `Одобрено: ${postLabel(post)} — ${post.title}`);
      } else if (command === "/skip") {
        await env.DB.prepare("UPDATE posts SET status='skipped', last_error=NULL WHERE id=?").bind(post.id).run();
        await sendText(env, `Пропущено: ${postLabel(post)} — ${post.title}`);
      } else {
        await sendText(env, `Публикую ${postLabel(post)}…`);
        const mediaId = await publishPost(env, post);
        await sendText(env, `✅ Опубликовано: ${post.title}\nID: <code>${mediaId}</code>`);
      }
    } else {
      await sendText(env, "Неизвестная команда. Используйте /help");
    }
  } catch (error) {
    await sendText(env, `❌ ${error instanceof Error ? error.message : String(error)}`);
  }
  return json({ ok: true });
}

async function runScheduled(env: Env): Promise<void> {
  if (env.AUTOMATION_ENABLED !== "true") return;
  await seed(env);
  const utcHour = new Date().getUTCHours();
  const slot = utcHour < 9 ? 1 : utcHour < 15 ? 2 : 3;
  const date = moscowDate();
  const post = await generateDailyPost(env, date, slot, await fetchNews());
  if ((slot === 1 || slot === 3) && videoRendererConfigured(env)) await queueVideo(env, post);
  if (env.AUTO_PUBLISH === "true") {
    const id = await publishPost(env, post);
    await sendText(env, `✅ Автопубликация ${postLabel(post)} завершена. ID: <code>${id}</code>`);
  } else if (post.status === "draft" || post.status === "failed") {
    await preview(env, post);
    await sendText(env, `Сменить дизайн: /redo ${post.id}\nОпубликовать одну: /publish ${post.id}\nОпубликовать весь пакет после 3-го превью: /publish3\nПропустить: /skip ${post.id}`);
  }
}

async function finishPendingVideoPublishes(env: Env): Promise<void> {
  const pending = await env.DB.prepare(`SELECT post_id FROM videos WHERE status='publishing'
    ORDER BY requested_at LIMIT 3`).all<{ post_id: number }>();
  for (const row of pending.results) {
    const post = await getPostById(env, row.post_id);
    const video = await getVideo(env, row.post_id);
    if (!post || !video) continue;
    try {
      const mediaId = await publishReel(env, post, video);
      await sendText(env, `✅ Reel опубликован: ${escapeHtml(post.title)}\nID: <code>${mediaId}</code>`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("still processing")) {
        await sendText(env, `❌ Не удалось завершить публикацию Reel ID ${post.id}: ${escapeHtml(message)}`);
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      await seed(env);
      return json({
        ok: true,
        service: "vav-social-ai",
        automation_enabled: env.AUTOMATION_ENABLED === "true",
        instagram_configured: Boolean(env.META_ACCESS_TOKEN && env.META_IG_USER_ID),
        telegram_configured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID && env.TELEGRAM_WEBHOOK_SECRET),
        instagram_autoreply_configured: Boolean(env.META_WEBHOOK_VERIFY_TOKEN && env.META_APP_SECRET),
        video_renderer_configured: videoRendererConfigured(env)
      });
    }
    if (url.pathname === "/telegram/webhook" && request.method === "POST") return handleTelegram(request, env, ctx);
    if (url.pathname === "/video/callback" && request.method === "POST") return acceptVideoCallback(request, env, ctx);
    if (url.pathname === "/instagram/webhook" && request.method === "GET") return verifyInstagramWebhook(request, env);
    if (url.pathname === "/instagram/webhook" && request.method === "POST") return acceptInstagramWebhook(request, env, ctx);
    if (url.pathname === "/" && request.method === "GET") return new Response("VAV Social AI", { headers: { "content-type": "text/plain; charset=utf-8" } });
    const generatedImage = url.pathname.match(/^\/generated\/(\d+)-(\d+)\.jpg$/);
    if (generatedImage && request.method === "GET") {
      const row = await env.DB.prepare("SELECT jpeg FROM generated_images WHERE post_id=? AND variant=?")
        .bind(Number(generatedImage[1]), Number(generatedImage[2])).first<{ jpeg: number[] }>();
      if (!row?.jpeg) return new Response("Not found", { status: 404 });
      const bytes = jpegBytes(row.jpeg);
      return new Response(bytes, {
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "public, max-age=31536000, immutable"
        }
      });
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(controller.cron === "*/2 * * * *" ? finishPendingVideoPublishes(env) : runScheduled(env));
  }
};
