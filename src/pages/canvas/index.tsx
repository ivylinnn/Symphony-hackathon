/* eslint-disable max-lines-per-function */
import { useNavigate } from '@edenx/runtime/router';
import { KsIconClose } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import AgentPanel, { type AgentMessage } from './components/AgentPanel';
import CanvasSidebar, { type SidebarPanel } from './components/CanvasSidebar';
import EdgeLayer from './components/EdgeLayer';
import NodeCard from './components/NodeCard';
import NodePalette from './components/NodePalette';
import SelectionToolbar from './components/SelectionToolbar';
import TimelineEditor from './components/TimelineEditor';
import { GRID_SIZE, INITIAL_NODES, NODE_KIND_CONFIG } from './const';
import { useCanvasGraph } from './hooks/use-canvas-graph';
import { useCanvasViewport } from './hooks/use-canvas-viewport';
import { buildScriptGraph } from './services/agent';
import type { CanvasNodeKind, LibraryAsset, PendingConnection } from './types';
import { getFitViewport, isNodeInRect, type Rect, rectFromPoints, screenToWorld } from './utils';

/** 指针拖拽的三种模式，用 ref 存避免每次 move 都触发重渲染。 */
type DragState =
  | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
  | { kind: 'node'; nodeId: string; offsetX: number; offsetY: number }
  | { kind: 'connect'; source: string; sourceOutput: string }
  | { kind: 'marquee'; startX: number; startY: number; additive: boolean }
  | null;

/**
 * 节点面板的锚点，记录要从哪个输出接出去。
 * 卡片上的 ⊕ 和「拉线甩到空白处」共用它。
 */
interface AddPanelAnchor {
  nodeId: string;
  outputId: string;
  /** 屏幕坐标，用于定位浮层。 */
  screenX: number;
  screenY: number;
  /** 世界坐标；由拉线触发时新节点落在这里，⊕ 触发时为空表示挂到来源右侧。 */
  worldX?: number;
  worldY?: number;
}

/** 鼠标中键，用于强制平移。 */
const MIDDLE_BUTTON = 1;

/** 退出画布后回到的落地页。 */
const EXIT_PATH = '/create';

const INITIAL_MESSAGES: AgentMessage[] = [
  { id: 'msg-1', role: 'user', content: 'Build a 15s ad for the hydration serum.' },
  {
    id: 'msg-2',
    role: 'agent',
    content: 'Laid out a Hook → Body → CTA script and wired product, presenter and voiceover nodes into a final cut.'
  },
  { id: 'msg-3', role: 'user', content: 'Split the audio so I can swap the BGM.' },
  {
    id: 'msg-4',
    role: 'agent',
    content: 'Added Split A/V and Split Tracks after the final cut — BGM and two voiceover tracks are separated.'
  }
];

let messageSeq = 0;

function CanvasPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);
  const navigate = useNavigate();

  const {
    nodes,
    edges,
    addNodeAt,
    addConnectedNode,
    addConnectedNodeAt,
    addScriptSections,
    addAssetNode,
    runTool,
    connect,
    connectToBestInput,
    executeNode,
    patchNode,
    moveNode,
    duplicateNode,
    removeNode,
    removeNodes,
    duplicateNodes
  } = useCanvasGraph();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>(null);
  const [addPanelAnchor, setAddPanelAnchor] = useState<AddPanelAnchor | null>(null);
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null);
  const [isAgentOpen, setIsAgentOpen] = useState(true);
  const [isAgentBusy, setIsAgentBusy] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>(INITIAL_MESSAGES);

  const { viewport, setViewport, zoomIn, zoomOut, resetZoom } = useCanvasViewport({ containerRef });

  /** 首次挂载时把示例节点居中，避免用户进来看到空白区域。 */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    setViewport(getFitViewport(INITIAL_NODES, rect.width, rect.height));
  }, [setViewport]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return { x: 0, y: 0 };
      }
      return screenToWorld(clientX - rect.left, clientY - rect.top, viewport);
    },
    [viewport]
  );

  /** 视口中心的世界坐标，新增节点默认落在这里。 */
  const getViewportCenter = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }
    return screenToWorld(rect.width / 2, rect.height / 2, viewport);
  }, [viewport]);

  /**
   * 空白处按下：默认拉框选，按住空格或中键才是平移（与 Figma / Flora 一致）。
   * 触控板双指滚动仍然随时可以平移，见 use-canvas-viewport。
   */
  const handleContainerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    setAddPanelAnchor(null);
    event.currentTarget.setPointerCapture(event.pointerId);

    const wantsPan = isSpaceHeld || event.button === MIDDLE_BUTTON;
    if (wantsPan) {
      dragRef.current = {
        kind: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        originX: viewport.x,
        originY: viewport.y
      };
      setIsPanning(true);
      return;
    }

    const world = toWorld(event.clientX, event.clientY);
    // Shift 表示在已有选区上追加
    dragRef.current = { kind: 'marquee', startX: world.x, startY: world.y, additive: event.shiftKey };
    setMarquee({ x: world.x, y: world.y, width: 0, height: 0 });
    if (!event.shiftKey) {
      setSelectedIds([]);
    }
  };

  const handleNodePointerDown = (event: React.PointerEvent<HTMLDivElement>, nodeId: string) => {
    event.stopPropagation();
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    const world = toWorld(event.clientX, event.clientY);
    dragRef.current = { kind: 'node', nodeId, offsetX: world.x - node.x, offsetY: world.y - node.y };
    setSelectedIds((current) => {
      if (event.shiftKey) {
        return current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId];
      }
      return current.includes(nodeId) ? current : [nodeId];
    });
    containerRef.current?.setPointerCapture(event.pointerId);
  };

  const handleOutputPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    nodeId: string,
    outputId: string
  ) => {
    event.stopPropagation();
    const world = toWorld(event.clientX, event.clientY);
    dragRef.current = { kind: 'connect', source: nodeId, sourceOutput: outputId };
    setPendingConnection({ source: nodeId, sourceOutput: outputId, toX: world.x, toY: world.y });
    containerRef.current?.setPointerCapture(event.pointerId);
  };

  /** 在目标节点的某个输入端口松手即建立连线。 */
  const handleInputPointerUp = (event: React.PointerEvent<HTMLDivElement>, nodeId: string, inputId: string) => {
    const drag = dragRef.current;
    if (drag?.kind !== 'connect') {
      return;
    }
    event.stopPropagation();
    connect(drag.source, drag.sourceOutput, nodeId, inputId);
    dragRef.current = null;
    setPendingConnection(null);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    if (drag.kind === 'pan') {
      setViewport((current) => ({
        ...current,
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY)
      }));
      return;
    }

    const world = toWorld(event.clientX, event.clientY);

    if (drag.kind === 'marquee') {
      setMarquee(rectFromPoints(drag.startX, drag.startY, world.x, world.y));
      return;
    }

    if (drag.kind === 'node') {
      moveNode(drag.nodeId, world.x - drag.offsetX, world.y - drag.offsetY);
      return;
    }

    setPendingConnection({ source: drag.source, sourceOutput: drag.sourceOutput, toX: world.x, toY: world.y });
  };

  /** 在卡片任意位置松手也能完成连线，不必精确命中端口。 */
  const handleDropOnCard = (nodeId: string) => {
    const drag = dragRef.current;
    if (drag?.kind !== 'connect') {
      return;
    }
    connectToBestInput(drag.source, drag.sourceOutput, nodeId);
    dragRef.current = null;
    setPendingConnection(null);
  };

  /**
   * 松手收尾。
   * 若此时还在拉线（说明没落在任何卡片上），就在落点打开节点面板，
   * 选中的节点会直接建在这里并接上来源——Flora 的「甩到空白处」行为。
   */
  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.kind === 'connect') {
      const rect = containerRef.current?.getBoundingClientRect();
      const world = toWorld(event.clientX, event.clientY);
      if (rect) {
        setAddPanelAnchor({
          nodeId: drag.source,
          outputId: drag.sourceOutput,
          screenX: event.clientX - rect.left,
          screenY: event.clientY - rect.top,
          worldX: world.x,
          worldY: world.y
        });
      }
    }
    if (drag?.kind === 'marquee' && marquee) {
      const hit = nodes.filter((node) => isNodeInRect(node, marquee)).map((node) => node.id);
      setSelectedIds((current) => (drag.additive ? [...new Set([...current, ...hit])] : hit));
    }

    dragRef.current = null;
    setIsPanning(false);
    setPendingConnection(null);
    setMarquee(null);
  };

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) {
      return;
    }
    removeNodes(selectedIds);
    setSelectedIds([]);
  }, [removeNodes, selectedIds]);

  const selectAll = useCallback(() => {
    setSelectedIds(nodes.map((node) => node.id));
  }, [nodes]);

  useEffect(() => {
    /** 输入态下不劫持任何快捷键。 */
    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(element && ['INPUT', 'TEXTAREA'].includes(element.tagName));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) {
        return;
      }
      if (event.code === 'Space') {
        // 空格切成平移，避免和框选抢左键
        event.preventDefault();
        setIsSpaceHeld(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAll();
        return;
      }
      if (event.key === 'Escape') {
        setSelectedIds([]);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        deleteSelected();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsSpaceHeld(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [deleteSelected, selectAll]);

  /** 批量另存为模板：目前落在本地，接模板接口后替换。 */
  const saveAsTemplate = useCallback(() => {
    const picked = nodes.filter((node) => selectedIds.includes(node.id));
    // eslint-disable-next-line no-console
    console.info('[canvas] save as template', { nodes: picked.length });
  }, [nodes, selectedIds]);

  const duplicateSelected = useCallback(() => {
    const ids = duplicateNodes(selectedIds);
    if (ids.length > 0) {
      setSelectedIds(ids);
    }
  }, [duplicateNodes, selectedIds]);

  /** 左侧 "+" 面板：在视口中心新增游离节点。 */
  const addNodeFromSidebar = useCallback(
    (kind: CanvasNodeKind) => {
      const center = getViewportCenter();
      setSelectedIds([addNodeAt(kind, center.x, center.y)]);
      setSidebarPanel(null);
    },
    [addNodeAt, getViewportCenter]
  );

  /** 素材库条目落到画布中心。 */
  const pickAsset = useCallback(
    (asset: LibraryAsset) => {
      const center = getViewportCenter();
      setSelectedIds([addAssetNode(asset, center.x, center.y)]);
      setSidebarPanel(null);
    },
    [addAssetNode, getViewportCenter]
  );

  /** 卡片 ⊕ 面板：在来源节点右侧新增并自动连线。 */
  const addNodeFromCard = useCallback(
    (kind: CanvasNodeKind) => {
      if (!addPanelAnchor) {
        return;
      }
      if (addPanelAnchor.worldX === undefined || addPanelAnchor.worldY === undefined) {
        addConnectedNode(addPanelAnchor.nodeId, addPanelAnchor.outputId, kind);
      } else {
        addConnectedNodeAt(
          addPanelAnchor.nodeId,
          addPanelAnchor.outputId,
          kind,
          addPanelAnchor.worldX,
          addPanelAnchor.worldY
        );
      }
      setAddPanelAnchor(null);
    },
    [addConnectedNode, addConnectedNodeAt, addPanelAnchor]
  );

  const openAddPanel = useCallback(
    (nodeId: string, outputId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!node || !rect) {
        return;
      }
      // 面板挂在卡片右侧，换算成容器内的屏幕坐标
      setAddPanelAnchor({
        nodeId,
        outputId,
        screenX: (node.x + node.width) * viewport.zoom + viewport.x + 40,
        screenY: node.y * viewport.zoom + viewport.y
      });
    },
    [nodes, viewport]
  );

  const fitView = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setViewport(getFitViewport(nodes, rect.width, rect.height));
  }, [nodes, setViewport]);

  /** 卡片内编辑 prompt / 文案。 */
  const handleTextChange = useCallback(
    (nodeId: string, text: string) => {
      patchNode(nodeId, { text });
    },
    [patchNode]
  );

  /**
   * Agent 对话：把需求交给平台的脚本模型，产出 Hook → Body → CTA 并直接落到画布上。
   * 失败时把原因作为 agent 回复，不静默吞掉。
   */
  const sendMessage = useCallback(
    async (content: string) => {
      messageSeq += 1;
      const pendingId = `msg-agent-${messageSeq}`;
      setMessages((current) => [
        ...current,
        { id: `msg-user-${messageSeq}`, role: 'user', content },
        { id: pendingId, role: 'agent', content: 'Writing the script…' }
      ]);
      setIsAgentBusy(true);

      const replacePending = (reply: string) => {
        setMessages((current) =>
          current.map((message) => (message.id === pendingId ? { ...message, content: reply } : message))
        );
      };

      try {
        const result = await buildScriptGraph(content);
        if (result.sections.length > 0) {
          const center = getViewportCenter();
          const ids = addScriptSections(result.sections, center.x, center.y);
          setSelectedIds(ids);
        }
        replacePending(result.reply);
      } catch (error) {
        replacePending((error as Error)?.message || 'Something went wrong while building the script.');
      } finally {
        setIsAgentBusy(false);
      }
    },
    [addScriptSections, getViewportCenter]
  );

  /** 正在拉的连线携带的数据类型，卡片据此高亮可接的输入端口。 */
  const connectingType = useMemo(() => {
    if (!pendingConnection) {
      return null;
    }
    const source = nodes.find((node) => node.id === pendingConnection.source);
    if (!source) {
      return null;
    }
    return (
      NODE_KIND_CONFIG[source.kind].outputs.find((port) => port.id === pendingConnection.sourceOutput)?.type ?? null
    );
  }, [nodes, pendingConnection]);

  /** 打开时间线编辑器的节点；只有 Timeline 节点会进这个全屏编辑态。 */
  const editorNode = useMemo(
    () => nodes.find((node) => node.id === editorNodeId && node.kind === 'timeline') ?? null,
    [editorNodeId, nodes]
  );

  /** 点阵背景跟随视口平移和缩放，制造无限画布的感觉。 */
  const gridStyle = useMemo(() => {
    const size = GRID_SIZE * viewport.zoom;
    return {
      // currentColor 取自网格层自身的 text token，避免依赖运行时 CSS 变量名
      backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
      backgroundSize: `${size}px ${size}px`,
      backgroundPosition: `${viewport.x}px ${viewport.y}px`
    };
  }, [viewport]);

  return (
    <div className="relative size-full overflow-hidden bg-neutral-surface1">
      <div
        ref={containerRef}
        className={clsx(
          'absolute inset-0 touch-none',
          pendingConnection
            ? 'cursor-crosshair'
            : isPanning
              ? 'cursor-grabbing'
              : isSpaceHeld
                ? 'cursor-grab'
                : 'cursor-default'
        )}
        onPointerDown={handleContainerPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        data-canvas-surface
      >
        <div className="pointer-events-none absolute inset-0 text-neutral-fillLow" style={gridStyle} />
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0'
          }}
        >
          <EdgeLayer nodes={nodes} edges={edges} selectedIds={selectedIds} pendingConnection={pendingConnection} />
          {marquee ? (
            <div
              className="pointer-events-none absolute border border-solid border-primary-fill bg-primary-fill/10"
              style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
              data-marquee
            />
          ) : null}
          {nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              edges={edges}
              isSelected={selectedIds.includes(node.id)}
              isSoleSelection={selectedIds.length === 1 && selectedIds[0] === node.id}
              isHovered={hoveredNodeId === node.id}
              isConnecting={Boolean(pendingConnection)}
              connectingType={connectingType}
              onHoverChange={setHoveredNodeId}
              onPointerDown={handleNodePointerDown}
              onOutputPointerDown={handleOutputPointerDown}
              onInputPointerUp={handleInputPointerUp}
              onOpenAddPanel={openAddPanel}
              onDropOnCard={handleDropOnCard}
              onOpenEditor={setEditorNodeId}
              onRunTool={runTool}
              onRun={executeNode}
              onTextChange={handleTextChange}
              onDuplicate={duplicateNode}
              onDelete={removeNode}
            />
          ))}
        </div>
      </div>

      {/* 卡片 ⊕ 面板：跟随卡片位置浮在画布之上 */}
      {addPanelAnchor ? (
        <div className="absolute z-30" style={{ left: addPanelAnchor.screenX, top: addPanelAnchor.screenY }}>
          <NodePalette onSelect={addNodeFromCard} />
        </div>
      ) : null}

      <SelectionToolbar
        count={selectedIds.length}
        onSaveAsTemplate={saveAsTemplate}
        onDuplicate={duplicateSelected}
        onSelectAll={selectAll}
        onDelete={deleteSelected}
        onClear={() => setSelectedIds([])}
      />

      {/* 画布内隐藏了全局侧边导航，这里提供唯一的退出入口 */}
      <button
        type="button"
        title="Close canvas"
        onClick={() => navigate(EXIT_PATH)}
        className="absolute left-4 top-4 z-30 flex size-9 items-center justify-center rounded-full border border-solid border-neutral-fillLow bg-neutral-surface text-neutral-mediumOnSurface shadow-[0_1px_3px_rgba(16,24,40,0.10)] transition-colors hover:bg-neutral-surface2"
      >
        <KsIconClose size={18} />
      </button>

      <CanvasSidebar
        zoom={viewport.zoom}
        canDelete={selectedIds.length > 0}
        openPanel={sidebarPanel}
        onTogglePanel={(panel) => setSidebarPanel((current) => (current === panel ? null : panel))}
        onClosePanel={() => setSidebarPanel(null)}
        onAddNode={addNodeFromSidebar}
        onPickAsset={pickAsset}
        onDeleteSelected={deleteSelected}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitView={fitView}
        onResetZoom={resetZoom}
      />

      {editorNode ? (
        <TimelineEditor sourceLabel={editorNode.title} onClose={() => setEditorNodeId(null)} />
      ) : null}

      <AgentPanel
        isOpen={isAgentOpen}
        isBusy={isAgentBusy}
        messages={messages}
        onToggle={() => setIsAgentOpen((open) => !open)}
        onSend={sendMessage}
      />
    </div>
  );
}

export default CanvasPage;
