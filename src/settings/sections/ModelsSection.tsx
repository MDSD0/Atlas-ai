import { Plus as Add01Icon, ChevronDown as ArrowDown01Icon, ArrowUpRight as ArrowUpRight01Icon, X as Cancel01Icon, CheckCircle2 as CheckmarkCircle02Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  KEYRING_SERVICE,
  MODELS,
  PROVIDERS,
  getAutocompleteEligibleModels,
  getModel,
  getProvider,
  providerNeedsKey,
  type ModelId,
  type ProviderId,
  type ProviderInfo,
} from "@/modules/ai/config";
import { clearKey, getAllKeys, setKey } from "@/modules/ai/lib/keyring";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  emitKeysChanged,
  setAutocompleteEnabled,
  setAutocompleteModelId,
  setAutocompleteProvider,
  setDefaultModel,
  setLmstudioBaseURL,
  setLmstudioModelId,
  setMlxBaseURL,
  setMlxModelId,
  setOllamaBaseURL,
  setOllamaModelId,
  setOpenaiCompatibleBaseURL,
  setOpenaiCompatibleContextLimit,
  setOpenaiCompatibleModelId,
  setOpenrouterModelId,
} from "@/modules/settings/store";


import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useState } from "react";
import {
  fetchOpenRouterCatalog,
  filterCatalog,
  type CatalogModel,
} from "@/modules/ai/lib/openrouterCatalog";
import { ProviderIcon } from "../components/ProviderIcon";
import { ProviderKeyCard } from "../components/ProviderKeyCard";
import { SectionHeader } from "../components/SectionHeader";

type KeysMap = Record<ProviderId, string | null>;

const isLocalProvider = (id: ProviderId): boolean => !providerNeedsKey(id);

type LocalMeta = {
  urlPlaceholder: string;
  modelPlaceholder: string;
  description: string;
  modelHint: React.ReactNode;
};

const LOCAL_META: Partial<Record<ProviderId, LocalMeta>> = {
  lmstudio: {
    urlPlaceholder: "http://localhost:1234/v1",
    modelPlaceholder: "qwen2.5-coder-7b-instruct",
    description:
      "Run GGUF models via LM Studio's HTTP server (Developer tab → enable).",
    modelHint: (
      <>
        The model id loaded in LM Studio — see the server's{" "}
        <span className="font-mono">/v1/models</span> page.
      </>
    ),
  },
  mlx: {
    urlPlaceholder: "http://127.0.0.1:8080/v1",
    modelPlaceholder: "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit",
    description:
      "Apple-silicon inference via mlx_lm.server (pip install mlx-lm).",
    modelHint: (
      <>The Hugging Face repo path you launched mlx_lm.server with.</>
    ),
  },
  ollama: {
    urlPlaceholder: "http://localhost:11434/v1",
    modelPlaceholder: "qwen2.5-coder:7b",
    description: "Local models via Ollama's built-in OpenAI-compatible API.",
    modelHint: <>The model name from `ollama list` / `ollama pull`.</>,
  },
  "openai-compatible": {
    urlPlaceholder: "https://api.example.com/v1",
    modelPlaceholder: "gpt-4o, qwen3-max, glm-4.6, …",
    description: "Any OpenAI-compatible endpoint — vLLM, Z.AI, Fireworks, etc.",
    modelHint: null,
  },
  openrouter: {
    urlPlaceholder: "",
    modelPlaceholder: "anthropic/claude-sonnet-4-6, openai/gpt-5.5, …",
    description: "Any model on OpenRouter — type its full provider/model id.",
    modelHint: (
      <>
        Browse ids at{" "}
        <span className="font-mono">openrouter.ai/models</span>.
      </>
    ),
  },
};

