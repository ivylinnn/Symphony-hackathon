/* eslint-disable max-lines-per-function */
import { useNavigate } from '@edenx/runtime/router';
import { KsIconAiGeneration, KsIconClose, KsIconFolderAdd, KsIconSend } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import AgentPanel, { type AgentMessage } from './components/AgentPanel';
import CanvasSidebar, { type CanvasTool, type SidebarPanel } from './components/CanvasSidebar';
import ContentStrategiesPopover from './components/ContentStrategiesPopover';
import EdgeLayer from './components/EdgeLayer';
import Minimap from './components/Minimap';
import NodeCard from './components/NodeCard';
import NodePalette from './components/NodePalette';
import SelectionToolbar from './components/SelectionToolbar';
import TimelineEditor from './components/TimelineEditor';
import { GRID_SIZE, NODE_KIND_CONFIG } from './const';
import { buildStrategyGraph, type ContentStrategy } from './content-strategies';
import { useCanvasGraph } from './hooks/use-canvas-graph';
import { useCanvasViewport } from './hooks/use-canvas-viewport';
import { buildScriptGraph } from './services/agent';
import type { CanvasNodeKind, LibraryAsset, PendingConnection } from './types';
import { getFitViewport, isNodeInRect, type Rect, rectFromPoints, screenToWorld, worldToScreen } from './utils';

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

/** 画布上的一条评论（世界坐标）。 */
interface CanvasComment {
  id: string;
  x: number;
  y: number;
  text: string;
}

