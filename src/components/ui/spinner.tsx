import { Loader2 as Loading03Icon } from "lucide-react";
import { cn } from "@/lib/utils";



function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loading03Icon
      // @ts-ignore
      strokeWidth={1.5}
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
