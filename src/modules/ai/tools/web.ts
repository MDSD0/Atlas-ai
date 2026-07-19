import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import { getSecret } from "../lib/keyring";
import { createProxyFetch } from "../lib/proxyFetch";

/**
 * Web search + fetch for the agent.
 *
 * Providers, in order of preference:
 *   1. Brave Search API   (key: keychain account "websearch.brave")
 *   2. Tavily Search API  (key: keychain account "websearch.tavily")
 *   3. DuckDuckGo HTML    (keyless fallback, best-effort scrape)
 *
 * All requests go through the Rust HTTP proxy (webview CORS blocks direct
 * cross-origin fetches). Results are deliberately compact: title, url,
 * snippet — the model calls web_fetch on the result it actually needs.
 */

const webFetch = createProxyFetch({ allowPrivateNetwork: false });

export const WEB_KEY_ACCOUNTS = {
  brave: "websearch.brave",
  tavily: "websearch.tavily",
} as const;

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

const MAX_RESULTS = 8;
const FETCH_MAX_CHARS = 20_000;
const FETCH_MAX_BYTES = 1_000_000;
const SEARCH_TIMEOUT_MS = 15_000;

// Platform-native timeout signal — unlike a hand-rolled controller, it clears
// its timer on GC and doesn't leak a pending setTimeout per fast request.
function withTimeout(ms: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return external ? AbortSignal.any([external, timeout]) : timeout;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Request aborted", "AbortError");
  }
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (!!error && typeof error === "object" && "name" in error && error.name === "AbortError")
  );
}

async function braveSearch(
  key: string,
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const res = await webFetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
    {
      headers: { "X-Subscription-Token": key, Accept: "application/json" },
      signal: withTimeout(SEARCH_TIMEOUT_MS, signal),
    },
  );
  if (!res.ok) throw new Error(`Brave search failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return (data.web?.results ?? []).slice(0, count).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: stripTags(r.description ?? ""),
  }));
}

async function tavilySearch(
  key: string,
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const res = await webFetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: count,
      include_answer: false,
    }),
    signal: withTimeout(SEARCH_TIMEOUT_MS, signal),
  });
  if (!res.ok) throw new Error(`Tavily search failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results ?? []).slice(0, count).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.content ?? "").slice(0, 300),
  }));
}

/** Keyless best-effort fallback: parse the DuckDuckGo HTML results page. */
async function duckduckgoSearch(
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const res = await webFetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AtlasAgent/1.0)" },
      signal: withTimeout(SEARCH_TIMEOUT_MS, signal),
    },
  );
  if (!res.ok) throw new Error(`DuckDuckGo search failed: HTTP ${res.status}`);
  const html = await res.text();
  const out: WebSearchResult[] = [];
  const linkRe =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe =
    /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const snippets: string[] = [];
  for (const m of html.matchAll(snippetRe)) snippets.push(stripTags(m[1]));
  let i = 0;
  for (const m of html.matchAll(linkRe)) {
    if (out.length >= count) break;
    out.push({
      title: stripTags(m[2]),
      url: decodeDdgUrl(m[1]),
      snippet: snippets[i++] ?? "",
    });
  }
  return out;
}

