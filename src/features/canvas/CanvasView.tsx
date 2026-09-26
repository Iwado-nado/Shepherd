import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  SelectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ViewportPortal,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnNodeDrag,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { containsPoint, getAreaBounds } from "../../domain/area";
import { getActiveCanvas, useAppStore } from "../../store/appStore";
import { AreaNode } from "./AreaNode";
import { CardNode } from "./CardNode";
import { toFlowEdges, toFlowNodes, type ShepherdFlowNode } from "./flowAdapter";
import {
  MULTI_SELECTION_KEY_CODES,
  selectionAfterEdgeChanges,
  selectionAfterNodeChanges,
  selectionFromFlowElements,
} from "./flowSelection";
import { activateNodeByDoubleClick } from "./nodeInteractions";
import { CARD_DRAG_TYPE } from "../project/dragTypes";
import { canCreateRightDragEdge, exceedsRightDragThreshold } from "./rightDragConnection";
import { createCardOnBackgroundDoubleClick } from "./canvasDoubleClick";
import { itemColorValue } from "../colorPresets";
import { useTheme } from "../../app/theme";
import { resizeCardFromPointer, type CardSize } from "../../domain/cardSize";
import type { CardSizePreview } from "./flowAdapter";

const nodeTypes = { card: CardNode, area: AreaNode };
const snapGrid: [number, number] = [16, 16];
const panButtons = [1, 2];
const emptySelectionIds: string[] = [];
const ALIGNMENT_THRESHOLD = 7;

interface RightConnectionDrag {
  pointerId: number;
  sourceId: string;
  startClient: { x: number; y: number };
  startCanvas: { x: number; y: number };
  active: boolean;
}

