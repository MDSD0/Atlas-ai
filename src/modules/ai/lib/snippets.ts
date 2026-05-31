import { LazyStore } from "@tauri-apps/plugin-store";

export type Snippet = {
  id: string;
  /** The "#handle" used in the composer. Lowercase, [a-z0-9-]+. */
  handle: string;
  name: string;
  description: string;
  content: string;
};

const STORE_PATH = "atlas-ai-snippets.json";
const KEY_LIST = "snippets";

export const BUILTIN_SKILLS: readonly Snippet[] = [
  {
    id: "builtin:architect",
    handle: "architect",
    name: "Architect",
    description: "Design and tradeoffs. Plans before code.",
    content: `You are a senior software architect.
- Before proposing code, restate the problem in one sentence and surface 2–3 viable approaches with real tradeoffs.
- Recommend one with reasoning. Call out risks: scalability, coupling, data consistency, migration, blast radius.
- Reference the actual repo (read key files) before generalizing. No hand-wavy advice.
- Output structure: Problem · Options · Recommendation · Risks · Next steps.`,
  },
  {
    id: "builtin:reviewer",
    handle: "reviewer",
    name: "Code Reviewer",
    description: "Reviews diffs for correctness, perf, security.",
    content: `You are a meticulous code reviewer.
- Focus on what tools cannot catch: logic errors, edge cases, race conditions, layer violations, perf cliffs (N+1, unneeded re-renders), security (injection, auth, secrets), data integrity.
- Skip formatting / naming / inferred-type nits — linters handle those.
- Output: \`[MUST/SHOULD/NIT] file:line — issue → fix\`. If nothing real, say "Looks good."
- Verify each finding against the actual file before reporting it.`,
  },
  {
    id: "builtin:security",
    handle: "security",
    name: "Security",
    description: "Threat-models changes and flags vulns.",
    content: `You are an application-security engineer.
- Threat-model the change: what attacker, what asset, what trust boundary is crossed.
- Look specifically for: input validation at boundaries, authn/authz bypass, secret exposure, SSRF, path traversal, SQLi/XSS/CSRF, deserialization, dependency CVEs, insecure defaults.
- For each finding: severity, exploit sketch, concrete fix. Prefer fixes that close the class of bug, not the one report.
- If the change is benign, say so explicitly — don't fabricate findings.`,
  },
  {
    id: "builtin:designer",
    handle: "designer",
    name: "Designer",
    description: "UI/UX critique and refinement.",
    content: `You are a senior product designer with a strong taste for restrained, modern UI.
- Critique on: hierarchy, spacing, density, contrast, motion, affordance, empty/error states.
- Propose concrete changes, with Tailwind/CSS values when helpful. Keep consistent with the surrounding design system.
- Avoid generic "make it pop" advice. Be specific about what's wrong and why.`,
  },
];

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

export async function loadSnippets(): Promise<Snippet[]> {
  return (await store.get<Snippet[]>(KEY_LIST)) ?? [];
}

export async function saveSnippets(list: Snippet[]): Promise<void> {
  await store.set(KEY_LIST, list);
  await store.save();
}

export function newSnippetId(): string {
  return `sn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const HANDLE_RE = /^[a-z0-9][a-z0-9-]*$/;

export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidHandle(h: string): boolean {
  return HANDLE_RE.test(h);
}

/**
 * Replace `#handle` tokens in `text` with their snippet bodies, wrapped in
 * `<snippet name="…">…</snippet>` blocks, prepended to the message. Tokens that
 * don't match a known snippet are left as-is.
 *
 * Returns the rewritten body (with tokens stripped) and the list of expanded
 * snippet blocks to prepend.
 */
export function expandSnippetTokens(
  text: string,
  snippets: readonly Snippet[],
): { body: string; blocks: string[] } {
  const byHandle = new Map(snippets.map((s) => [s.handle, s]));
  const matched = new Map<string, Snippet>();
  // (^|\s)#handle  — handle is [a-z0-9][a-z0-9-]*
  const re = /(^|\s)#([a-z0-9][a-z0-9-]*)\b/gi;
  const body = text.replace(re, (full, lead: string, raw: string) => {
    const h = raw.toLowerCase();
    const snip = byHandle.get(h);
    if (!snip) return full;
    matched.set(snip.id, snip);
    return lead;
  });
  const blocks = Array.from(matched.values()).map(
    (s) => `<snippet name="${s.handle}">\n${s.content}\n</snippet>`,
  );
  return { body: body.replace(/[ \t]+\n/g, "\n").trim(), blocks };
}
