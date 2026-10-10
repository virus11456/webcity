import { useId } from 'preact/hooks';

/** Native range keeps touch, keyboard and assistive technology behavior intact. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  disabled = false,
  onInput,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onInput: (value: number) => void;
}) {
  const id = useId();
  return (
    <div class="ui-slider">
      <div class="ui-slider-label">
        <label for={id}>{label}</label>
        <output for={id}>
          {value}
          {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={`${value}${unit}`}
        onInput={(event) => onInput(event.currentTarget.valueAsNumber)}
      />
    </div>
  );
}
