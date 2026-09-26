export const COLOR_PRESETS = [
  { id: "default", label: "Default" },
  { id: "slate", label: "Slate" },
  { id: "sage", label: "Sage" },
  { id: "clay", label: "Clay" },
  { id: "mauve", label: "Mauve" },
  { id: "sand", label: "Sand" },
] as const;

export function itemColorValue(color: string): string {
  if (COLOR_PRESETS.some((preset) => preset.id === color && color !== "default")) {
    return `var(--tone-${color})`;
  }
  // Colors already stored by older versions of Shepherd remain visible.
  return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : "var(--line)";
}

export function isColorPreset(color: string): boolean {
  return COLOR_PRESETS.some((preset) => preset.id === color);
}
