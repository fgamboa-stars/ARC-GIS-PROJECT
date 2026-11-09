import type { ReactNode } from "react";

/** Small, dependency-free UI primitives shared by the dashboard. */

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className={`segmented segmented--${props.size ?? "md"}`} role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          disabled={o.disabled}
          className={o.value === props.value ? "is-active" : undefined}
          onClick={() => {
            props.onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section(props: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={props.id}>
      <header className="section__head">
        <h2 id={props.id}>{props.title}</h2>
        {props.aside}
      </header>
      {props.children}
    </section>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="spinner" role="status">
      <span className="spinner__dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function Notice(props: { tone: "error" | "warning" | "info"; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice notice--${props.tone}`} role={props.tone === "error" ? "alert" : "status"}>
      <span>{props.children}</span>
      {props.action}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ width: `${(90 - i * 12).toString()}%` }} />
      ))}
    </div>
  );
}

type IconName = "sun" | "moon" | "refresh" | "upload" | "download" | "close" | "target" | "info";

const PATHS: Record<IconName, string> = {
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  refresh: "M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 20h16",
  download: "M12 4v12m0 0-4-4m4 4 4-4M4 20h16",
  close: "M6 6l12 12M18 6 6 18",
  target: "M12 3v3m0 12v3m9-9h-3M6 12H3m15 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0z",
  info: "M12 16v-5m0-3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function IconButton(props: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <Icon name={props.icon} />
    </button>
  );
}
