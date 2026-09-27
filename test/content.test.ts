import { describe, expect, it } from "vitest";
import { POSTS } from "../src/content";
import { containsAutomationKeyword, d1BlobBytes, isImageSafetyError, parseNewsFeed, parseTelegramCommand, safeImageText } from "../src/index";
import { TOPICS, topicByNumber } from "../src/topics";

describe("weekly content", () => {
  it("contains seven ordered posts", () => {
    expect(POSTS).toHaveLength(7);
    expect(POSTS.map(post => post.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("uses unique slugs and public JPEG paths", () => {
    expect(new Set(POSTS.map(post => post.slug)).size).toBe(7);
    expect(POSTS.every(post => post.imagePath.endsWith(".jpg"))).toBe(true);
  });
  it("keeps all captions in Russian and actionable", () => {
    expect(POSTS.every(post => /[А-Яа-яЁё]/.test(post.caption))).toBe(true);
    expect(POSTS.every(post => post.caption.length > 150)).toBe(true);
  });
});

describe("Instagram keyword", () => {
  it("matches Russian word forms and Romanian/Latin spelling", () => {
    expect(containsAutomationKeyword("АВТОМАТИЗАЦИЯ")).toBe(true);
    expect(containsAutomationKeyword("Нужна автоматизация бизнеса")).toBe(true);
    expect(containsAutomationKeyword("vreau automatizatie")).toBe(true);
  });

  it("does not match unrelated messages", () => {
    expect(containsAutomationKeyword("Здравствуйте, сколько стоит CRM?")).toBe(false);
  });
});

describe("daily news feeds", () => {
  it("parses RSS items", () => {
    const items = parseNewsFeed(`<?xml version="1.0"?><rss><channel><item>
      <title><![CDATA[AI agents automate a new business workflow]]></title>
      <link>https://example.com/news/agents</link>
      <description><![CDATA[<p>A practical product update.</p>]]></description>
      <pubDate>Mon, 31 Aug 2026 10:00:00 GMT</pubDate>
    </item></channel></rss>`, "Example");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: "Example", url: "https://example.com/news/agents" });
    expect(items[0].summary).toContain("practical product update");
  });

  it("parses Atom entries", () => {
    const items = parseNewsFeed(`<feed><entry>
      <title>Retail analytics update for growing teams</title>
      <link href="https://example.com/retail-update" />
      <summary>New analytics workflow.</summary>
      <updated>2026-08-31T10:00:00Z</updated>
    </entry></feed>`, "Example Atom");
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("Retail analytics");
  });
});

describe("Telegram commands", () => {
  it("keeps a Cyrillic generation prompt", () => {
    expect(parseTelegramCommand("/generate кибер безопасность")).toEqual({
      command: "/generate",
      arg: "кибер безопасность"
    });
  });

  it("normalizes a non-breaking space", () => {
    expect(parseTelegramCommand("/generate\u00a0кибер безопасность").arg).toBe("кибер безопасность");
  });

  it("supports Telegram bot mentions", () => {
    expect(parseTelegramCommand("/generate@VAVSocialBot тема")).toEqual({ command: "/generate", arg: "тема" });
  });

  it("parses video generation and publishing commands", () => {
    expect(parseTelegramCommand("/video автоматизация продаж")).toEqual({
      command: "/video",
      arg: "автоматизация продаж"
    });
    expect(parseTelegramCommand("/publishvideo 125")).toEqual({ command: "/publishvideo", arg: "125" });
  });
});

describe("D1 image blobs", () => {
  it("converts the numeric array returned by D1 back to binary bytes", () => {
    expect([...d1BlobBytes([0xff, 0xd8, 0xff, 0xe0])]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });

  it("rejects invalid blob values", () => {
    expect(() => d1BlobBytes("255,216,255")).toThrow("Некорректные данные");
  });
});

describe("AI image safety fallback", () => {
  it("removes unsafe image terms while preserving the business topic", () => {
    expect(safeImageText("AI marketing — NSFW nude test", 100)).toBe("AI marketing business technology business technology test");
  });

  it("recognizes Cloudflare safety error 8007", () => {
    expect(isImageSafetyError(new Error("8007: Input prompt contains NSFW content"))).toBe(true);
    expect(isImageSafetyError(new Error("network timeout"))).toBe(false);
  });
});

describe("VAV topic library", () => {
  it("contains 100 unique Russian topics", () => {
    expect(TOPICS).toHaveLength(100);
    expect(new Set(TOPICS).size).toBe(100);
    expect(TOPICS.every(topic => /[А-Яа-яЁё]/.test(topic))).toBe(true);
  });

  it("resolves only valid topic numbers", () => {
    expect(topicByNumber("1")).toBe(TOPICS[0]);
    expect(topicByNumber("100")).toBe(TOPICS[99]);
    expect(topicByNumber("101")).toBeNull();
  });
});