interface RightConnectionPreview {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface CardResizeDrag {
  pointerId: number;
  canvasId: string;
  placementId: string;
  start: { x: number; y: number };
  size: CardSize;
  zoom: number;
}

function miniMapNodeColor(node: ShepherdFlowNode): string {
  return node.type === "area" ? "var(--area-outline)" : node.selected ? "var(--accent)"
    : node.data.muted ? "var(--line)" : node.data.color !== "default" ? itemColorValue(node.data.color) : "var(--edge)";
}

export function CanvasView() {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<ShepherdFlowNode> | null>(null);
  const canvas = useAppStore(getActiveCanvas);
  const cards = useAppStore((state) => state.projectFile.project.cards);
  const start = useAppStore((state) => state.projectFile.project.start);
  const bookmarks = useAppStore((state) => state.projectFile.project.bookmarks);
  const selection = useAppStore((state) => state.selection);
  const viewportNonce = useAppStore((state) => state.viewportNonce);
  const searchMode = useAppStore((state) => state.searchMode);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const sidebarSearchQuery = useAppStore((state) => state.sidebarSearchQuery);
  const activeTag = useAppStore((state) => state.activeTag);
  const filterTags = useAppStore((state) => state.filterTags);
  const filterBehavior = useAppStore((state) => state.filterBehavior);
  const tagFilterMode = useAppStore((state) => state.tagFilterMode);
  const setSelection = useAppStore((state) => state.setSelection);
  const setCanvasSize = useAppStore((state) => state.setCanvasSize);
  const updateViewport = useAppStore((state) => state.updateViewport);
  const movePlacements = useAppStore((state) => state.movePlacements);
  const moveArea = useAppStore((state) => state.moveArea);
  const toggleArea = useAppStore((state) => state.toggleArea);
  const createEdge = useAppStore((state) => state.createEdge);
  const createCardAt = useAppStore((state) => state.createCardAt);
  const resizePlacement = useAppStore((state) => state.resizePlacement);
  const placeExistingCard = useAppStore((state) => state.placeExistingCard);
  const openStoryEditor = useAppStore((state) => state.openStoryEditor);
  const dragPositionsRef = useRef(new Map<string, { x: number; y: number }>());
  const rightConnectionRef = useRef<RightConnectionDrag | null>(null);
  const cardResizeRef = useRef<CardResizeDrag | null>(null);
  const suppressContextMenuRef = useRef(false);
  const [altPressed, setAltPressed] = useState(false);
  const [highlightAreaId, setHighlightAreaId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [cardDragOver, setCardDragOver] = useState(false);
  const [rightConnectionPreview, setRightConnectionPreview] = useState<RightConnectionPreview | null>(null);
  const [cardResizePreview, setCardResizePreview] = useState<(CardSizePreview & { canvasId: string }) | null>(null);
  const deferredQuery = useDeferredValue(sidebarSearchQuery || (searchMode === "canvas" ? searchQuery : ""));
  const effectiveTags = useMemo(
    () => [...new Set([...(activeTag ? [activeTag] : []), ...filterTags])],
    [activeTag, filterTags],
  );
  const effectiveFilterBehavior = sidebarSearchQuery.trim() ||
    (searchMode === "canvas" && searchQuery.trim()) || effectiveTags.length ? "dim" : filterBehavior;
  const mutedCardIds = useMemo(() => new Set(cards.filter((card) => card.muted).map((card) => card.id)), [cards]);
  const cardStatus = useMemo(() => ({
    startPlacementId: start && start.canvasId === canvas?.id ? start.placementId : null,
    bookmarkedPlacementIds: new Set(bookmarks.flatMap((bookmark) =>
      bookmark.canvasId === canvas?.id && bookmark.targetPlacementId ? [bookmark.targetPlacementId] : [])),
  }), [bookmarks, canvas?.id, start?.canvasId, start?.placementId]);
  const selectedPlacementIds = selection?.type === "placements" ? selection.ids : emptySelectionIds;
  const selectedPlacement = selectedPlacementIds.length === 1
    ? canvas?.placements.find((placement) => placement.id === selectedPlacementIds[0])
    : undefined;
  const resizePreview = cardResizePreview && cardResizePreview.canvasId === canvas?.id &&
    selectedPlacement?.id === cardResizePreview.placementId ? cardResizePreview : undefined;
  const selectedAreaId = selection?.type === "area" ? selection.id : null;
  const selectedEdgeId = selection?.type === "edge" ? selection.id : null;
  const nodeCanvas = useMemo(() => canvas ? {
    areas: canvas.areas,
    placements: canvas.placements,
  } : null, [canvas?.areas, canvas?.placements]);
  const edgeCanvas = useMemo(() => canvas ? {
    areas: canvas.areas,
    edges: canvas.edges,
    placements: canvas.placements,
  } : null, [canvas?.areas, canvas?.edges, canvas?.placements]);

  const domainNodes = useMemo(
    () => nodeCanvas ? toFlowNodes(
      nodeCanvas,
      cards,
      selectedPlacementIds,
      selectedAreaId,
      deferredQuery,
      effectiveTags,
      tagFilterMode,
      effectiveFilterBehavior,
      resizePreview,
      cardStatus,
    ) : [],
    [cardStatus, cards, deferredQuery, effectiveFilterBehavior, effectiveTags, nodeCanvas, resizePreview, selectedAreaId, selectedPlacementIds, tagFilterMode],
  );
  const nodes = domainNodes;
  const dimmedPlacementIds = useMemo(() => new Set(domainNodes.flatMap((node) =>
    node.type === "card" && node.className?.includes("is-dimmed") ? [node.id] : [])), [domainNodes]);
  const edges = useMemo(
    () => edgeCanvas ? toFlowEdges(
      edgeCanvas,
      selectedEdgeId,
      effectiveFilterBehavior === "hide"
        ? new Set(domainNodes.filter((node) => node.type === "card").map((node) => node.id))
        : undefined,
      resizePreview,
      mutedCardIds,
      dimmedPlacementIds,
    ) : [],
    [dimmedPlacementIds, domainNodes, edgeCanvas, effectiveFilterBehavior, mutedCardIds, resizePreview, selectedEdgeId],
  );
  const renderedNodes = useMemo(
    () => nodes.map((node) => node.type === "area" && node.id === highlightAreaId
      ? { ...node, className: `${node.className ?? ""} is-drop-target`.trim() }
      : node),
    [highlightAreaId, nodes],
  );
  const canvasRef = useRef(canvas);
  const nodesRef = useRef(nodes);
  const selectionRef = useRef(selection);
  canvasRef.current = canvas;
  nodesRef.current = nodes;
  selectionRef.current = selection;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setCanvasSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [setCanvasSize]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => event.key === "Alt" && setAltPressed(true);
    const up = (event: KeyboardEvent) => event.key === "Alt" && setAltPressed(false);
    const reset = () => setAltPressed(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, []);

  const handleNodesChange = useCallback((changes: NodeChange<ShepherdFlowNode>[]) => {
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        dragPositionsRef.current.set(change.id, change.position);
      }
    }
    const state = useAppStore.getState();
    state.setSelection(selectionAfterNodeChanges(state.selection, nodesRef.current, changes));
  }, []);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    const state = useAppStore.getState();
    state.setSelection(selectionAfterEdgeChanges(state.selection, changes));
  }, []);

  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: { id: string }) => {
    if (!event.ctrlKey && !event.metaKey) useAppStore.getState().setSelection({ type: "edge", id: edge.id });
  }, []);

  const findDropArea = useCallback((node: ShepherdFlowNode): string | null => {
    if (node.type !== "card") return null;
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return null;
    const placement = currentCanvas.placements.find((item) => item.id === node.id);
    if (!placement) return null;
    const centerX = node.position.x + placement.size.width / 2;
    const centerY = node.position.y + placement.size.height / 2;
    const candidate = currentCanvas.areas.find((area) =>
      !area.collapsed && containsPoint(getAreaBounds(area, currentCanvas.placements), centerX, centerY, 20),
    );
    if (candidate) return candidate.id;
    if (placement.areaId) {
      const current = currentCanvas.areas.find((area) => area.id === placement.areaId);
      if (current && containsPoint(getAreaBounds(current, currentCanvas.placements), centerX, centerY, 56)) {
        return current.id;
      }
    }
    return "";
  }, []);

  const updateGuides = useCallback((node: ShepherdFlowNode) => {
    if (node.type !== "card") return;
    const width = node.width ?? CARD_WIDTH_FALLBACK;
    const height = node.height ?? CARD_HEIGHT_FALLBACK;
    const xCandidates = [node.position.x, node.position.x + width / 2, node.position.x + width];
    const yCandidates = [node.position.y, node.position.y + height / 2, node.position.y + height];
    let guideX: number | undefined;
    let guideY: number | undefined;
    for (const other of nodesRef.current) {
      if (other.id === node.id || other.type !== "card") continue;
      const otherWidth = other.width ?? CARD_WIDTH_FALLBACK;
      const otherHeight = other.height ?? CARD_HEIGHT_FALLBACK;
      const otherX = [other.position.x, other.position.x + otherWidth / 2, other.position.x + otherWidth];
      const otherY = [other.position.y, other.position.y + otherHeight / 2, other.position.y + otherHeight];
      guideX ??= otherX.find((value) => xCandidates.some((candidate) => Math.abs(candidate - value) <= ALIGNMENT_THRESHOLD));
      guideY ??= otherY.find((value) => yCandidates.some((candidate) => Math.abs(candidate - value) <= ALIGNMENT_THRESHOLD));
    }
    setGuides((current) => current.x === guideX && current.y === guideY
      ? current
      : { x: guideX, y: guideY });
  }, []);

  const handleSelection = useCallback(({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
    selectionRef.current = selectionFromFlowElements(selectedNodes as ShepherdFlowNode[], selectedEdges);
  }, []);

  const handleNodeDrag = useCallback<OnNodeDrag<ShepherdFlowNode>>((_, node) => {
    updateGuides(node);
    const areaId = findDropArea(node);
    setHighlightAreaId((current) => current === (areaId || null) ? current : (areaId || null));
  }, [findDropArea, updateGuides]);

  const handleNodeDragStop = useCallback<OnNodeDrag<ShepherdFlowNode>>((_, node) => {
    setGuides({});
    setHighlightAreaId(null);
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return;
    if (node.type === "area") {
      moveArea(node.id, { x: node.position.x - node.data.boundsX, y: node.position.y - node.data.boundsY });
      dragPositionsRef.current.clear();
      return;
    }
    const currentSelection = selectionRef.current;
    const selectedIds = currentSelection?.type === "placements" && currentSelection.ids.includes(node.id)
      ? currentSelection.ids
      : [node.id];
    const moves = selectedIds.flatMap((id) => {
      const local = nodesRef.current.find((item) => item.id === id && item.type === "card");
      if (id === node.id) return [{ id, position: node.position }];
      const position = dragPositionsRef.current.get(id) ?? local?.position;
      return position ? [{ id, position }] : [];
    });
    const dropArea = selectedIds.length === 1 ? findDropArea(node) : null;
    movePlacements(moves, selectedIds.length === 1 ? (dropArea || null) : undefined);
    dragPositionsRef.current.clear();
  }, [findDropArea, moveArea, movePlacements]);

  const handleNodeDoubleClick = useCallback((event: React.MouseEvent, node: ShepherdFlowNode) => {
    if (event.target instanceof Element && event.target.closest(".react-flow__handle")) return;
    event.preventDefault();
    event.stopPropagation();
    activateNodeByDoubleClick(node, openStoryEditor, toggleArea);
  }, [openStoryEditor, toggleArea]);

  const handleConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) createEdge(connection.source, connection.target);
  }, [createEdge]);

  const handleMoveEnd = useCallback((_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    const currentCanvas = canvasRef.current;
    if (currentCanvas) updateViewport(currentCanvas.id, viewport);
  }, [updateViewport]);

  const handleBackgroundDoubleClick = useCallback((event: React.MouseEvent) => {
    const instance = flowInstanceRef.current;
    if (instance) createCardOnBackgroundDoubleClick(event, instance.screenToFlowPosition, createCardAt);
  }, [createCardAt]);

  const startCardResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !canvas || !selectedPlacement) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    cardResizeRef.current = {
      pointerId: event.pointerId,
      canvasId: canvas.id,
      placementId: selectedPlacement.id,
      start: { x: event.clientX, y: event.clientY },
      size: { ...selectedPlacement.size },
      zoom: flowInstanceRef.current?.getViewport().zoom ?? canvas.viewport.zoom,
    };
  };

  const moveCardResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = cardResizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const size = resizeCardFromPointer(drag.size, drag.start, { x: event.clientX, y: event.clientY }, drag.zoom);
    setCardResizePreview((previous) => previous?.placementId === drag.placementId &&
      previous.size.width === size.width && previous.size.height === size.height
      ? previous
      : { canvasId: drag.canvasId, placementId: drag.placementId, size });
  };

  const finishCardResize = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = cardResizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cardResizeRef.current = null;
    setCardResizePreview(null);
    if (!cancelled && canvasRef.current?.id === drag.canvasId) {
      resizePlacement(drag.placementId, resizeCardFromPointer(
        drag.size, drag.start, { x: event.clientX, y: event.clientY }, drag.zoom,
      ));
    }
  };

  const cardPlacementIdAt = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return null;
    const placementId = target.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null;
    const currentCanvas = canvasRef.current;
    return placementId && currentCanvas?.placements.some((placement) => placement.id === placementId)
      ? placementId
      : null;
  }, []);

  const handleRightPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    suppressContextMenuRef.current = false;
    const sourceId = cardPlacementIdAt(event.target);
    if (!sourceId || !(event.target instanceof Element)) return;
    const sourceElement = event.target.closest<HTMLElement>(".react-flow__node");
    if (!sourceElement) return;
    const stageBounds = event.currentTarget.getBoundingClientRect();
    const sourceBounds = sourceElement.getBoundingClientRect();
    rightConnectionRef.current = {
      pointerId: event.pointerId,
      sourceId,
      startClient: { x: event.clientX, y: event.clientY },
      startCanvas: {
        x: sourceBounds.right - stageBounds.left,
        y: sourceBounds.top + sourceBounds.height / 2 - stageBounds.top,
      },
      active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }, [cardPlacementIdAt]);

  const handleRightPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = rightConnectionRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && exceedsRightDragThreshold(drag.startClient, { x: event.clientX, y: event.clientY })) {
      drag.active = true;
    }
    if (drag.active) {
      const stageBounds = event.currentTarget.getBoundingClientRect();
      setRightConnectionPreview({
        start: drag.startCanvas,
        end: { x: event.clientX - stageBounds.left, y: event.clientY - stageBounds.top },
      });
      event.preventDefault();
    }
    event.stopPropagation();
  }, []);

  const finishRightConnection = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = rightConnectionRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const targetId = cancelled ? null : cardPlacementIdAt(document.elementFromPoint(event.clientX, event.clientY));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    rightConnectionRef.current = null;
    setRightConnectionPreview(null);
    if (drag.active) {
      suppressContextMenuRef.current = true;
      event.preventDefault();
      const currentCanvas = canvasRef.current;
      if (currentCanvas && canCreateRightDragEdge(currentCanvas, drag.sourceId, targetId)) {
        createEdge(drag.sourceId, targetId);
      }
    }
    event.stopPropagation();
  }, [cardPlacementIdAt, createEdge]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressContextMenuRef.current && !rightConnectionRef.current?.active) return;
    suppressContextMenuRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  if (!canvas) return <div className="canvas-empty">Canvasを読み込めませんでした。</div>;

  return (
    <div
      className={`canvas-stage${cardDragOver ? " is-card-drag-over" : ""}`}
      ref={containerRef}
      onPointerDownCapture={handleRightPointerDown}
      onPointerMoveCapture={handleRightPointerMove}
      onPointerUpCapture={(event) => finishRightConnection(event)}
      onPointerCancelCapture={(event) => finishRightConnection(event, true)}
      onContextMenuCapture={handleContextMenu}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes(CARD_DRAG_TYPE)) setCardDragOver(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(CARD_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCardDragOver(false);
      }}
      onDrop={(event) => {
        const cardId = event.dataTransfer.getData(CARD_DRAG_TYPE);
        setCardDragOver(false);
        if (!cardId) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        placeExistingCard(cardId, {
          x: (event.clientX - bounds.left - canvas.viewport.x) / canvas.viewport.zoom - CARD_WIDTH_FALLBACK / 2,
          y: (event.clientY - bounds.top - canvas.viewport.y) / canvas.viewport.zoom - CARD_HEIGHT_FALLBACK / 2,
        });
      }}
    >
      <ReactFlow<ShepherdFlowNode>
        key={`${canvas.id}-${viewportNonce}`}
        nodes={renderedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultViewport={canvas.viewport}
        onInit={(instance) => { flowInstanceRef.current = instance; }}
        minZoom={0.2}
        maxZoom={2.5}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onEdgeClick={handleEdgeClick}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onNodeDoubleClick={handleNodeDoubleClick}
        onConnect={handleConnect}
        onDoubleClick={handleBackgroundDoubleClick}
        connectionMode={ConnectionMode.Loose}
        onSelectionChange={handleSelection}
        onMoveEnd={handleMoveEnd}
        onPaneClick={() => setSelection(null)}
        deleteKeyCode={null}
        elementsSelectable
        multiSelectionKeyCode={MULTI_SELECTION_KEY_CODES}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panActivationKeyCode="Space"
        panOnDrag={panButtons}
        snapToGrid={!altPressed}
        snapGrid={snapGrid}
        zoomOnDoubleClick={false}
        fitView={false}
        colorMode={resolvedTheme}
        defaultMarkerColor="var(--edge)"
      >
        <Background color="var(--grid-dot)" gap={28} size={1} variant={BackgroundVariant.Dots} />
        <MiniMap
          pannable
          zoomable
          nodeColor={miniMapNodeColor}
          nodeStrokeWidth={2}
        />
        <Controls showInteractive={false} position="bottom-right" />
        <ViewportPortal>
          {guides.x !== undefined ? <div className="alignment-guide vertical" style={{ left: guides.x }} /> : null}
          {guides.y !== undefined ? <div className="alignment-guide horizontal" style={{ top: guides.y }} /> : null}
          {selectedPlacement && renderedNodes.some((node) => node.type === "card" && node.id === selectedPlacement.id) ? (
            <div
              className="card-resize-frame"
              style={{
                left: selectedPlacement.position.x,
                top: selectedPlacement.position.y,
                width: resizePreview?.size.width ?? selectedPlacement.size.width,
                height: resizePreview?.size.height ?? selectedPlacement.size.height,
              }}
            >
              <button
                className="card-resize-handle nodrag nopan nokey"
                type="button"
                aria-label="Cardのサイズを変更"
                title="ドラッグしてCardをリサイズ"
                onPointerDown={startCardResize}
                onPointerMove={moveCardResize}
                onPointerUp={(event) => finishCardResize(event)}
                onPointerCancel={(event) => finishCardResize(event, true)}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
              />
            </div>
          ) : null}
        </ViewportPortal>
      </ReactFlow>
      {rightConnectionPreview ? (
        <svg className="right-connection-preview" aria-hidden="true">
          <line
            x1={rightConnectionPreview.start.x}
            y1={rightConnectionPreview.start.y}
            x2={rightConnectionPreview.end.x}
            y2={rightConnectionPreview.end.y}
          />
        </svg>
      ) : null}
      <div className="canvas-caption">
        <span>{canvas.title}</span>
        <small>{altPressed ? "Free move" : "16px snap"}</small>
      </div>
    </div>
  );
}

const CARD_WIDTH_FALLBACK = 264;
const CARD_HEIGHT_FALLBACK = 156;
