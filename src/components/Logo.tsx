import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-full bg-brand text-brand-foreground",
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="size-full" fill="none">
        <circle cx="12" cy="12" r="11.8" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
        <path
          d="M5 20C7.5 17.5 10 15 12 12L12 4.5L12 12C14 15 16.5 17.5 19 20"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.35"
        />
        <path
          d="M6 4v16M17 4v16M4 7h16M4 17.5h16"
          stroke="currentColor"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.2"
        />
        <rect x="15.6" y="10.8" width="0.7" height="2.3" fill="currentColor" />
        <circle cx="15.95" cy="9.2" r="1.5" fill="currentColor" />
        <path d="M9.6 11.8 12 9.2 14.4 11.8Z" fill="currentColor" />
        <rect x="12.6" y="9.4" width="0.7" height="2.2" fill="currentColor" />
        <path d="M10.2 11.8h3.6v3.7h-3.6Z" fill="currentColor" />
        <rect x="11.45" y="13.3" width="1.1" height="2.2" rx="0.3" fill="var(--brand)" />
        <rect x="10.75" y="12.4" width="0.6" height="0.6" rx="0.12" fill="var(--brand)" />
      </svg>
    </div>
  );
}