let commentSeq = 0;

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
    addPrebuiltGraph,
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
  // Agent 默认收起为右下角 FAB
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isAgentBusy, setIsAgentBusy] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>(INITIAL_MESSAGES);
  // 画布从空态开始，首屏直接展示内容策略弹层
  const [isStrategiesOpen, setIsStrategiesOpen] = useState(true);
  /** 当前交互工具：V 选择 / H 手型 / 评论。 */
  const [tool, setTool] = useState<CanvasTool>('select');
  const [comments, setComments] = useState<CanvasComment[]>([]);
  /** 评论草稿的世界坐标；非空时显示输入浮层。 */
  const [draftComment, setDraftComment] = useState<{ x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState('');

  const { viewport, setViewport, animateViewportTo, stopAnimation, zoomIn, zoomOut, resetZoom } =
    useCanvasViewport({ containerRef });

  /** 画布被清空（含删光所有节点）时重新展示策略弹层。 */
  useEffect(() => {
    if (nodes.length === 0) {
      setIsStrategiesOpen(true);
    }
  }, [nodes.length]);

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
   * 空白处按下：默认手型拖拽框选节点（与 Flora 一致），选中后可批量编辑/删除。
   * 空格、中键强制平移；触控板双指滚动随时可以平移，见 use-canvas-viewport。
   */
  const handleContainerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // 视口还在缓动时立刻定格，否则框选/拉线的世界坐标会随动画漂移
    stopAnimation();
    setAddPanelAnchor(null);

    // 评论工具：点空白处落一条评论草稿
    if (tool === 'comment' && event.button === 0 && !isSpaceHeld) {
      const world = toWorld(event.clientX, event.clientY);
      setDraftComment({ x: world.x, y: world.y });
      setDraftText('');
      return;
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 部分合成指针事件没有有效 pointerId，放弃捕获不影响拖拽本身
    }

    // 手型工具下左键即平移；空格与中键在任何工具下都强制平移
    const wantsPan = isSpaceHeld || event.button === MIDDLE_BUTTON || tool === 'hand';
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
    stopAnimation();
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
    stopAnimation();
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
      // 工具切换：V 选择，H 手型，C 评论
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key.toLowerCase() === 'v') {
          setTool('select');
          return;
        }
        if (event.key.toLowerCase() === 'h') {
          setTool('hand');
          return;
        }
        if (event.key.toLowerCase() === 'c') {
          setTool('comment');
          return;
        }
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
    animateViewportTo(getFitViewport(nodes, rect.width, rect.height));
  }, [animateViewportTo, nodes]);

  /** 选中一张内容策略：把预置工作流落到画布中心并平滑缩放到全览。 */
  const applyStrategy = useCallback(
    (strategy: ContentStrategy) => {
      const center = getViewportCenter();
      const built = buildStrategyGraph(strategy, center.x, center.y);
      addPrebuiltGraph(built.nodes, built.edges);
      setSelectedIds([]);
      setIsStrategiesOpen(false);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        animateViewportTo(getFitViewport(built.nodes, rect.width, rect.height));
      }
    },
    [addPrebuiltGraph, animateViewportTo, getViewportCenter]
  );

  /** 小地图导航：把点中的世界坐标平移到视口中心，缩放保持不变。 */
  const navigateFromMinimap = useCallback(
    (worldX: number, worldY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setViewport((current) => ({
        ...current,
        x: rect.width / 2 - worldX * current.zoom,
        y: rect.height / 2 - worldY * current.zoom
      }));
    },
    [setViewport]
  );

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

  /** 打开时间线编辑器的节点；Timeline 节点和 Video 节点（Edit CTA）都能进全屏编辑态。 */
  const editorNode = useMemo(
    () => nodes.find((node) => node.id === editorNodeId && (node.kind === 'timeline' || node.kind === 'video')) ?? null,
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
          // 光标跟随工具：选择=箭头，手型=抓手，评论=十字
          pendingConnection
            ? 'cursor-crosshair'
            : isPanning
              ? 'cursor-grabbing'
              : tool === 'hand' || isSpaceHeld
                ? 'cursor-grab'
                : tool === 'comment'
                  ? 'cursor-crosshair'
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

      {/* 评论钉：屏幕坐标渲染，不随缩放变形；悬停展示内容 */}
      {comments.map((comment) => {
        const screen = worldToScreen(comment.x, comment.y, viewport);
        return (
          <div key={comment.id} className="group absolute z-20" style={{ left: screen.x, top: screen.y }}>
            <span className="flex size-7 -translate-y-full items-center justify-center rounded-full rounded-bl-sm border-2 border-solid border-neutral-surface bg-primary-fill text-[11px] font-semibold text-neutral-onFill shadow-[0_4px_12px_rgba(16,24,40,0.24)]">
              S
            </span>
            <div className="pointer-events-none absolute left-8 top-0 hidden w-[200px] -translate-y-full rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface p-2 shadow-[0_10px_30px_rgba(16,24,40,0.16)] group-hover:block">
              <div className="text-[10px] font-semibold text-neutral-highOnSurface">Sherly</div>
              <p className="mt-0.5 text-[11px] leading-[15px] text-neutral-mediumOnSurface">{comment.text}</p>
            </div>
          </div>
        );
      })}

      {/* 评论草稿输入 */}
      {draftComment ? (
        <div
          className="absolute z-40 w-[240px] rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface p-2 shadow-[0_10px_30px_rgba(16,24,40,0.16)]"
          style={{
            left: worldToScreen(draftComment.x, draftComment.y, viewport).x,
            top: worldToScreen(draftComment.x, draftComment.y, viewport).y
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <textarea
            value={draftText}
            rows={2}
            autoFocus
            placeholder="Leave a comment…"
            onChange={(event) => setDraftText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setDraftComment(null);
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (draftText.trim()) {
                  commentSeq += 1;
                  setComments((current) => [
                    ...current,
                    { id: `comment-${commentSeq}`, x: draftComment.x, y: draftComment.y, text: draftText.trim() }
                  ]);
                }
                setDraftComment(null);
              }
            }}
            className="w-full resize-none rounded-lg bg-neutral-surface1 px-2 py-1.5 text-[12px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setDraftComment(null)}
              className="h-6 rounded-full px-2 text-[11px] font-medium text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draftText.trim()}
              onClick={() => {
                commentSeq += 1;
                setComments((current) => [
                  ...current,
                  { id: `comment-${commentSeq}`, x: draftComment.x, y: draftComment.y, text: draftText.trim() }
                ]);
                setDraftComment(null);
              }}
              className={clsx(
                'h-6 rounded-full px-2.5 text-[11px] font-medium transition-colors',
                draftText.trim()
                  ? 'bg-primary-fill text-neutral-onFill hover:opacity-90'
                  : 'cursor-not-allowed bg-neutral-surface2 text-neutral-lowOnSurface'
              )}
            >
              Comment
            </button>
          </div>
        </div>
      ) : null}

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

      {/* 顶部操作区：策略弹层入口 + 保存/分享；Agent 面板展开时向左让位；选中态让位给顶部操作条 */}
      {selectedIds.length === 0 ? (
        // Agent 面板已固定在右下角，顶部操作区始终贴右
        <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
          <button
            type="button"
            title="TikTok Content Strategies"
            onClick={() => setIsStrategiesOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-full border border-solid border-neutral-fillLow bg-neutral-surface px-3.5 text-[12px] font-medium text-neutral-highOnSurface shadow-[0_1px_3px_rgba(16,24,40,0.10)] transition-colors hover:bg-neutral-surface2"
          >
            <KsIconAiGeneration size={14} />
            TikTok Content Strategies
          </button>
          <button
            type="button"
            title="Save this workflow as a content strategy"
            onClick={() => {
              // eslint-disable-next-line no-console
              console.info('[canvas] save strategy', { nodes: nodes.length });
            }}
            className="flex h-9 items-center gap-1.5 rounded-full border border-solid border-neutral-fillLow bg-neutral-surface px-3.5 text-[12px] font-medium text-neutral-highOnSurface shadow-[0_1px_3px_rgba(16,24,40,0.10)] transition-colors hover:bg-neutral-surface2"
          >
            <KsIconFolderAdd size={14} />
            Save strategy
          </button>
          <button
            type="button"
            title="Share this workflow"
            onClick={() => {
              // eslint-disable-next-line no-console
              console.info('[canvas] share workflow');
            }}
            className="flex h-9 items-center gap-1.5 rounded-full border border-solid border-neutral-fillLow bg-neutral-surface px-3.5 text-[12px] font-medium text-neutral-highOnSurface shadow-[0_1px_3px_rgba(16,24,40,0.10)] transition-colors hover:bg-neutral-surface2"
          >
            <KsIconSend size={14} />
            Share
          </button>
        </div>
      ) : null}

      <CanvasSidebar
        zoom={viewport.zoom}
        canDelete={selectedIds.length > 0}
        tool={tool}
        onSelectTool={setTool}
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

      <Minimap
        nodes={nodes}
        viewport={viewport}
        containerRef={containerRef}
        isAgentOpen={isAgentOpen}
        onNavigate={navigateFromMinimap}
      />

      {isStrategiesOpen ? (
        <ContentStrategiesPopover onPick={applyStrategy} onClose={() => setIsStrategiesOpen(false)} />
      ) : null}

      {editorNode ? (
        <TimelineEditor
          sourceLabel={editorNode.title}
          videoUrl={editorNode.videoUrl}
          posterUrl={editorNode.assetUrl}
          onClose={() => setEditorNodeId(null)}
        />
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
