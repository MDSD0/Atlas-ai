import { emit, listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  BUILTIN_SKILLS,
  loadSnippets,
  newSnippetId,
  saveSnippets,
  type Snippet,
} from "../lib/snippets";

const CHANGED_EVENT = "atlas://ai-snippets-changed";

type State = {
  hydrated: boolean;
  snippets: Snippet[];
  allSnippets: Snippet[];
  all: () => Snippet[];
  hydrate: () => Promise<void>;
  upsert: (snippet: Snippet) => void;
  remove: (id: string) => void;
};

let initialized = false;

export const useSnippetsStore = create<State>((set, get) => ({
  hydrated: false,
  snippets: [],
  allSnippets: [...BUILTIN_SKILLS],
  all: () => get().allSnippets,
  hydrate: async () => {
    if (initialized) return;
    initialized = true;
    const loaded = await loadSnippets();
    set({ snippets: loaded, allSnippets: [...BUILTIN_SKILLS, ...loaded], hydrated: true });
    void listen(CHANGED_EVENT, async () => {
      const reloaded = await loadSnippets();
      set({ snippets: reloaded, allSnippets: [...BUILTIN_SKILLS, ...reloaded] });
    });
  },
  upsert: (snippet) => {
    const list = get().snippets;
    const idx = list.findIndex((s) => s.id === snippet.id);
    const next =
      idx === -1 ? [...list, snippet] : list.map((s) => (s.id === snippet.id ? snippet : s));
    set({ snippets: next, allSnippets: [...BUILTIN_SKILLS, ...next] });
    void saveSnippets(next).then(() => emit(CHANGED_EVENT));
  },
  remove: (id) => {
    const next = get().snippets.filter((s) => s.id !== id);
    set({ snippets: next, allSnippets: [...BUILTIN_SKILLS, ...next] });
    void saveSnippets(next).then(() => emit(CHANGED_EVENT));
  },
}));

export { newSnippetId };