export function decodeDdgUrl(href: string): string {
  // DDG links are redirects: //duckduckgo.com/l/?uddg=<encoded>&rut=...
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return href;
    }
  }
  return href.startsWith("//") ? `https:${href}` : href;
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Readable-text extraction for web_fetch: title + main text, bounded. */
export function extractReadableText(html: string): {
  title: string;
  text: string;
} {
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  // Prefer <main>/<article> when present; fall back to <body>.
  const region =
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    html;
  const cleaned = region
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<(?:p|div|br|li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

export async function runWebSearch(
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<{
  provider: string;
  results: WebSearchResult[];
  fallbackErrors?: string[];
}> {
  throwIfAborted(signal);
  const n = Math.min(Math.max(count, 1), MAX_RESULTS);
  const [brave, tavily] = await Promise.all([
    getSecret(WEB_KEY_ACCOUNTS.brave),
    getSecret(WEB_KEY_ACCOUNTS.tavily),
  ]);
  const fallbackErrors: string[] = [];
  if (brave) {
    try {
      return { provider: "brave", results: await braveSearch(brave, query, n, signal) };
    } catch (error) {
      if (isAbort(error)) throw error;
      fallbackErrors.push(`Brave: ${String(error)}`);
    }
  }
  if (tavily) {
    try {
      return {
        provider: "tavily",
        results: await tavilySearch(tavily, query, n, signal),
        ...(fallbackErrors.length > 0 ? { fallbackErrors } : {}),
      };
    } catch (error) {
      if (isAbort(error)) throw error;
      fallbackErrors.push(`Tavily: ${String(error)}`);
    }
  }
  const results = await duckduckgoSearch(query, n, signal);
  return {
    provider: "duckduckgo",
    results,
    ...(fallbackErrors.length > 0 ? { fallbackErrors } : {}),
  };
}

export async function readBoundedResponse(
  response: Response,
  maxBytes = FETCH_MAX_BYTES,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text();
    return {
      text: text.slice(0, maxBytes),
      truncated: text.length > maxBytes,
    };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytes;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      bytes += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });
      if (chunk.byteLength < value.byteLength) {
        truncated = true;
        break;
      }
    }
    text += decoder.decode();
  } finally {
    if (truncated) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return { text, truncated };
}

export function buildWebTools() {
  return {
    web_search: tool({
      description:
        "Search the web. Returns compact results (title, url, snippet). Use web_fetch on a result URL to read the page. Uses Brave or Tavily when an API key is configured in Settings, otherwise a keyless DuckDuckGo fallback. Auto-executes (no approval).",
      inputSchema: z.object({
        query: z.string().describe("Search query."),
        count: z
          .number()
          .optional()
          .describe(`Result count, 1-${MAX_RESULTS} (default 5).`),
      }),
      execute: async ({ query, count }, options: ToolExecutionOptions) => {
        try {
          const { provider, results, fallbackErrors } = await runWebSearch(
            query,
            count ?? 5,
            options.abortSignal,
          );
          if (results.length === 0) {
            return { provider, results: [], note: "No results.", fallbackErrors };
          }
          return { provider, results, fallbackErrors };
        } catch (e) {
          return {
            error: options.abortSignal?.aborted ? "web search cancelled" : String(e),
          };
        }
      },
    }),

    web_fetch: tool({
      description:
        "Fetch a public http(s) URL and return its readable text (title + main content, truncated). For documentation, articles, API references. Auto-executes (no approval).",
      inputSchema: z.object({
        url: z.string().describe("Absolute http(s) URL to fetch."),
      }),
      execute: async ({ url }, options: ToolExecutionOptions) => {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return { error: "Only absolute http(s) URLs are supported.", url };
        }
        if (
          !["http:", "https:"].includes(parsed.protocol) ||
          !!parsed.username ||
          !!parsed.password
        ) {
          return { error: "Only public http(s) URLs without embedded credentials are supported.", url };
        }
        try {
          const res = await webFetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; AtlasAgent/1.0)",
              Accept: "text/html,application/json,text/plain,*/*",
            },
            signal: withTimeout(SEARCH_TIMEOUT_MS, options.abortSignal),
          });
          if (!res.ok) return { error: `HTTP ${res.status}`, url };
          const contentType = res.headers.get("content-type") ?? "";
          const downloaded = await readBoundedResponse(res);
          const raw = downloaded.text;
          if (contentType.includes("json") || contentType.includes("plain")) {
            const truncated = downloaded.truncated || raw.length > FETCH_MAX_CHARS;
            return {
              url,
              content_type: contentType,
              text: raw.slice(0, FETCH_MAX_CHARS),
              truncated,
            };
          }
          const { title, text } = extractReadableText(raw);
          const truncated = downloaded.truncated || text.length > FETCH_MAX_CHARS;
          return {
            url,
            title,
            text: text.slice(0, FETCH_MAX_CHARS),
            truncated,
          };
        } catch (e) {
          return {
            error: options.abortSignal?.aborted ? "web fetch cancelled" : String(e),
            url,
          };
        }
      },
    }),
  } as const;
}
