import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ViewportPortal,
  type Connection,
  type NodeChange,
  type OnNodeDrag,
  type OnSelectionChangeParams,
  type Viewport,
} from "@xyflow/react";
import { containsPoint, getAreaBounds } from "../../domain/area";
import { getActiveCanvas, useAppStore } from "../../store/appStore";
import { AreaNode } from "./AreaNode";
import { CardNode } from "./CardNode";
import { toFlowEdges, toFlowNodes, type ShepherdFlowNode } from "./flowAdapter";
import { CARD_DRAG_TYPE } from "../project/dragTypes";

const nodeTypes = { card: CardNode, area: AreaNode };
const snapGrid: [number, number] = [16, 16];
const panButtons = [1, 2];
const emptySelectionIds: string[] = [];
const ALIGNMENT_THRESHOLD = 7;

function miniMapNodeColor(node: ShepherdFlowNode): string {
  return node.type === "area" ? String(node.data.color) : "#d4f35d";
}

export function CanvasView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvas = useAppStore(getActiveCanvas);
  const cards = useAppStore((state) => state.projectFile.project.cards);
  const selection = useAppStore((state) => state.selection);
  const viewportNonce = useAppStore((state) => state.viewportNonce);
  const searchMode = useAppStore((state) => state.searchMode);
  const searchQuery = useAppStore((state) => state.searchQuery);
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
  const placeExistingCard = useAppStore((state) => state.placeExistingCard);
  const dragPositionsRef = useRef(new Map<string, { x: number; y: number }>());
  const [altPressed, setAltPressed] = useState(false);
  const [highlightAreaId, setHighlightAreaId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [cardDragOver, setCardDragOver] = useState(false);
  const deferredQuery = useDeferredValue(searchMode === "canvas" ? searchQuery : "");
  const effectiveTags = useMemo(
    () => [...new Set([...(activeTag ? [activeTag] : []), ...filterTags])],
    [activeTag, filterTags],
  );
  const selectedPlacementIds = selection?.type === "placements" ? selection.ids : emptySelectionIds;
  const selectedAreaId = selection?.type === "area" ? selection.id : null;
  const selectedEdgeId = selection?.type === "edge" ? selection.id : null;
  const nodeCanvas = useMemo(() => canvas ? {
    areas: canvas.areas,
    displayMode: canvas.displayMode,
    placements: canvas.placements,
  } : null, [canvas?.areas, canvas?.displayMode, canvas?.placements]);
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
      filterBehavior,
    ) : [],
    [cards, deferredQuery, effectiveTags, filterBehavior, nodeCanvas, selectedAreaId, selectedPlacementIds, tagFilterMode],
  );
  const nodes = domainNodes;
  const edges = useMemo(
    () => edgeCanvas ? toFlowEdges(
      edgeCanvas,
      selectedEdgeId,
      filterBehavior === "hide"
        ? new Set(domainNodes.filter((node) => node.type === "card").map((node) => node.id))
        : undefined,
    ) : [],
    [domainNodes, edgeCanvas, filterBehavior, selectedEdgeId],
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
    const placementIds = selectedNodes.filter((node) => node.type === "card").map((node) => node.id);
    const area = selectedNodes.find((node) => node.type === "area");
    if (placementIds.length) setSelection({ type: "placements", ids: placementIds });
    else if (area) setSelection({ type: "area", id: area.id });
    else if (selectedEdges[0]) setSelection({ type: "edge", id: selectedEdges[0].id });
    else setSelection(null);
  }, [setSelection]);

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

  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: ShepherdFlowNode) => {
    if (node.type === "area") toggleArea(node.id);
  }, [toggleArea]);

  const handleConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) createEdge(connection.source, connection.target);
  }, [createEdge]);

  const handleMoveEnd = useCallback((_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    const currentCanvas = canvasRef.current;
    if (currentCanvas) updateViewport(currentCanvas.id, viewport);
  }, [updateViewport]);

  const handlePaneClick = useCallback(() => setSelection(null), [setSelection]);

  if (!canvas) return <div className="canvas-empty">Canvasを読み込めませんでした。</div>;

  return (
    <div
      className={`canvas-stage${cardDragOver ? " is-card-drag-over" : ""}`}
      ref={containerRef}
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
        minZoom={0.2}
        maxZoom={2.5}
        onNodesChange={handleNodesChange}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onNodeDoubleClick={handleNodeDoubleClick}
        onConnect={handleConnect}
        connectionMode={ConnectionMode.Loose}
        onSelectionChange={handleSelection}
        onMoveEnd={handleMoveEnd}
        onPaneClick={handlePaneClick}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        selectionOnDrag
        panActivationKeyCode="Space"
        panOnDrag={panButtons}
        snapToGrid={!altPressed}
        snapGrid={snapGrid}
        zoomOnDoubleClick={false}
        fitView={false}
        colorMode="dark"
      >
        <Background color="#54584d" gap={28} size={1} variant={BackgroundVariant.Dots} />
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
        </ViewportPortal>
      </ReactFlow>
      <div className="canvas-caption">
        <span>{canvas.title}</span>
        <small>{altPressed ? "Free move" : "16px snap"}</small>
      </div>
    </div>
  );
}

const CARD_WIDTH_FALLBACK = 264;
const CARD_HEIGHT_FALLBACK = 156;
