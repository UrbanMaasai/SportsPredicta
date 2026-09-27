export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  dark = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  dark?: boolean;
}) {
  return (
    <div className={dark ? "seg-dark" : "seg"} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
