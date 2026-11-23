/** A row of mutually exclusive choices, for settings with a few options. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'is-active' : ''} onClick={() => onChange(o.id)} data-testid={`${label.toLowerCase().replace(/\s+/g, '-')}-${o.id}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
