import { AIRPORTS } from './data/catalog';

export function AirportSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (code: string) => void;
}) {
  const home = AIRPORTS.filter((item) => item.country === 'Việt Nam');
  const world = AIRPORTS.filter((item) => item.country !== 'Việt Nam');
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <optgroup label="Việt Nam">
          {home.map((item) => (
            <option key={item.code} value={item.code}>
              {item.city} ({item.code})
            </option>
          ))}
        </optgroup>
        <optgroup label="Quốc tế">
          {world.map((item) => (
            <option key={item.code} value={item.code}>
              {item.city} ({item.code})
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="stepper">
      <button type="button" aria-label="Giảm số khách" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span>{value}</span>
      <button type="button" aria-label="Tăng số khách" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
