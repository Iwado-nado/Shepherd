export const FORMAT_VERSION = 3 as const;
export const CARD_WIDTH = 264;
export const CARD_HEIGHT = 156;
export const COMPACT_CARD_WIDTH = 220;
export const COMPACT_CARD_HEIGHT = 80;

export type ProjectId = string;
export type CanvasId = string;
export type CardId = string;
export type PlacementId = string;
export type EdgeId = string;
export type AreaId = string;
export type ISODateTime = string;
export type BookmarkId = string;

export interface Position {
  x: number;
  y: number;
}

export interface Viewport extends Position {
  zoom: number;
}

export interface Card {
  id: CardId;
  title: string;
  body: string;
  tags: string[];
  color: string;
  muted: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Placement {
  id: PlacementId;
  cardId: CardId;
  canvasId: CanvasId;
  position: Position;
  size: {
    width: number;
    height: number;
  };
  areaId?: AreaId;
}

export type EdgeDirection = "directed" | "undirected";
export type EdgeLineStyle = "solid" | "dashed" | "dotted";

export interface Edge {
  id: EdgeId;
  canvasId: CanvasId;
  sourcePlacementId: PlacementId;
  targetPlacementId: PlacementId;
  label: string;
  direction: EdgeDirection;
  lineStyle: EdgeLineStyle;
}

export interface Area {
  id: AreaId;
  canvasId: CanvasId;
  title: string;
  color: string;
  tags: string[];
  anchorX: number;
  anchorY: number;
  collapsed: boolean;
}

export interface CanvasData {
  id: CanvasId;
  title: string;
  placements: Placement[];
  edges: Edge[];
  areas: Area[];
  viewport: Viewport;
  displayMode: CardDisplayMode;
}

export type CardDisplayMode = "standard" | "compact";

export interface ProjectData {
  id: ProjectId;
  title: string;
  cards: Card[];
  canvases: CanvasData[];
  tags: string[];
  start?: StartPoint;
  bookmarks: Bookmark[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface StartPoint {
  canvasId: CanvasId;
  placementId: PlacementId;
  viewport: Viewport;
}

export interface Bookmark {
  id: BookmarkId;
  title: string;
  canvasId: CanvasId;
  targetPlacementId?: PlacementId;
  viewport: Viewport;
}

export interface WorkspaceState {
  lastOpenedCanvasId: CanvasId;
}

export interface ProjectFile {
  formatVersion: typeof FORMAT_VERSION;
  project: ProjectData;
  workspace: WorkspaceState;
}

export type ProjectFileV3 = ProjectFile;
