import { Apple as AppleIcon, Bot as ChatGptIcon, Bot as ClaudeIcon, Computer as ComputerIcon, Zap as FlashIcon, Bot as GoogleGeminiIcon, Bot as Grok02Icon, Cpu as CpuIcon, Bot as DeepseekIcon, Globe as GlobeIcon, Bot as MistralIcon, Plug as PlugIcon, Server as ServerStack01Icon } from "lucide-react";
import type { ProviderId } from "@/modules/ai/config";



const ICON_BY_PROVIDER = {
  openai: ChatGptIcon,
  anthropic: ClaudeIcon,
  google: GoogleGeminiIcon,
  xai: Grok02Icon,
  cerebras: CpuIcon,
  groq: FlashIcon,
  deepseek: DeepseekIcon,
  mistral: MistralIcon,
  openrouter: GlobeIcon,
  "openai-compatible": PlugIcon,
  lmstudio: ComputerIcon,
  mlx: AppleIcon,
  ollama: ServerStack01Icon,
} as const satisfies Record<ProviderId, typeof ChatGptIcon>;

type Props = {
  provider: ProviderId;
  size?: number;
  className?: string;
};

export function ProviderIcon({ provider, size = 14, className }: Props) {
   const I = ICON_BY_PROVIDER[provider]; return I ? <I size={size} strokeWidth={1.5} className={className} /> : null; 
}
