import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme, initializeTheme, readThemePreference, resolveTheme, saveThemePreference,
  subscribeSystemTheme, ThemeProvider,
} from "../src/app/theme";
import { ProjectToolbar } from "../src/features/project/ProjectToolbar";
import { CanvasSidebar } from "../src/features/project/CanvasSidebar";

describe("Theme preference", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("persists Light/Dark/System independently of Project data and restores it on startup", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    const root = { dataset: {} as Record<string, string> };
    const meta = { setAttribute: vi.fn() };
    vi.stubGlobal("window", { localStorage: storage, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("document", { documentElement: root, querySelector: () => meta });

    expect(readThemePreference()).toBe("system");
    saveThemePreference("dark");
    initializeTheme(); // startup after a previous session
    expect(readThemePreference()).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
    expect(meta.setAttribute).toHaveBeenLastCalledWith("content", "#202735");

    saveThemePreference("light");
    initializeTheme();
    expect(root.dataset.theme).toBe("light");
    expect(meta.setAttribute).toHaveBeenLastCalledWith("content", "#F2F0EC");
    storage.setItem("shepherd.theme", "invalid");
    expect(readThemePreference()).toBe("system");
  });

  it("follows OS changes only for System and releases the media listener", () => {
    let listener: ((event: { matches: boolean }) => void) | undefined;
    const media = {
      matches: true,
      addEventListener: vi.fn((_type: string, handler: (event: { matches: boolean }) => void) => { listener = handler; }),
      removeEventListener: vi.fn(),
    };
    const changes: string[] = [];
    const cleanup = subscribeSystemTheme(media as unknown as MediaQueryList, (dark) => {
      changes.push(resolveTheme("system", dark));
    });
    listener?.({ matches: false });
    expect(changes).toEqual(["dark", "light"]);
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    cleanup();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", listener);
  });

  it("sets the resolved theme on the document without storing it in the project", () => {
    const root = { dataset: {} as Record<string, string> };
    applyTheme("system", false, root as HTMLElement, null);
    expect(root.dataset.theme).toBe("light");
    applyTheme("system", true, root as HTMLElement, null);
    expect(root.dataset.theme).toBe("dark");
  });

  it("keeps the Theme selector to the left of the save and Recovery indicator", () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: () => "light" },
      matchMedia: () => ({ matches: true }),
    });
    const markup = renderToStaticMarkup(createElement(ThemeProvider, null, createElement(ProjectToolbar)));
    expect(markup).toContain('aria-label="Project menu"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('<img src="');
    expect(markup).toContain('<strong>SHEPHERD</strong>');
    expect(markup).not.toContain('>S</button>');
    expect(markup).not.toContain('>Untitled</span>');
    expect(markup).toContain('<option value="light" selected="">Light</option>');
    expect(markup).toContain('<option value="dark">Dark</option>');
    expect(markup.indexOf('aria-label="Theme"')).toBeLessThan(markup.indexOf('class="save-indicator'));
  });

  it("keeps only the six Canvas actions in the Toolbar and Search/Tag filters in the Sidebar", () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: () => "system" },
      matchMedia: () => ({ matches: false }),
    });
    const toolbar = renderToStaticMarkup(createElement(ThemeProvider, null, createElement(ProjectToolbar)));
    const sidebar = renderToStaticMarkup(createElement(CanvasSidebar));
    const actions = toolbar.match(/<nav[^>]*aria-label="Project actions"[^>]*>(.*?)<\/nav>/)?.[1] ?? "";
    expect(actions.match(/<button /g)).toHaveLength(6);
    for (const label of ["Card", "Area", "START", "Bookmarks", "Save", "Export"]) {
      expect(actions).toContain(`>${label}</button>`);
    }
    expect(actions.match(/class="toolbar-icon"/g)).toHaveLength(6);
    expect(sidebar).toContain('id="sidebar-search"');
    expect(sidebar).toContain('<svg viewBox="0 0 20 20" aria-hidden="true"');
    expect(sidebar).not.toContain("🔍");
    expect(sidebar).toContain('aria-label="Tag filters and management"');
    expect(sidebar).toContain("CANVASES");
    expect(sidebar).toContain("UNPLACED");
    expect(sidebar).not.toContain("PROJECT CARDS");
    expect(sidebar).not.toContain('aria-label="Sidebar tools"');
    expect(sidebar).not.toContain("MULTI-VIEW / PHASE 3");
  });
});
