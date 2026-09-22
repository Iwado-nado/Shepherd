import {
  FORMAT_VERSION,
  type Area,
  type Bookmark,
  type CanvasData,
  type Card,
  type Edge,
  type Placement,
  type ProjectFile,
  type StartPoint,
  type Viewport,
} from "./models";

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFileError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ProjectFileError(`${path} must be an object.`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new ProjectFileError(`${path} must be a string.`);
  return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
  const result = requireString(value, path);
  if (!result) throw new ProjectFileError(`${path} must not be empty.`);
  return result;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProjectFileError(`${path} must be a finite number.`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new ProjectFileError(`${path} must be a boolean.`);
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ProjectFileError(`${path} must be an array.`);
  return value;
}

function readStrings(value: unknown, path: string): string[] {
  return requireArray(value, path).map((item, index) =>
    requireNonEmptyString(item, `${path}[${index}]`),
  );
}

function readViewport(value: unknown, path: string): Viewport {
  const item = requireRecord(value, path);
  const zoom = requireNumber(item.zoom, `${path}.zoom`);
  if (zoom <= 0) throw new ProjectFileError(`${path}.zoom must be greater than zero.`);
  return {
    x: requireNumber(item.x, `${path}.x`),
    y: requireNumber(item.y, `${path}.y`),
    zoom,
  };
}

function readCard(value: unknown, index: number, legacy: boolean): Card {
  const path = `project.cards[${index}]`;
  const item = requireRecord(value, path);
  return {
    id: requireNonEmptyString(item.id, `${path}.id`),
    title: requireString(item.title, `${path}.title`),
    body: requireString(item.body, `${path}.body`),
    tags: legacy ? [] : readStrings(item.tags, `${path}.tags`),
    createdAt: requireNonEmptyString(item.createdAt, `${path}.createdAt`),
    updatedAt: requireNonEmptyString(item.updatedAt, `${path}.updatedAt`),
  };
}

function readPlacement(
  value: unknown,
  canvasIndex: number,
  index: number,
  legacy: boolean,
): Placement {
  const path = `project.canvases[${canvasIndex}].placements[${index}]`;
  const item = requireRecord(value, path);
  const position = requireRecord(item.position, `${path}.position`);
  const size = requireRecord(item.size, `${path}.size`);
  const width = requireNumber(size.width, `${path}.size.width`);
  const height = requireNumber(size.height, `${path}.size.height`);
  if (width <= 0 || height <= 0) {
    throw new ProjectFileError(`${path}.size must be greater than zero.`);
  }
  const areaId = legacy || item.areaId === undefined
    ? undefined
    : requireNonEmptyString(item.areaId, `${path}.areaId`);
  return {
    id: requireNonEmptyString(item.id, `${path}.id`),
    cardId: requireNonEmptyString(item.cardId, `${path}.cardId`),
    canvasId: requireNonEmptyString(item.canvasId, `${path}.canvasId`),
    position: {
      x: requireNumber(position.x, `${path}.position.x`),
      y: requireNumber(position.y, `${path}.position.y`),
    },
    size: { width, height },
    ...(areaId ? { areaId } : {}),
  };
}

function readEdge(value: unknown, canvasIndex: number, index: number): Edge {
  const path = `project.canvases[${canvasIndex}].edges[${index}]`;
  const item = requireRecord(value, path);
  const direction = requireString(item.direction, `${path}.direction`);
  if (direction !== "directed" && direction !== "undirected") {
    throw new ProjectFileError(`${path}.direction is not supported.`);
  }
  return {
    id: requireNonEmptyString(item.id, `${path}.id`),
    canvasId: requireNonEmptyString(item.canvasId, `${path}.canvasId`),
    sourcePlacementId: requireNonEmptyString(item.sourcePlacementId, `${path}.sourcePlacementId`),
    targetPlacementId: requireNonEmptyString(item.targetPlacementId, `${path}.targetPlacementId`),
    label: requireString(item.label, `${path}.label`),
    direction,
  };
}

function readArea(value: unknown, canvasIndex: number, index: number): Area {
  const path = `project.canvases[${canvasIndex}].areas[${index}]`;
  const item = requireRecord(value, path);
  return {
    id: requireNonEmptyString(item.id, `${path}.id`),
    canvasId: requireNonEmptyString(item.canvasId, `${path}.canvasId`),
    title: requireString(item.title, `${path}.title`),
    color: requireNonEmptyString(item.color, `${path}.color`),
    tags: readStrings(item.tags, `${path}.tags`),
    anchorX: requireNumber(item.anchorX, `${path}.anchorX`),
    anchorY: requireNumber(item.anchorY, `${path}.anchorY`),
    collapsed: requireBoolean(item.collapsed, `${path}.collapsed`),
  };
}

function readCanvas(value: unknown, index: number, version: number): CanvasData {
  const path = `project.canvases[${index}]`;
  const item = requireRecord(value, path);
  return {
    id: requireNonEmptyString(item.id, `${path}.id`),
    title: requireString(item.title, `${path}.title`),
    placements: requireArray(item.placements, `${path}.placements`).map((placement, itemIndex) =>
      readPlacement(placement, index, itemIndex, version === 1),
    ),
    edges: requireArray(item.edges, `${path}.edges`).map((edge, itemIndex) =>
      readEdge(edge, index, itemIndex),
    ),
    areas: version === 1
      ? []
      : requireArray(item.areas, `${path}.areas`).map((area, itemIndex) =>
          readArea(area, index, itemIndex),
        ),
    viewport: readViewport(item.viewport, `${path}.viewport`),
    displayMode: version < 3
      ? "standard"
      : (() => {
          const mode = requireString(item.displayMode, `${path}.displayMode`);
          if (mode !== "standard" && mode !== "compact") {
            throw new ProjectFileError(`${path}.displayMode is not supported.`);
          }
          return mode;
        })(),
  };
}

function readStart(value: unknown): StartPoint | undefined {
  if (value === undefined) return undefined;
  const item = requireRecord(value, "project.start");
  return {
    canvasId: requireNonEmptyString(item.canvasId, "project.start.canvasId"),
    placementId: requireNonEmptyString(item.placementId, "project.start.placementId"),
    viewport: readViewport(item.viewport, "project.start.viewport"),
  };
}

function readBookmark(value: unknown, index: number): Bookmark {
  const path = `project.bookmarks[${index}]`;
  const item = requireRecord(value, path);
  return {
    id: requireNonEmptyString(item.id, `${path}.id`),
    title: requireString(item.title, `${path}.title`),
    canvasId: requireNonEmptyString(item.canvasId, `${path}.canvasId`),
    ...(item.targetPlacementId === undefined
      ? {}
      : { targetPlacementId: requireNonEmptyString(item.targetPlacementId, `${path}.targetPlacementId`) }),
    viewport: readViewport(item.viewport, `${path}.viewport`),
  };
}

function assertUnique(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new ProjectFileError(`${label} contains duplicate values.`);
  }
}

