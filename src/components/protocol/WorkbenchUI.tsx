"use client";

import type { ReactNode } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type WorkbenchView = "overview" | "rag" | "vault" | "sync" | "governance";

export function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(clsx(inputs));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatRelative(ts: number | null | undefined): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 5000) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export type BadgeTone = "ok" | "warn" | "crit" | "signal" | "neutral";

const TONE_CLASS: Record<BadgeTone, string> = {
  ok: "border-teal-700/25 bg-teal-50 text-teal-800 dark:border-teal-500/30 dark:bg-teal-950/60 dark:text-teal-300",
  warn: "border-amber-700/25 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-300",
  crit: "border-rose-700/25 bg-rose-50 text-rose-800 dark:border-rose-500/35 dark:bg-rose-950/60 dark:text-rose-300",
  signal: "border-blue-700/25 bg-blue-50 text-blue-800 dark:border-blue-500/35 dark:bg-blue-950/60 dark:text-blue-300",
  neutral: "border-zinc-300 bg-stone-100 text-zinc-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SyncStateTag({ value }: { value?: string | null }) {
  if (!value) return null;
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    synced: { tone: "ok", label: "synced" },
    queued: { tone: "warn", label: "queued" },
    sync_now: { tone: "crit", label: "sync priority" },
    local_only: { tone: "neutral", label: "local only" },
    conflict: { tone: "crit", label: "conflict" },
  };
  const cfg = map[value] ?? { tone: "neutral" as BadgeTone, label: value };
  return <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>;
}

export function CriticalityTag({ value }: { value?: string | null }) {
  if (!value) return null;
  const map: Record<string, BadgeTone> = {
    critical: "crit",
    high: "warn",
    medium: "signal",
    low: "neutral",
  };
  return <StatusBadge tone={map[value] ?? "neutral"}>{value}</StatusBadge>;
}

export function SensitivityTag({ value }: { value?: string | null }) {
  if (!value) return null;
  const v = value.toLowerCase();
  const tone: BadgeTone = v === "restricted" ? "crit" : v === "public" ? "ok" : "neutral";
  return <StatusBadge tone={tone}>{v === "restricted" ? "restricted · local" : v}</StatusBadge>;
}

export function WorkbenchCard({
  title,
  subtitle,
  actions,
  children,
  className,
  noPadding,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-stone-300/90 bg-white shadow-[0_1px_2px_rgba(17,19,24,0.04)] transition-colors dark:border-slate-800 dark:bg-[#141a26] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3 dark:border-slate-800/90">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold tracking-tight text-zinc-900 dark:text-slate-100">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cn(!noPadding && "p-4")}>{children}</div>
    </section>
  );
}

export function KpiBlock({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: BadgeTone;
}) {
  const accent: Record<BadgeTone, string> = {
    ok: "border-l-teal-600 dark:border-l-teal-400",
    warn: "border-l-amber-600 dark:border-l-amber-400",
    crit: "border-l-rose-600 dark:border-l-rose-400",
    signal: "border-l-blue-700 dark:border-l-blue-400",
    neutral: "border-l-zinc-400 dark:border-l-slate-600",
  };
  return (
    <div
      className={cn(
        "rounded-xl border border-stone-300/90 border-l-4 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(17,19,24,0.03)] transition-colors dark:border-slate-800 dark:bg-[#141a26] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        accent[tone],
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-slate-400">
          {label}
        </span>
        {icon && <span className="text-zinc-400 dark:text-slate-500">{icon}</span>}
      </div>
      <div className="mt-1.5 font-display text-2xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-slate-50">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  variant = "primary",
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: "primary" | "outline" | "danger" | "ghost";
  className?: string;
  title?: string;
}) {
  const styles: Record<string, string> = {
    primary:
      "bg-blue-700 text-white border-blue-800 hover:bg-blue-800 dark:bg-blue-600 dark:border-blue-500 dark:hover:bg-blue-500",
    outline:
      "bg-white text-zinc-800 border-stone-300 hover:bg-stone-100 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800",
    danger:
      "bg-rose-700 text-white border-rose-800 hover:bg-rose-800 dark:bg-rose-600 dark:border-rose-500 dark:hover:bg-rose-500",
    ghost:
      "bg-transparent text-zinc-600 border-transparent hover:bg-stone-200/70 hover:text-zinc-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 cursor-pointer",
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
