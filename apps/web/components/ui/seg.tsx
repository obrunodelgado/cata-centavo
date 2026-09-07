"use client";

export type SegOption = {
  readonly value: string;
  readonly label: string;
};

type SegProps = {
  readonly options: readonly SegOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly disabled?: readonly string[];
};

/** The prototype's pill-shaped segmented control. */
export function Seg({ options, value, onChange, label, disabled = [] }: SegProps) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "active" : ""}
          aria-pressed={option.value === value}
          disabled={disabled.includes(option.value)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
