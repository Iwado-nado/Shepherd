import type { CSSProperties } from "react";
import { COLOR_PRESETS, isColorPreset, itemColorValue } from "../colorPresets";

interface ColorPresetsProps {
  value: string | null;
  label: string;
  onChange: (color: string) => void;
}

export function ColorPresets({ value, label, onChange }: ColorPresetsProps) {
  return (
    <div className="color-presets" role="group" aria-label={`${label} color`}>
      {COLOR_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          aria-pressed={value === preset.id}
          onClick={() => onChange(preset.id)}
        >
          <span className="color-swatch" style={{ "--swatch-color": preset.id === "default" ? "var(--card)" : itemColorValue(preset.id) } as CSSProperties} />
          {preset.label}
        </button>
      ))}
      {value !== null && !isColorPreset(value) ? (
        <span className="color-presets-custom">
          <span className="color-swatch" style={{ "--swatch-color": itemColorValue(value) } as CSSProperties} />
          Custom
        </span>
      ) : null}
    </div>
  );
}
