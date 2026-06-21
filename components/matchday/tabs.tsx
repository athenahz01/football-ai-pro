"use client";

// Underline tabs for desktop, for example Overview, Shooting, Passing. The active
// tab carries the Volt underline and aria-selected.

export type Tab<T extends string> = { value: T; label: string };

export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="md-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          className={`md-tab ${tab.value === value ? "md-tab--active" : ""}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
