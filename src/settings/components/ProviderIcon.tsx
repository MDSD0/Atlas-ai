import type { ProviderId } from "@/modules/ai/config";
import { ProviderMark } from "@/components/ProviderMark";

type Props = {
  provider: ProviderId;
  size?: number;
  className?: string;
};

/** Settings-side alias for the shared provider brand mark. */
export function ProviderIcon({ provider, size = 14, className }: Props) {
  return <ProviderMark providerId={provider} size={size} className={className} />;
}
