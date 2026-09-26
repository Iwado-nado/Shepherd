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
      color: "sage",
      muted: true,
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T01:00:00.000Z",
    };
    const cardB = {
      id: "card-b",
      title: "Decision",
      body: "Choose a route.",
      tags: ["Branch"],
      color: "default",
      muted: false,
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
      { id: "placement-a", cardId: cardA.id, canvasId: first.id, position: { x: 100, y: 120 }, size: { width: 400, height: 320 }, areaId: "area-a" },
      { id: "placement-b", cardId: cardB.id, canvasId: first.id, position: { x: 420, y: 120 }, size: { width: 264, height: 156 } },
    );
    first.edges.push({
      id: "edge-a",
      canvasId: first.id,
      sourcePlacementId: "placement-a",
      targetPlacementId: "placement-b",
      label: "next",
      direction: "directed",
      lineStyle: "solid",
    });
    second.placements.push({
      id: "placement-c",
      cardId: cardA.id,
      canvasId: second.id,
      position: { x: -80, y: 240 },
      size: { width: 264, height: 440 },
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

    const legacy = JSON.parse(serializeProjectFile(file));
    delete legacy.project.cards[0].color;
    delete legacy.project.cards[0].muted;
    expect(parseProjectFile(JSON.stringify(legacy)).project.cards[0]).toMatchObject({ color: "default", muted: false });
    legacy.project.cards[0].muted = "yes";
    expect(() => parseProjectFile(JSON.stringify(legacy))).toThrow(/muted/);
    delete legacy.project.cards[0].muted;
    delete legacy.project.canvases[0].edges[0].lineStyle;
    expect(parseProjectFile(JSON.stringify(legacy)).project.canvases[0].edges[0].lineStyle).toBe("solid");
    legacy.project.canvases[0].edges[0].lineStyle = "dotted";
    expect(parseProjectFile(JSON.stringify(legacy)).project.canvases[0].edges[0].lineStyle).toBe("dotted");
    legacy.project.canvases[0].edges[0].lineStyle = "zigzag";
    expect(() => parseProjectFile(JSON.stringify(legacy))).toThrow(/lineStyle/);

    const edges = legacy.project.canvases[0].edges;
    edges[0].lineStyle = "solid";
    edges.push({ ...edges[0], id: "same-direction" });
    edges.push({ ...edges[0], id: "reverse-direction", sourcePlacementId: "placement-b", targetPlacementId: "placement-a" });
    const normalized = parseProjectFile(JSON.stringify(legacy));
    expect(normalized.project.canvases[0].edges).toEqual([expect.objectContaining({
      id: "edge-a", sourcePlacementId: "placement-a", targetPlacementId: "placement-b", direction: "undirected",
    })]);

    edges.push({ ...edges[0], id: "different-branch", label: "別の分岐", lineStyle: "dotted" });
    const conflicting = parseProjectFile(JSON.stringify(legacy));
    expect(conflicting.project.canvases[0].edges.map((edge) => edge.id)).toEqual(["edge-a", "different-branch"]);
    expect(parseProjectFile(serializeProjectFile(conflicting)).project.canvases[0].edges).toHaveLength(2);
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
      color: "default",
      muted: false,
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
    };
    project.project.cards.push(card, { ...card });
    expect(() => parseProjectFile(JSON.stringify(project))).toThrow(/duplicate/);
  });

  it("migrates a Core v1 project to the current format", () => {
    const current = createProjectFile("Legacy");
    current.project.cards.push({
      id: "old-card", title: "Legacy", body: "", tags: [], color: "default", muted: false,
      createdAt: current.project.createdAt, updatedAt: current.project.updatedAt,
    });
    current.project.canvases[0].placements.push({
      id: "old-placement", cardId: "old-card", canvasId: current.project.canvases[0].id,
      position: { x: 16, y: 32 }, size: { width: 264, height: 156 },
    });
    const legacy = JSON.parse(JSON.stringify(current)) as Record<string, any>;
    legacy.formatVersion = 1;
    delete legacy.project.bookmarks;
    delete legacy.project.tags;
    for (const card of legacy.project.cards) {
      delete card.tags;
      delete card.color;
      delete card.muted;
    }
    for (const canvas of legacy.project.canvases) {
      delete canvas.areas;
      delete canvas.displayMode;
      for (const placement of canvas.placements) {
        delete placement.areaId;
        delete placement.size;
      }
    }

    const migrated = parseProjectFile(JSON.stringify(legacy));
    expect(migrated.formatVersion).toBe(3);
    expect(migrated.project.tags).toEqual([]);
    expect(migrated.project.bookmarks).toEqual([]);
    expect(migrated.project.canvases[0].areas).toEqual([]);
    expect(migrated.project.canvases[0].displayMode).toBe("standard");
    expect(migrated.project.canvases[0].placements[0].size).toEqual({ width: 264, height: 156 });
    expect(migrated.project.cards[0]).toMatchObject({ color: "default", muted: false });
  });

  it("loads old Placements without size or individual dimensions using standard defaults", () => {
    const file = createProjectFile("Old dimensions");
    const canvas = file.project.canvases[0];
    file.project.cards.push({
      id: "legacy-card", title: "Legacy", body: "", tags: [], color: "default", muted: false,
      createdAt: file.project.createdAt, updatedAt: file.project.updatedAt,
    });
    canvas.placements.push(
      { id: "old-a", cardId: "legacy-card", canvasId: canvas.id, position: { x: 0, y: 0 }, size: { width: 264, height: 156 } },
    );
    const oldFile = JSON.parse(serializeProjectFile(file));
    delete oldFile.project.canvases[0].placements[0].size;

    const loaded = parseProjectFile(JSON.stringify(oldFile));
    expect(loaded.project.canvases[0].placements[0].size).toEqual({ width: 264, height: 156 });
    oldFile.project.canvases[0].placements[0].size = { width: 340 };
    expect(parseProjectFile(JSON.stringify(oldFile)).project.canvases[0].placements[0].size)
      .toEqual({ width: 340, height: 156 });
    oldFile.project.canvases[0].placements[0].size = { height: 250 };
    expect(parseProjectFile(JSON.stringify(oldFile)).project.canvases[0].placements[0].size)
      .toEqual({ width: 264, height: 250 });
  });

  it("rejects invalid Placement sizes instead of replacing them with defaults", () => {
    const file = createProjectFile();
    const canvas = file.project.canvases[0];
    file.project.cards.push({
      id: "card", title: "Card", body: "", tags: [], color: "default", muted: false,
      createdAt: file.project.createdAt, updatedAt: file.project.updatedAt,
    });
    canvas.placements.push({ id: "p", cardId: "card", canvasId: canvas.id,
      position: { x: 0, y: 0 }, size: { width: -1, height: 156 } });
    expect(() => parseProjectFile(serializeProjectFile(file))).toThrow(/greater than zero/);
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
      color: "default",
      muted: false,
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
