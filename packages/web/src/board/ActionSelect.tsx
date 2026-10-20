import { useRef, useState } from 'react';

// A select that does something: Move to another scene…, Assign to scene….
// Arrow keys on a closed select change its value in Chromium and Firefox
// outside the Mac, so a value reached by the keyboard only shows; Enter does
// it, and Escape or leaving puts the placeholder back. A pick with the mouse
// does it at once.
export function ActionSelect({
  label,
  placeholder,
  options,
  onPick,
  autoFocus = false,
}: {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onPick(value: string): void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const keyed = useRef(false);
  const pick = (to: string) => {
    setValue('');
    if (to) onPick(to);
  };
  return (
    <select
      aria-label={label}
      autoFocus={autoFocus}
      value={value}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          keyed.current = false;
          pick(value);
        } else if (e.key === 'Escape') {
          keyed.current = false;
          setValue('');
        } else if (e.key !== 'Tab') keyed.current = true;
      }}
      onMouseDown={() => (keyed.current = false)}
      onBlur={() => {
        keyed.current = false;
        setValue('');
      }}
      onChange={(e) => {
        if (keyed.current) setValue(e.target.value);
        else pick(e.target.value);
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
