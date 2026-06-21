"use client";

// Segmented control, for example Players, Teams, Matches. Uses aria-pressed for the
// active segment so the state is conveyed without relying on colour alone.

export type Segment<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  ariaLabel,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="md-seg" role="group" aria-label={ariaLabel}>
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          className="md-seg-item"
          aria-pressed={segment.value === value}
          onClick={() => onChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