export function ModelsSection() {
  const [keys, setKeys] = useState<KeysMap | null>(null);
  const [adding, setAdding] = useState<Set<ProviderId>>(new Set());

  const defaultModel = usePreferencesStore((s) => s.defaultModelId);
  const lmstudioBaseURL = usePreferencesStore((s) => s.lmstudioBaseURL);
  const lmstudioModelId = usePreferencesStore((s) => s.lmstudioModelId);
  const mlxBaseURL = usePreferencesStore((s) => s.mlxBaseURL);
  const mlxModelId = usePreferencesStore((s) => s.mlxModelId);
  const ollamaBaseURL = usePreferencesStore((s) => s.ollamaBaseURL);
  const ollamaModelId = usePreferencesStore((s) => s.ollamaModelId);
  const compatBaseURL = usePreferencesStore((s) => s.openaiCompatibleBaseURL);
  const compatModelId = usePreferencesStore((s) => s.openaiCompatibleModelId);
  const compatContextLimit = usePreferencesStore(
    (s) => s.openaiCompatibleContextLimit,
  );
  const openrouterModelId = usePreferencesStore((s) => s.openrouterModelId);

  useEffect(() => {
    void getAllKeys().then(setKeys);
  }, []);

  const onSaveKey = async (provider: ProviderId, value: string) => {
    await setKey(provider, value);
    setKeys((prev) => (prev ? { ...prev, [provider]: value } : prev));
    await emitKeysChanged();
  };

  const onClearKey = async (provider: ProviderId) => {
    await clearKey(provider);
    setKeys((prev) => (prev ? { ...prev, [provider]: null } : prev));
    await emitKeysChanged();
  };

  const localConfig = (id: ProviderId): LocalConfig | null => {
    switch (id) {
      case "lmstudio":
        return {
          baseURL: lmstudioBaseURL,
          modelId: lmstudioModelId,
          setBaseURL: setLmstudioBaseURL,
          setModelId: setLmstudioModelId,
        };
      case "mlx":
        return {
          baseURL: mlxBaseURL,
          modelId: mlxModelId,
          setBaseURL: setMlxBaseURL,
          setModelId: setMlxModelId,
        };
      case "ollama":
        return {
          baseURL: ollamaBaseURL,
          modelId: ollamaModelId,
          setBaseURL: setOllamaBaseURL,
          setModelId: setOllamaModelId,
        };
      case "openai-compatible":
        return {
          baseURL: compatBaseURL,
          modelId: compatModelId,
          setBaseURL: setOpenaiCompatibleBaseURL,
          setModelId: setOpenaiCompatibleModelId,
          contextLimit: compatContextLimit,
          setContextLimit: setOpenaiCompatibleContextLimit,
        };
      case "openrouter":
        return {
          baseURL: "",
          modelId: openrouterModelId,
          setBaseURL: async () => {},
          setModelId: setOpenrouterModelId,
          noBaseURL: true,
        };
      default:
        return null;
    }
  };

  const isConfigured = (id: ProviderId): boolean => {
    if (id === "openrouter")
      return !!keys?.[id] && !!openrouterModelId.trim();
    if (!isLocalProvider(id)) return !!keys?.[id];
    const cfg = localConfig(id);
    if (!cfg) return false;
    if (id === "openai-compatible")
      return !!cfg.baseURL.trim() && !!cfg.modelId.trim();
    return !!cfg.modelId.trim();
  };

  if (!keys) {
    return <div className="text-[12px] text-muted-foreground">Loading…</div>;
  }

  const configuredIds = new Set(
    PROVIDERS.filter((p) => isConfigured(p.id)).map((p) => p.id),
  );
  const visibleIds = new Set<ProviderId>(configuredIds);
  for (const id of adding) visibleIds.add(id);
  const visibleProviders = PROVIDERS.filter((p) => visibleIds.has(p.id));
  const addableProviders = PROVIDERS.filter((p) => !visibleIds.has(p.id));

  const removeProvider = (id: ProviderId) => {
    if (id === "openrouter") {
      void setOpenrouterModelId("");
      void onClearKey(id);
    } else if (isLocalProvider(id)) {
      const cfg = localConfig(id);
      if (cfg) {
        void cfg.setModelId("");
        if (id === "openai-compatible") void cfg.setBaseURL("");
      }
      if (id === "openai-compatible") void onClearKey(id);
    } else {
      void onClearKey(id);
    }
    setAdding((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const addProvider = (id: ProviderId) => {
    setAdding((prev) => new Set(prev).add(id));
  };

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Models"
        description="Connect the providers you use. Keys live in your OS keychain and are used only by Atlas."
      />

      <DefaultsBlock
        defaultModel={defaultModel}
        configuredIds={configuredIds}
        keys={keys}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>Providers</Label>
          <AddProviderMenu
            providers={addableProviders}
            onAdd={addProvider}
          />
        </div>

        {visibleProviders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-card/40 px-4 py-8 text-center">
            <p className="text-[12px] text-muted-foreground">
              No providers connected yet.
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground/70">
              Click “Add provider” to connect a cloud or local model source.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleProviders.map((p) =>
              isLocalProvider(p.id) || p.id === "openrouter" ? (
                <LocalProviderCard
                  key={p.id}
                  provider={p}
                  configured={configuredIds.has(p.id)}
                  config={localConfig(p.id)!}
                  meta={LOCAL_META[p.id]!}
                  compatKey={
                    p.id === "openai-compatible" || p.id === "openrouter"
                      ? keys[p.id]
                      : undefined
                  }
                  onSaveKey={(v) => onSaveKey(p.id, v)}
                  onClearKey={() => onClearKey(p.id)}
                  onRemove={() => removeProvider(p.id)}
                />
              ) : (
                <ProviderKeyCard
                  key={p.id}
                  provider={p}
                  currentKey={keys[p.id]}
                  onSave={(v) => onSaveKey(p.id, v)}
                  onClear={() => onClearKey(p.id)}
                  onRemove={() => removeProvider(p.id)}
                />
              ),
            )}
          </div>
        )}
      </div>

      <WebSearchKeysBlock />
    </div>
  );
}

