import {
  CARD_HEIGHT,
  CARD_WIDTH,
  FORMAT_VERSION,
  type CanvasData,
  type ProjectFile,
} from "./models";

export function createId(): string {
  return crypto.randomUUID();
}

export function createCanvas(title: string): CanvasData {
  return {
    id: createId(),
    title,
    placements: [],
    edges: [],
    areas: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    displayMode: "standard",
  };
}

export function createProjectFile(
  title = "Untitled",
  now = new Date().toISOString(),
): ProjectFile {
  const firstCanvas = createCanvas("Canvas 1");

  return {
    formatVersion: FORMAT_VERSION,
    project: {
      id: createId(),
      title: title.trim() || "Untitled",
      cards: [],
      canvases: [firstCanvas],
      tags: [],
      bookmarks: [],
      createdAt: now,
      updatedAt: now,
    },
    workspace: {
      lastOpenedCanvasId: firstCanvas.id,
    },
  };
}

export const DEFAULT_CARD_SIZE = {
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
} as const;
