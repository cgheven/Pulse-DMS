import Image from "next/image";
import { cn } from "@/lib/utils";

// Pulse brand mark (gold "P" with pulse line on a dark rounded tile). The
// tile is baked into the image, so callers must not wrap it in another box.
export function LogoMark({
  size,
  className,
  priority,
}: {
  size: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo-mark.png"
      alt="Pulse"
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0", className)}
    />
  );
}