/**
 * Optional web-search provider keys for the agent's `web_search` tool.
 * Without a key Atlas falls back to a keyless DuckDuckGo search.
 */
function WebSearchKeysBlock() {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>Web search</Label>
        <p className="mt-0.5 text-[10.5px] text-muted-foreground/70">
          Optional keys for the agent's web_search tool. Without one, Atlas
          uses a keyless DuckDuckGo fallback.
        </p>
      </div>
      <WebSearchKeyRow
        label="Brave Search"
        account="websearch.brave"
        consoleUrl="https://api-dashboard.search.brave.com/app/keys"
      />
      <WebSearchKeyRow
        label="Tavily"
        account="websearch.tavily"
        consoleUrl="https://app.tavily.com/home"
      />
    </div>
  );
}

function WebSearchKeyRow({
  label,
  account,
  consoleUrl,
}: {
  label: string;
  account: string;
  consoleUrl: string;
}) {
  const [saved, setSaved] = useState(false);
  const [value, setValue] = useState("");
  useEffect(() => {
    void invoke<string | null>("secrets_get", {
      service: KEYRING_SERVICE,
      account,
    })
      .then((v) => setSaved(!!v && v.length > 0))
      .catch(() => {});
  }, [account]);
  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    await invoke("secrets_set", {
      service: KEYRING_SERVICE,
      account,
      password: trimmed,
    });
    setSaved(true);
    setValue("");
  };
  const clear = async () => {
    await invoke("secrets_delete", {
      service: KEYRING_SERVICE,
      account,
    }).catch(() => {});
    setSaved(false);
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <button
        type="button"
        onClick={() => void openUrl(consoleUrl)}
        className="w-28 shrink-0 text-left text-[12px] font-medium hover:underline"
        title={consoleUrl}
      >
        {label}
      </button>
      {saved ? (
        <>
          <Badge variant="secondary" className="text-[10.5px]">
            <CheckmarkCircle02Icon size={12} className="mr-1" />
            Key saved
          </Badge>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="h-7" onClick={() => void clear()}>
            Remove
          </Button>
        </>
      ) : (
        <>
          <Input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
            placeholder="API key"
            className="h-7 flex-1 text-[12px]"
          />
          <Button size="sm" className="h-7" onClick={() => void save()} disabled={!value.trim()}>
            Save
          </Button>
        </>
      )}
    </div>
  );
}

