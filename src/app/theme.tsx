import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "shepherd.theme";
const SYSTEM_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function readThemePreference(storage?: Pick<Storage, "getItem">): ThemePreference {
  try {
    const value = (storage ?? (typeof window === "undefined" ? undefined : window.localStorage))?.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : "system";
  } catch {
    return "system";
  }
}

export function saveThemePreference(preference: ThemePreference, storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? (typeof window === "undefined" ? undefined : window.localStorage))?.setItem(STORAGE_KEY, preference);
  } catch {
    // Theme selection still applies for this session when storage is unavailable.
  }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" &&
    window.matchMedia(SYSTEM_QUERY).matches;
}

export function applyTheme(preference: ThemePreference, systemDark: boolean, root: HTMLElement, meta: HTMLMetaElement | null): void {
  const resolved = resolveTheme(preference, systemDark);
  root.dataset.theme = resolved;
  meta?.setAttribute("content", resolved === "light" ? "#F2F0EC" : "#202735");
}

export function initializeTheme(): void {
  applyTheme(
    readThemePreference(),
    systemPrefersDark(),
    document.documentElement,
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]'),
  );
}

export function subscribeSystemTheme(
  media: Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">,
  onChange: (dark: boolean) => void,
): () => void {
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);
  onChange(media.matches);
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const resolvedTheme = resolveTheme(preference, systemDark);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    return subscribeSystemTheme(window.matchMedia(SYSTEM_QUERY), setSystemDark);
  }, []);

  useLayoutEffect(() => {
    applyTheme(preference, systemDark, document.documentElement,
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]'));
  }, [preference, systemDark]);

  return (
    <ThemeContext.Provider value={{
      preference,
      resolvedTheme,
      setPreference: (next) => {
        saveThemePreference(next);
        setPreference(next);
      },
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("ThemeProvider is missing.");
  return theme;
}
