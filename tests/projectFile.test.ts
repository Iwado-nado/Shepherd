import { describe, expect, it } from "vitest";
import { createCanvas, createProjectFile } from "../src/domain/project";
import { parseProjectFile, ProjectFileError, serializeProjectFile } from "../src/domain/projectFile";

describe("Project file", () => {
  it("round-trips a Core project", () => {
    const project = createProjectFile("Test project", "2026-09-21T00:00:00.000Z");
    expect(parseProjectFile(serializeProjectFile(project))).toEqual(project);
  });

  it("round-trips a complete multi-canvas project without losing domain data", () => {
    const file = createProjectFile("Round trip", "2026-09-21T00:00:00.000Z");
    const first = file.project.canvases[0];
    const second = createCanvas("Timeline");
    const cardA = {
      id: "card-a",
      title: "Opening",
      body: "The story begins.",
      tags: ["Alice", "Opening"],
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T01:00:00.000Z",
    };
    const cardB = {
      id: "card-b",
      title: "Decision",
      body: "Choose a route.",
      tags: ["Branch"],
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T01:00:00.000Z",
    };
    file.project.tags = ["Alice", "Opening", "Branch", "Act1"];
    file.project.cards = [cardA, cardB];
    first.title = "Plot";
    first.viewport = { x: 48, y: -32, zoom: 1.2 };
    first.areas.push({
      id: "area-a",
      canvasId: first.id,
      title: "Act 1",
      color: "#7f9450",
      tags: ["Act1"],
      anchorX: 10,
      anchorY: 20,
      collapsed: false,
    });
    first.placements.push(
      { id: "placement-a", cardId: cardA.id, canvasId: first.id, position: { x: 100, y: 120 }, size: { width: 264, height: 156 }, areaId: "area-a" },
      { id: "placement-b", cardId: cardB.id, canvasId: first.id, position: { x: 420, y: 120 }, size: { width: 264, height: 156 } },
    );
    first.edges.push({
      id: "edge-a",
      canvasId: first.id,
      sourcePlacementId: "placement-a",
      targetPlacementId: "placement-b",
      label: "next",
      direction: "directed",
    });
    second.placements.push({
      id: "placement-c",
      cardId: cardA.id,
      canvasId: second.id,
      position: { x: -80, y: 240 },
      size: { width: 264, height: 156 },
    });
    file.project.canvases.push(second);
    file.project.start = { canvasId: first.id, placementId: "placement-a", viewport: { ...first.viewport } };
    file.project.bookmarks.push({
      id: "bookmark-a",
      title: "Decision",
      canvasId: first.id,
      targetPlacementId: "placement-b",
      viewport: { ...first.viewport },
    });
    file.workspace.lastOpenedCanvasId = second.id;

    expect(parseProjectFile(serializeProjectFile(file))).toEqual(file);
  });

  it("rejects an unsupported format version", () => {
    const project = createProjectFile();
    const source = JSON.stringify({ ...project, formatVersion: 99 });
    expect(() => parseProjectFile(source)).toThrow(/formatVersion/);
  });

  it("rejects missing Card references", () => {
    const project = createProjectFile();
    const canvas = project.project.canvases[0];
    canvas.placements.push({
      id: crypto.randomUUID(),
      cardId: "missing-card",
      canvasId: canvas.id,
      position: { x: 0, y: 0 },
      size: { width: 264, height: 156 },
    });
    expect(() => parseProjectFile(JSON.stringify(project))).toThrow(ProjectFileError);
  });

  it("rejects duplicate Card IDs", () => {
    const project = createProjectFile();
    const card = {
      id: "same-id",
      title: "Card",
      body: "",
      tags: [],
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
    };
    project.project.cards.push(card, { ...card });
    expect(() => parseProjectFile(JSON.stringify(project))).toThrow(/duplicate/);
  });

  it("migrates a Core v1 project to the current format", () => {
    const current = createProjectFile("Legacy");
    const legacy = JSON.parse(JSON.stringify(current)) as Record<string, any>;
    legacy.formatVersion = 1;
    delete legacy.project.bookmarks;
    delete legacy.project.tags;
    for (const card of legacy.project.cards) delete card.tags;
    for (const canvas of legacy.project.canvases) {
      delete canvas.areas;
      delete canvas.displayMode;
      for (const placement of canvas.placements) delete placement.areaId;
    }

    const migrated = parseProjectFile(JSON.stringify(legacy));
    expect(migrated.formatVersion).toBe(3);
    expect(migrated.project.tags).toEqual([]);
    expect(migrated.project.bookmarks).toEqual([]);
    expect(migrated.project.canvases[0].areas).toEqual([]);
    expect(migrated.project.canvases[0].displayMode).toBe("standard");
  });

  it("rejects Placement references to an Area on another Canvas", () => {
    const project = createProjectFile();
    const canvas = project.project.canvases[0];
    const cardId = crypto.randomUUID();
    const areaId = crypto.randomUUID();
    project.project.cards.push({
      id: cardId,
      title: "Card",
      body: "",
      tags: [],
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
    });
    canvas.placements.push({
      id: crypto.randomUUID(),
      cardId,
      canvasId: canvas.id,
      position: { x: 0, y: 0 },
      size: { width: 264, height: 156 },
      areaId,
    });
    expect(() => parseProjectFile(JSON.stringify(project))).toThrow(/invalid area/);
  });
});