type LocalConfig = {
  baseURL: string;
  modelId: string;
  setBaseURL: (v: string) => Promise<void>;
  setModelId: (v: string) => Promise<void>;
  contextLimit?: number;
  setContextLimit?: (v: number) => Promise<void>;
  noBaseURL?: boolean;
};

function AddProviderMenu({
  providers,
  onAdd,
}: {
  providers: readonly ProviderInfo[];
  onAdd: (id: ProviderId) => void;
}) {
  const cloud = providers.filter((p) => !isLocalProvider(p.id));
  const local = providers.filter((p) => isLocalProvider(p.id));
  const disabled = providers.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          className="h-7 gap-1.5 px-2.5 text-[11px]"
        >
          <Add01Icon size={12} strokeWidth={1.5} />
          Add provider
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-55 p-1">
        {cloud.length > 0 ? (
          <>
            <DropdownMenuLabel className="px-2 text-[10px] tracking-wide text-muted-foreground uppercase">
              Cloud
            </DropdownMenuLabel>
            {cloud.map((p) => (
              <ProviderMenuItem key={p.id} provider={p} onAdd={onAdd} />
            ))}
          </>
        ) : null}
        {local.length > 0 ? (
          <>
            <DropdownMenuLabel className="px-2 text-[10px] tracking-wide text-muted-foreground uppercase">
              Local & custom
            </DropdownMenuLabel>
            {local.map((p) => (
              <ProviderMenuItem key={p.id} provider={p} onAdd={onAdd} />
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProviderMenuItem({
  provider,
  onAdd,
}: {
  provider: ProviderInfo;
  onAdd: (id: ProviderId) => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={() => onAdd(provider.id)}
      className="flex items-center gap-2 text-[12px]"
    >
      <ProviderIcon provider={provider.id} size={13} />
      <span>{provider.label}</span>
    </DropdownMenuItem>
  );
}

function DefaultsBlock({
  defaultModel,
  configuredIds,
  keys,
}: {
  defaultModel: ModelId;
  configuredIds: Set<ProviderId>;
  keys: KeysMap;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Label>Defaults</Label>
      <div className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <FieldRow label="Chat model">
          <DefaultModelPicker
            defaultModel={defaultModel}
            configuredIds={configuredIds}
          />
        </FieldRow>
        <AutocompleteRow keys={keys} configuredIds={configuredIds} />
      </div>
    </div>
  );
}

function DefaultModelPicker({
  defaultModel,
  configuredIds,
}: {
  defaultModel: ModelId;
  configuredIds: Set<ProviderId>;
}) {
  const m = getModel(defaultModel);
  const hasAny = configuredIds.size > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={!hasAny}
          className="h-8 flex-1 justify-between gap-2 px-2.5 text-[11.5px]"
        >
          <span className="flex items-center gap-2 truncate">
            <ProviderIcon provider={m.provider} size={13} />
            <span className="truncate">{m.label}</span>
            <span className="text-muted-foreground">· {m.hint}</span>
          </span>
          <ArrowDown01Icon
            size={11}
            strokeWidth={1.5}
            className="opacity-70"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        className="min-w-70 p-1"
      >
        <div className="max-h-72 overflow-y-auto overscroll-contain pr-1">
          {PROVIDERS.filter((p) => configuredIds.has(p.id)).map((p) => {
            const models = MODELS.filter((x) => x.provider === p.id);
            if (models.length === 0) return null;
            return (
              <div key={p.id} className="px-1 pt-1.5 first:pt-1">
                <div className="mb-0.5 flex items-center gap-1.5 px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  <ProviderIcon provider={p.id} size={11} />
                  <span>{p.label}</span>
                </div>
                {models.map((mod) => (
                  <DropdownMenuItem
                    key={mod.id}
                    onSelect={() => void setDefaultModel(mod.id as ModelId)}
                    className={cn(
                      "flex items-start gap-2 text-[12px]",
                      mod.id === defaultModel && "bg-accent/50",
                    )}
                  >
                    <span className="flex flex-1 flex-col">
                      <span>{mod.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {mod.description}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AutocompleteRow({
  keys,
  configuredIds,
}: {
  keys: KeysMap;
  configuredIds: Set<ProviderId>;
}) {
  const enabled = usePreferencesStore((s) => s.autocompleteEnabled);
  const provider = usePreferencesStore((s) => s.autocompleteProvider);
  const modelId = usePreferencesStore((s) => s.autocompleteModelId);
  const eligible = useMemo(() => getAutocompleteEligibleModels(), []);

  // Fast cloud tiers + any configured local provider (one model id each).
  const items = useMemo(() => {
    const local = PROVIDERS.filter(
      (p) => isLocalProvider(p.id) && configuredIds.has(p.id),
    ).flatMap((p) => {
      const m = MODELS.find((x) => x.provider === p.id);
      return m ? [m] : [];
    });
    return [...eligible, ...local];
  }, [eligible, configuredIds]);

  const currentModel = useMemo(() => {
    if (isLocalProvider(provider)) {
      return MODELS.find((m) => m.provider === provider) ?? eligible[0];
    }
    return (
      MODELS.find((m) => m.provider === provider && m.id === modelId) ??
      MODELS.find((m) => m.id === modelId) ??
      eligible[0]
    );
  }, [eligible, provider, modelId]);

  const setModel = (id: string, providerId: ProviderId) => {
    void setAutocompleteProvider(providerId);
    void setAutocompleteModelId(isLocalProvider(providerId) ? "" : id);
  };

  const grouped = useMemo(() => {
    const map = new Map<ProviderId, (typeof items)[number][]>();
    for (const m of items) {
      const arr = map.get(m.provider) ?? [];
      arr.push(m);
      map.set(m.provider, arr);
    }
    return map;
  }, [items]);

  const hasKey = providerNeedsKey(provider) ? !!keys[provider] : true;

  return (
    <>
      <FieldRow label="Autocomplete">
        <div className="flex flex-1 items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => void setAutocompleteEnabled(v)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={!enabled}
                className="h-8 flex-1 justify-between gap-2 px-2.5 text-[11.5px]"
              >
                <span className="flex items-center gap-2 truncate">
                  <ProviderIcon provider={currentModel.provider} size={12} />
                  <span className="truncate">{currentModel.label}</span>
                  <span className="text-muted-foreground">
                    · {currentModel.hint}
                  </span>
                </span>
                <ArrowDown01Icon
                  size={11}
                  strokeWidth={1.5}
                  className="opacity-70"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              collisionPadding={12}
              className="max-h-72 min-w-70 overflow-y-auto"
            >
              {PROVIDERS.map((p) => {
                const list = grouped.get(p.id);
                if (!list || list.length === 0) return null;
                const pConfigured = configuredIds.has(p.id);
                return (
                  <div key={p.id} className="px-1 pt-1.5 first:pt-1">
                    <div className="mb-0.5 flex items-center gap-1.5 px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                      <ProviderIcon provider={p.id} size={11} />
                      <span>{p.label}</span>
                      {!pConfigured ? (
                        <span className="ml-auto text-[9.5px] normal-case tracking-normal text-muted-foreground/70">
                          not connected
                        </span>
                      ) : null}
                    </div>
                    {list.map((m) => (
                      <DropdownMenuItem
                        key={m.id}
                        disabled={!pConfigured}
                        onSelect={() => pConfigured && setModel(m.id, p.id)}
                        className={cn(
                          "text-[11.5px]",
                          m.id === modelId && "bg-accent/50",
                        )}
                      >
                        <span className="flex flex-col">
                          <span>{m.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {m.description}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </div>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </FieldRow>
      {enabled && !hasKey ? (
        <p className="pl-19 text-[10.5px] text-muted-foreground">
          {getProvider(provider).label} isn't connected — add it below.
        </p>
      ) : null}
    </>
  );
}

function LocalProviderCard({
  provider,
  configured,
  config,
  meta,
  compatKey,
  onSaveKey,
  onClearKey,
  onRemove,
}: {
  provider: ProviderInfo;
  configured: boolean;
  config: LocalConfig;
  meta: LocalMeta;
  compatKey?: string | null;
  onSaveKey: (v: string) => Promise<void>;
  onClearKey: () => Promise<void>;
  onRemove: () => void;
}) {
  const {
    baseURL,
    modelId,
    setBaseURL,
    setModelId,
    contextLimit,
    setContextLimit,
    noBaseURL,
  } = config;
  const [urlDraft, setUrlDraft] = useState(baseURL);
  const [modelDraft, setModelDraft] = useState(modelId);
  const [contextDraft, setContextDraft] = useState(String(contextLimit ?? ""));
  const [keyDraft, setKeyDraft] = useState("");
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "ok" | "fail"
  >("idle");

  useEffect(() => setUrlDraft(baseURL), [baseURL]);
  useEffect(() => setModelDraft(modelId), [modelId]);
  useEffect(() => setContextDraft(String(contextLimit ?? "")), [contextLimit]);

  const supportsKey =
    provider.id === "openai-compatible" || provider.id === "openrouter";

  const test = async () => {
    setTestStatus("testing");
    try {
      const status = await invoke<number>("lm_ping", { baseUrl: urlDraft });
      setTestStatus(status > 0 ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <ProviderIcon provider={provider.id} size={15} />
        <span className="text-[12.5px] font-medium">{provider.label}</span>
        {configured ? (
          <Badge
            variant="outline"
            className="ml-1 h-4 gap-1 border-border/60 bg-muted/40 px-1.5 text-[10px] font-normal text-muted-foreground"
          >
            <CheckmarkCircle02Icon size={9} strokeWidth={1.5} />
            Connected
          </Badge>
        ) : null}
        <button
          type="button"
          onClick={() => void openUrl(provider.consoleUrl)}
          className="ml-auto inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Docs
          <ArrowUpRight01Icon size={11} strokeWidth={1.5} />
        </button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onRemove}
          title="Remove provider"
          className="size-7 text-muted-foreground hover:text-destructive"
        >
          <Cancel01Icon size={12} strokeWidth={1.5} />
        </Button>
      </div>

      <span className="text-[10.5px] leading-relaxed text-muted-foreground">
        {meta.description}
      </span>

      <div className="mt-0.5 flex flex-col gap-2.5">
        {noBaseURL ? null : (
          <FieldRow label="Base URL">
            <div className="flex flex-1 gap-1.5">
              <Input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onBlur={() => {
                  const v = urlDraft.trim();
                  if (v !== baseURL) void setBaseURL(v);
                }}
                placeholder={meta.urlPlaceholder}
                spellCheck={false}
                className="h-8 flex-1 font-mono text-[11.5px]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void test()}
                disabled={!urlDraft.trim()}
                className="h-8 px-3 text-[11px]"
              >
                Test
              </Button>
            </div>
          </FieldRow>
        )}

        <FieldRow label="Model ID">
          <div className="flex flex-1 items-center gap-1.5">
            <Input
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              onBlur={() => {
                const v = modelDraft.trim();
                if (v !== modelId) void setModelId(v);
              }}
              placeholder={meta.modelPlaceholder}
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
            {provider.id === "openrouter" ? (
              <CatalogBrowseButton
                onPick={(id) => {
                  setModelDraft(id);
                  void setModelId(id);
                }}
              />
            ) : null}
          </div>
        </FieldRow>

        {setContextLimit ? (
          <FieldRow label="Context">
            <div className="flex flex-1 items-center gap-1.5">
              <Input
                value={contextDraft}
                onChange={(e) => setContextDraft(e.target.value)}
                onBlur={() => {
                  const v = parseInt(contextDraft);
                  if (Number.isFinite(v) && v >= 1000) void setContextLimit(v);
                  else setContextDraft(String(contextLimit ?? ""));
                }}
                placeholder="128000"
                spellCheck={false}
                className="h-8 w-28 font-mono text-[11.5px]"
              />
              <span className="text-[10.5px] text-muted-foreground">tokens</span>
            </div>
          </FieldRow>
        ) : null}

        {supportsKey ? (
          <FieldRow label="API key">
            {compatKey ? (
              <div className="flex flex-1 items-center gap-1.5">
                <code className="flex-1 truncate rounded bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  {`${compatKey.slice(0, 4)}${"•".repeat(8)}${compatKey.slice(-4)}`}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void onClearKey()}
                  title="Remove key"
                  className="size-7 text-muted-foreground hover:text-destructive"
                >
                  <Cancel01Icon size={12} strokeWidth={1.5} />
                </Button>
              </div>
            ) : (
              <div className="flex flex-1 gap-1.5">
                <Input
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="Optional — leave empty for unauthenticated endpoints"
                  spellCheck={false}
                  className="h-8 flex-1 font-mono text-[11.5px]"
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    const v = keyDraft.trim();
                    if (!v) return;
                    await onSaveKey(v);
                    setKeyDraft("");
                  }}
                  disabled={!keyDraft.trim()}
                  className="h-8 px-3 text-[11px]"
                >
                  Save
                </Button>
              </div>
            )}
          </FieldRow>
        ) : null}

        <StatusLine status={testStatus} />

        {!modelId.trim() && meta.modelHint ? (
          <p className="text-[10.5px] leading-relaxed text-muted-foreground">
            {meta.modelHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Live model browser: fetches the OpenRouter catalog (auto-refreshes after a
 * short TTL, so new releases appear without an app update) and fuzzy-searches
 * it. Picking a row fills the Model ID — nobody should hand-type
 * "anthropic/claude-opus-4.8" from a web page.
 */
function CatalogBrowseButton({ onPick }: { onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<CatalogModel[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const load = (force = false) => {
    setState("loading");
    fetchOpenRouterCatalog(force)
      .then((m) => {
        setModels(m);
        setState("idle");
      })
      .catch(() => setState("error"));
  };

  const hits = useMemo(
    () => (models ? filterCatalog(models, query) : []),
    [models, query],
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && models === null) load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1 px-2.5 text-[11px]">
          Browse
          <ArrowDown01Icon size={11} strokeWidth={1.5} className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[26rem] p-0">
        <div className="border-b border-border/60 px-2.5 py-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Fuzzy search: opus 4.8, gpt55, gemini flash…"
            spellCheck={false}
            className="h-7 font-mono text-[11px]"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {state === "loading" && (
            <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
              Loading live catalog…
            </div>
          )}
          {state === "error" && (
            <div className="flex flex-col items-center gap-2 px-3 py-6 text-[11px] text-muted-foreground">
              Couldn't reach OpenRouter.
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10.5px]" onClick={() => load(true)}>
                Retry
              </Button>
            </div>
          )}
          {state === "idle" && models && hits.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
              No models match.
            </div>
          )}
          {state === "idle" &&
            hits.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onPick(m.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] text-foreground">
                    {m.id}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {m.name}
                  </span>
                </span>
                {m.contextLength != null && (
                  <span className="shrink-0 text-[9.5px] tabular-nums text-muted-foreground/70">
                    {Math.round(m.contextLength / 1000)}k
                  </span>
                )}
                {m.promptPrice && (
                  <span className="shrink-0 rounded bg-muted/60 px-1 py-0.5 text-[9.5px] tabular-nums text-muted-foreground">
                    {m.promptPrice}
                  </span>
                )}
              </button>
            ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[11px] tracking-tight text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-1 items-center">{children}</div>
    </div>
  );
}

function StatusLine({
  status,
}: {
  status: "idle" | "testing" | "ok" | "fail";
}) {
  if (status === "idle") return null;
  if (status === "testing") {
    return (
      <span className="text-[10.5px] text-muted-foreground">Testing…</span>
    );
  }
  if (status === "ok") {
    return (
      <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
        <CheckmarkCircle02Icon size={11} strokeWidth={1.5} />
        Reachable — server responded.
      </span>
    );
  }
  return (
    <span className="text-[10.5px] text-destructive/80">
      Could not reach the server.
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