function assertTags(tags: string[], projectTags: Set<string>, label: string): void {
  assertUnique(tags, label);
  for (const tag of tags) {
    if (!projectTags.has(tag)) throw new ProjectFileError(`${label} references unknown tag ${tag}.`);
  }
}

function assertInvariants(file: ProjectFile): void {
  const cardIdList = file.project.cards.map((card) => card.id);
  const canvasIdList = file.project.canvases.map((canvas) => canvas.id);
  assertUnique(cardIdList, "Cards");
  assertUnique(canvasIdList, "Canvases");
  assertUnique(file.project.tags, "Project tags");
  const cardIds = new Set(cardIdList);
  const canvasIds = new Set(canvasIdList);
  const projectTags = new Set(file.project.tags);

  if (file.project.canvases.length === 0) {
    throw new ProjectFileError("A project must contain at least one canvas.");
  }
  if (!canvasIds.has(file.workspace.lastOpenedCanvasId)) {
    throw new ProjectFileError("workspace.lastOpenedCanvasId does not reference a canvas.");
  }
  for (const card of file.project.cards) assertTags(card.tags, projectTags, `Card ${card.id} tags`);

  const placementIds: string[] = [];
  const edgeIds: string[] = [];
  const areaIds: string[] = [];
  for (const canvas of file.project.canvases) {
    const placementsInCanvas = new Map(canvas.placements.map((placement) => [placement.id, placement]));
    const areasInCanvas = new Set(canvas.areas.map((area) => area.id));
    assertUnique(canvas.placements.map((placement) => placement.cardId), `Canvas ${canvas.id} card placements`);

    for (const area of canvas.areas) {
      areaIds.push(area.id);
      if (area.canvasId !== canvas.id) {
        throw new ProjectFileError(`Area ${area.id} belongs to the wrong canvas.`);
      }
      assertTags(area.tags, projectTags, `Area ${area.id} tags`);
    }
    for (const placement of canvas.placements) {
      placementIds.push(placement.id);
      if (placement.canvasId !== canvas.id) {
        throw new ProjectFileError(`Placement ${placement.id} belongs to the wrong canvas.`);
      }
      if (!cardIds.has(placement.cardId)) {
        throw new ProjectFileError(`Placement ${placement.id} references a missing card.`);
      }
      if (placement.areaId && !areasInCanvas.has(placement.areaId)) {
        throw new ProjectFileError(`Placement ${placement.id} references an invalid area.`);
      }
    }
    for (const edge of canvas.edges) {
      edgeIds.push(edge.id);
      const source = placementsInCanvas.get(edge.sourcePlacementId);
      const target = placementsInCanvas.get(edge.targetPlacementId);
      if (edge.canvasId !== canvas.id || !source || !target) {
        throw new ProjectFileError(`Edge ${edge.id} has invalid canvas endpoints.`);
      }
      if (source.id === target.id) throw new ProjectFileError(`Edge ${edge.id} is a self edge.`);
    }
  }
  assertUnique(placementIds, "Placements");
  assertUnique(edgeIds, "Edges");
  assertUnique(areaIds, "Areas");

  if (file.project.start) {
    const canvas = file.project.canvases.find((item) => item.id === file.project.start?.canvasId);
    if (!canvas?.placements.some((item) => item.id === file.project.start?.placementId)) {
      throw new ProjectFileError("Project START references an invalid placement.");
    }
  }
  assertUnique(file.project.bookmarks.map((bookmark) => bookmark.id), "Bookmarks");
  for (const bookmark of file.project.bookmarks) {
    const canvas = file.project.canvases.find((item) => item.id === bookmark.canvasId);
    if (!canvas) throw new ProjectFileError(`Bookmark ${bookmark.id} references an invalid canvas.`);
    if (bookmark.targetPlacementId && !canvas.placements.some((item) => item.id === bookmark.targetPlacementId)) {
      throw new ProjectFileError(`Bookmark ${bookmark.id} references an invalid placement.`);
    }
  }
}

