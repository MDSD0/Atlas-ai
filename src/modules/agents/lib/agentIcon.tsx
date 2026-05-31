import { Bot as ChatGptIcon, Bot as ClaudeIcon, Bot as RoboticIcon } from "lucide-react";



function iconFor(agent: string): any {
  const a = agent.toLowerCase();
  if (a.includes("claude")) return ClaudeIcon;
  if (a.includes("codex") || a.includes("gpt") || a.includes("openai"))
    return ChatGptIcon;
  return RoboticIcon;
}

export function AgentIcon({
  agent,
  size = 15,
  className,
}: {
  agent: string;
  size?: number;
  className?: string;
}) {
  if (agent.toLowerCase().includes("atlas")) {
    return (
      <img
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size }}
      />
    );
  }
   const I = iconFor(agent); return I ? <I size={size} strokeWidth={1.5} className={className} /> : null; 
}
