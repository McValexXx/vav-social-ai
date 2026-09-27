import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const items = [
  ["01-ai-agent", "1/7 · ПОНЕДЕЛЬНИК", "AI-АГЕНТ", "РАБОТАЕТ 24/7", "Заявки · ответы · квалификация", "#2F80ED"],
  ["02-crm", "2/7 · ВТОРНИК", "НИ ОДНОЙ", "ПОТЕРЯННОЙ ЗАЯВКИ", "CRM · задачи · контроль", "#00C2A8"],
  ["03-retail", "3/7 · СРЕДА", "ТОВАР ЗАКАНЧИВАЕТСЯ?", "СИСТЕМА УЖЕ ЗАКАЗАЛА", "Остаток → AI → автозаказ", "#8B5CF6"],
  ["04-orders", "4/7 · ЧЕТВЕРГ", "ЗАКАЗ В 02:14", "В 02:15 УЖЕ ОБРАБОТАН", "CRM · оплата · доставка", "#FF8A00"],
  ["05-analytics", "5/7 · ПЯТНИЦА", "БИЗНЕС", "НА ОДНОМ ЭКРАНЕ", "Продажи · склад · деньги · KPI", "#2F80ED"],
  ["06-process", "6/7 · СУББОТА", "7 РУЧНЫХ ДЕЙСТВИЙ", "1 АВТОМАТИЧЕСКИЙ ПРОЦЕСС", "Меньше ошибок · больше скорости", "#22C55E"],
  ["07-audit", "7/7 · ВОСКРЕСЕНЬЕ", "ПОКАЖИТЕ ПРОЦЕСС", "МЫ НАЙДЁМ АВТОМАТИЗАЦИЮ", "Напишите «АВТОМАТИЗАЦИЯ»", "#A855F7"]
];

const escape = value => value.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));

const outputDirectory = fileURLToPath(new URL("../public/images/", import.meta.url));
await mkdir(outputDirectory, { recursive: true });
for (const [base, day, line1, line2, sub, accent] of items) {
 for (let variant = 0; variant < 3; variant++) {
  const [postNumber, weekDay] = day.split(" · ");
  const file = `${base}${variant === 0 ? "" : `-v${variant + 1}`}.jpg`;
  const background = variant === 0 ? "#07111F" : variant === 1 ? "#F4F7FB" : "#050505";
  const backgroundEnd = variant === 0 ? "#101A2D" : variant === 1 ? "#DDE7F4" : "#151515";
  const foreground = variant === 1 ? "#0B1526" : "#FFFFFF";
  const muted = variant === 1 ? "#40516A" : "#B9C5D7";
  const decor = variant === 0
    ? `<g opacity=".16" stroke="${accent}" fill="none"><path d="M60 240H1020M60 340H1020M60 440H1020M60 540H1020M60 640H1020M60 740H1020"/><path d="M160 160V920M360 160V920M560 160V920M760 160V920M960 160V920"/></g>`
    : variant === 1
      ? `<path d="M640 0H1080V520L930 400 790 520 640 390Z" fill="${accent}" opacity=".17"/><circle cx="900" cy="220" r="115" fill="none" stroke="${accent}" stroke-width="32" opacity=".35"/>`
      : `<g fill="none" stroke="${accent}" opacity=".5"><circle cx="910" cy="210" r="150" stroke-width="3"/><circle cx="910" cy="210" r="95" stroke-width="3"/><path d="M0 820L1080 450M0 940L1080 570" stroke-width="2"/></g>`;
  const svg = `<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="${backgroundEnd}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".55"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1080" height="1350" fill="url(#bg)"/>
  <circle cx="870" cy="290" r="460" fill="url(#glow)"/>
  ${decor}
  <rect x="72" y="72" rx="30" width="360" height="70" fill="${accent}"/>
  <text x="100" y="118" fill="white" font-size="28" font-weight="800" font-family="Arial,DejaVu Sans">${escape(postNumber)}</text>
  <text x="180" y="118" fill="white" font-size="27" font-weight="700" font-family="Arial,DejaVu Sans">${escape(weekDay)}</text>
  <text x="72" y="370" fill="${foreground}" font-size="72" font-weight="800" font-family="Arial,DejaVu Sans">${escape(line1)}</text>
  <text x="72" y="470" fill="${accent}" font-size="65" font-weight="800" font-family="Arial,DejaVu Sans">${escape(line2)}</text>
  <rect x="72" y="590" rx="26" width="936" height="180" fill="${foreground}" fill-opacity=".06" stroke="${foreground}" stroke-opacity=".18"/>
  <circle cx="165" cy="680" r="54" fill="none" stroke="${accent}" stroke-width="10"/><path d="M145 682l17 18 34-42" fill="none" stroke="${accent}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="250" y="695" fill="${foreground}" font-size="38" font-weight="600" font-family="Arial,DejaVu Sans">${escape(sub)}</text>
  <g transform="translate(72 865)"><rect width="936" height="250" rx="32" fill="${accent}" fill-opacity=".12" stroke="${accent}" stroke-width="2"/><path d="M90 170C190 60 280 210 390 105S590 185 690 75 830 125 860 55" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round"/><circle cx="860" cy="55" r="17" fill="${accent}"/></g>
  <text x="72" y="1240" fill="${foreground}" font-size="46" font-weight="800" font-family="Arial,DejaVu Sans">VAV GROUP</text>
  <text x="1008" y="1240" text-anchor="end" fill="${muted}" font-size="24" font-family="Arial,DejaVu Sans">AI · AUTOMATION · RESULTS</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 91, chromaSubsampling: "4:4:4" })
    .toFile(fileURLToPath(new URL(`../public/images/${file}`, import.meta.url)));
 }
}
console.log(`Generated ${items.length * 3} visuals.`);