export function parseProjectFile(source: string): ProjectFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new ProjectFileError("The selected file is not valid JSON.");
  }

  const root = requireRecord(parsed, "Project file");
  if (root.formatVersion !== 1 && root.formatVersion !== 2 && root.formatVersion !== FORMAT_VERSION) {
    throw new ProjectFileError(
      `Unsupported formatVersion: ${String(root.formatVersion)}. Expected 1, 2, or ${FORMAT_VERSION}.`,
    );
  }
  const version = root.formatVersion;
  const coreLegacy = version === 1;
  const project = requireRecord(root.project, "project");
  const workspace = requireRecord(root.workspace, "workspace");
  const result: ProjectFile = {
    formatVersion: FORMAT_VERSION,
    project: {
      id: requireNonEmptyString(project.id, "project.id"),
      title: requireString(project.title, "project.title"),
      cards: requireArray(project.cards, "project.cards").map((card, index) =>
        readCard(card, index, coreLegacy),
      ),
      canvases: requireArray(project.canvases, "project.canvases").map((canvas, index) =>
        readCanvas(canvas, index, version),
      ),
      tags: coreLegacy ? [] : readStrings(project.tags, "project.tags"),
      ...(!coreLegacy && project.start !== undefined ? { start: readStart(project.start) } : {}),
      bookmarks: version < 3
        ? []
        : requireArray(project.bookmarks, "project.bookmarks").map(readBookmark),
      createdAt: requireNonEmptyString(project.createdAt, "project.createdAt"),
      updatedAt: requireNonEmptyString(project.updatedAt, "project.updatedAt"),
    },
    workspace: {
      lastOpenedCanvasId: requireNonEmptyString(
        workspace.lastOpenedCanvasId,
        "workspace.lastOpenedCanvasId",
      ),
    },
  };

  assertInvariants(result);
  return result;
}

export function serializeProjectFile(file: ProjectFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
