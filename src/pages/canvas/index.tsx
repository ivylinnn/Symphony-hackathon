/* eslint-disable max-lines-per-function */
import { useNavigate } from '@edenx/runtime/router';
import { KsIconAiGeneration, KsIconClose, KsIconFolderAdd, KsIconPlus, KsIconSend } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import AgentPanel, { type AgentMessage } from './components/AgentPanel';
import CanvasComposer from './components/CanvasComposer';
import CanvasSidebar, { type CanvasTool, type SidebarPanel } from './components/CanvasSidebar';
import ContentStrategiesPopover from './components/ContentStrategiesPopover';
import EdgeLayer from './components/EdgeLayer';
import Minimap from './components/Minimap';
import NodeCard from './components/NodeCard';
import NodePalette from './components/NodePalette';
import SelectionToolbar from './components/SelectionToolbar';
import NodeEditDock, { EDIT_DOCK_BOTTOM_H, EDIT_DOCK_RIGHT_W, SELLING_POINT_VIDEO_URL } from './components/NodeEditDock';
import {
  AUDIO_CLIPS_WIDTH,
  GRID_SIZE,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  NODE_DEFAULT_WIDTH,
  NODE_KIND_CONFIG,
  PRODUCT_BRIEF_HEIGHT,
  STORYBOARD_READY_HEIGHT,
  STORYBOARD_READY_WIDTH,
  STRATEGY_VARY_EXTRA,
  VARIATION_PLANNER_EXTRA,
  VARIATION_SET_EXPANDED_HEIGHT,
  VARIATION_SET_EXPANDED_WIDTH,
  VARIATION_SET_HEIGHT,
  VARIATION_SET_WIDTH,
  VIDEO_READY_HEIGHT,
  VIDEO_READY_WIDTH
} from './const';
import { CONTENT_STRATEGIES, buildStrategyGraph, type ContentStrategy } from './content-strategies';
import { appendEdge, buildNode, buildSeedGraph } from './graph-ops';
import { useCanvasGraph } from './hooks/use-canvas-graph';
import { useCanvasViewport } from './hooks/use-canvas-viewport';
import { buildScriptGraph } from './services/agent';
import type { CanvasEdge, CanvasNode, CanvasNodeKind, LibraryAsset, PendingConnection, VariationEvent, VariationSpec, Viewport } from './types';
import {
  getFitViewport,
  getFocusNodeViewport,
  getNodeHeight,
  isNodeInRect,
  type Rect,
  rectFromPoints,
  screenToWorld,
  worldToScreen
} from './utils';
import {
  DEFAULT_VARIATION_PLAN,
  buildControlledVariations,
  buildQuickExploreVariations,
  buildStrategyNodes,
  buildStrategyVariations,
  buildVariationSetNode
} from './variation-plans';

/** 指针拖拽的三种模式，用 ref 存避免每次 move 都触发重渲染。 */
type DragState =
  | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
  | { kind: 'node'; nodeId: string; offsetX: number; offsetY: number }
  | { kind: 'connect'; source: string; sourceOutput: string }
  | { kind: 'marquee'; startX: number; startY: number; additive: boolean }
  // 拖右下角改尺寸：记下起手时的世界坐标与原始宽高，move 时按位移量增减
  | { kind: 'resize'; nodeId: string; startX: number; startY: number; startWidth: number; startHeight: number }
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
  /** 多选后共用一个 ⊕ 时，这里放全部选中节点的 id；新节点会把它们都连过去。 */
  nodeIds?: string[];
}

/** 鼠标中键，用于强制平移。 */
const MIDDLE_BUTTON = 1;

/** 编辑模式聚焦节点时四周留的余量，比 fit-view 更贴近一些。 */
const EDIT_FOCUS_PADDING = 48;

/** Composer 提交 → 节点落画布之间的加载过场时长（毫秒）。 */
const LANDING_LOADING_MS = 3000;

/** 退出编辑模式的滑出动画时长（毫秒），与 dock-out 关键帧一致。 */
const EDIT_EXIT_MS = 320;

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

/** 会话从空开始，第一条消息由用户提交产品图时产生。 */
const INITIAL_MESSAGES: AgentMessage[] = [];

/** 生成 product brief 的等待时长。 */
const BRIEF_GENERATING_MS = 3000;

/** brief 气泡下方的三个后续动作，第一个是主按钮。 */
const BRIEF_ACTIONS = [
  'Looks good, add a product node!',
  'Revise the product description',
  'Adjust the core selling points'
];

/** 纯文本版 product brief，直接放进 agent 气泡。 */
const PRODUCT_BRIEF_TEXT = [
  'Product name',
  'Short-Sleeve Hoodie',
  '',
  'Product description',
  'This versatile, modern short-sleeve hoodie is perfect for warm-weather layering, gym wear, or casual lounging. Featuring a breathable construction, a comfortable hood, and a functional front kangaroo pocket, it offers a relaxed fit for active lifestyles. Simply pull it over your head for an easy, stylish transition into any seasonal outfit.',
  '',
  'Core selling point: Breathable fabric, Versatile layering, Functional kangaroo pocket, Relaxed comfortable fit, Ideal for active and everyday wear',
  '',
  'Brand name: N/A',
  'Region: United States',
  'Language: English',
  'Brand tone: Tell us via chat (optional).',
  '',
  'Target audience',
  'Active individuals and fashion-conscious consumers looking for comfortable, modern casual wear.',
  '',
  'Additional requests',
  'Create an ad for the product using media assets @Image 1, @Image 2, @Image 3 inspired by template ID 7653898416390045703.'
].join('\n');

/** brief 落到画布后，agent 追问是否继续生成脚本三件套。 */
const SCRIPT_OFFER_QUESTION =
  'Would you like me to generate a TikTok-native Hook, Body, CTA, and pick a suggested trend?';
const SCRIPT_OFFER_ACTIONS = ['Yes, please.', 'No, thanks'];

/** 选中 Hook/Body/CTA/Trend 四件套后，agent 追问是否继续生成分镜。 */
const STORYBOARD_OFFER_QUESTION =
  'Would you prefer me to generate a storyboard based on those Hook, Body, CTA, and TikTok trend?';
const STORYBOARD_OFFER_ACTIONS = ['Yes, please.', 'No, thanks'];

/** 组成一套「脚本四件套」的节点类型。 */
const SCRIPT_KINDS = ['hook', 'body', 'cta', 'tiktok-trend'] as const;

/** 汇聚型节点：画布上同一时间只应该有一个，多个来源都接到这一个上面。 */
const HUB_KINDS = ['storyboard', 'audio-clips'] as const;

/** 这几类「生成」节点都是 demo：本地模拟一段等待再落固定产物，不真打生成接口。 */
const DEMO_GENERATING_MS = 3000;
const CLIP_DEMO_VIDEO_URL = '/hoodie-ad.mp4';

/** 提交产品图时写进会话的第一条用户消息。 */
const OPENING_PROMPT =
  'Generate a 30-second TikTok ad for an olive green short-sleeve hoodie featuring a skater in a sun-drenched LA alleyway, using a gritty 90s fisheye aesthetic, high-energy action shots (kickflips, rail grinds, wall rides), and punchy VO highlighting versatile everyday street style.';

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
    addConnectedNodesAt,
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
  /** 内联编辑模式：正在编辑的节点 + 随入口带上的第一条 agent 指令。 */
  const [editDock, setEditDock] = useState<{ nodeId: string; prompt?: string } | null>(null);
  /** Creative agent 确认的卖点，交给时间线坞落成图形轨 callout。 */
  const [editSellingPoints, setEditSellingPoints] = useState<string[]>([]);
  /** Creative agent 贴的品牌片尾卡。 */
  const [editEndCardUrl, setEditEndCardUrl] = useState<string | null>(null);
  /** Creative agent 落的促销文案。 */
  const [editPromotion, setEditPromotion] = useState<string | null>(null);
  /** 退出编辑模式的过场：坞和面板先滑出，动画结束再卸载。 */
  const [isEditClosing, setIsEditClosing] = useState(false);
  // Agent 默认收起为右下角 FAB
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isAgentBusy, setIsAgentBusy] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>(INITIAL_MESSAGES);
  // 模板弹层由空态 composer 的第一个入口或右上角按钮唤起
  const [isStrategiesOpen, setIsStrategiesOpen] = useState(false);
  /** 生成 brief 时落下的两个输入节点 id，确认后用来接 Product brief。 */
  const briefInputIdsRef = useRef<string[]>([]);
  /** 已落地的 Product brief 节点，用于继续挂 Hook / Body / CTA。 */
  const briefNodeIdRef = useRef<string | null>(null);
  /** 「选中四件套」是否已经问过一次；选区变化时复位，避免重复追问。 */
  const scriptSelectionAskedRef = useRef(false);
  /** 四件套选中时浮出的「+」，点开的节点面板锚点。 */
  const [scriptAddAnchor, setScriptAddAnchor] = useState<{ x: number; y: number } | null>(null);
  /** 当前交互工具：V 选择 / H 手型 / 评论。 */
  const [tool, setTool] = useState<CanvasTool>('select');
  const [comments, setComments] = useState<CanvasComment[]>([]);
  /** 评论草稿的世界坐标；非空时显示输入浮层。 */
  const [draftComment, setDraftComment] = useState<{ x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState('');

  const { viewport, setViewport, animateViewportTo, stopAnimation, zoomIn, zoomOut, resetZoom } =
    useCanvasViewport({ containerRef });

  /** 进入编辑模式前的视口，退出时把镜头拉回去。 */
  const preEditViewportRef = useRef<Viewport | null>(null);

  /**
   * 进入内联编辑模式：镜头推近节点，同时右侧 agent 坞和底部时间线坞滑入。
   * 聚焦视口按「容器扣掉两个坞」的剩余区域计算，节点正好停在预览位。
   */
  const enterEditMode = useCallback(
    (nodeId: string, launch?: { prompt?: string; draw?: boolean }) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node || (node.kind !== 'timeline' && node.kind !== 'video')) {
        return;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        preEditViewportRef.current = viewport;
        animateViewportTo(
          getFocusNodeViewport(node, rect.width - EDIT_DOCK_RIGHT_W, rect.height - EDIT_DOCK_BOTTOM_H, EDIT_FOCUS_PADDING)
        );
      }
      // 圈选入口暂时并入 agent 指令，等画笔搬进画布后再还原
      const prompt = launch?.prompt ?? (launch?.draw ? 'Select an area of the frame to modify' : undefined);
      setEditDock({ nodeId, prompt });
      setEditSellingPoints([]);
      setEditEndCardUrl(null);
      setEditPromotion(null);
      // 剪辑步骤强制展开 Creative agent，剪辑对话就在这一个面板里
      setIsAgentOpen(true);
    },
    [animateViewportTo, nodes, viewport]
  );

  /**
   * 退出编辑模式：镜头先拉回进入前的视口，时间线和 agent 面板同步滑出，
   * 动画结束后才卸载并把面板收成悬浮球。
   */
  const exitEditMode = useCallback(() => {
    if (isEditClosing) {
      return;
    }
    setIsEditClosing(true);
    if (preEditViewportRef.current) {
      animateViewportTo(preEditViewportRef.current);
      preEditViewportRef.current = null;
    }
    window.setTimeout(() => {
      setIsEditClosing(false);
      setEditDock(null);
      setEditSellingPoints([]);
      setEditEndCardUrl(null);
      setEditPromotion(null);
      setIsAgentOpen(false);
    }, EDIT_EXIT_MS);
  }, [animateViewportTo, isEditClosing]);

  /** 空画布直接展示 composer；有节点后自动让位。 */
  const isCanvasEmpty = nodes.length === 0;
  /** Composer 提交后的过场：3 秒加载动画，然后节点才落画布。 */
  const [isLandingLoading, setIsLandingLoading] = useState(false);

  /**
   * Composer 提交（带产品图 / product brief）：先播 3 秒加载过场，
   * 再落产品源工作流（产品图 + 品牌资产 → Product brief），镜头框住它。
   */
  const landProductWorkflow = useCallback(() => {
    setIsLandingLoading(true);
    window.setTimeout(() => {
      setIsLandingLoading(false);
      const seed = buildSeedGraph();
      addPrebuiltGraph(seed.nodes, seed.edges);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        animateViewportTo(getFitViewport(seed.nodes, rect.width, rect.height));
      }
    }, LANDING_LOADING_MS);
  }, [addPrebuiltGraph, animateViewportTo]);

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

  /** 右下角把手按下：进入缩放模式，记录起手世界坐标与当前宽高。 */
  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>, nodeId: string) => {
    event.stopPropagation();
    stopAnimation();
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    const world = toWorld(event.clientX, event.clientY);
    dragRef.current = {
      kind: 'resize',
      nodeId,
      startX: world.x,
      startY: world.y,
      startWidth: node.width,
      startHeight: getNodeHeight(node)
    };
    setSelectedIds([nodeId]);
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

    if (drag.kind === 'resize') {
      // 位移量按世界坐标算，缩放下拖拽手感一致
      patchNode(drag.nodeId, {
        width: Math.max(MIN_NODE_WIDTH, drag.startWidth + (world.x - drag.startX)),
        height: Math.max(MIN_NODE_HEIGHT, drag.startHeight + (world.y - drag.startY))
      });
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

  /** 某个来源节点自己的最后一个输出口 id，多选场景下每个来源各用各的。 */
  const lastOutputIdFor = useCallback(
    (node: CanvasNode) => {
      const outputs = NODE_KIND_CONFIG[node.kind].outputs;
      return outputs[outputs.length - 1]?.id ?? 'out';
    },
    []
  );

  /** 卡片 ⊕ 面板：在来源节点右侧新增并自动连线；多选时新节点会接上每一个选中节点。 */
  const addNodeFromCard = useCallback(
    (kind: CanvasNodeKind) => {
      if (!addPanelAnchor) {
        return;
      }
      const sourceIds =
        addPanelAnchor.nodeIds && addPanelAnchor.nodeIds.length > 0 ? addPanelAnchor.nodeIds : [addPanelAnchor.nodeId];

      // Storyboard / Audio Clips 是汇聚型节点：画布上已有一个时，接线接到它上面，
      // 而不是每次都新建一份——比如 Brief 和 Trend 应该喂给同一个 Storyboard。
      const existingHub =
        HUB_KINDS.includes(kind as (typeof HUB_KINDS)[number])
          ? nodes.find((node) => node.kind === kind)
          : undefined;

      if (existingHub) {
        sourceIds.forEach((sourceId) => {
          const source = nodes.find((node) => node.id === sourceId);
          const sourceOutput =
            sourceId === addPanelAnchor.nodeId && sourceIds.length === 1
              ? addPanelAnchor.outputId
              : source
                ? lastOutputIdFor(source)
                : addPanelAnchor.outputId;
          connectToBestInput(sourceId, sourceOutput, existingHub.id);
        });
      } else if (sourceIds.length > 1) {
        addConnectedNodesAt(
          sourceIds,
          kind,
          addPanelAnchor.worldX ?? 0,
          addPanelAnchor.worldY ?? 0
        );
      } else if (addPanelAnchor.worldX === undefined || addPanelAnchor.worldY === undefined) {
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
    [addConnectedNode, addConnectedNodeAt, addConnectedNodesAt, addPanelAnchor, connectToBestInput, lastOutputIdFor, nodes]
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

  /** 多选后共用的 ⊕：挂在所有选中节点包围盒的右侧、垂直居中。 */
  const openMultiAddPanel = useCallback(() => {
    const picked = nodes.filter((node) => selectedIds.includes(node.id));
    if (picked.length < 2) {
      return;
    }
    const right = Math.max(...picked.map((node) => node.x + node.width));
    const top = Math.min(...picked.map((node) => node.y));
    const bottom = Math.max(...picked.map((node) => node.y + getNodeHeight(node)));
    const centerY = (top + bottom) / 2;
    // 新节点落点：包围盒右侧留一段间距，再加上新卡片自身半宽让它居中在这条线上
    const worldX = right + 120 + NODE_DEFAULT_WIDTH / 2;

    setAddPanelAnchor({
      nodeId: picked[0].id,
      nodeIds: picked.map((node) => node.id),
      outputId: lastOutputIdFor(picked[0]),
      screenX: right * viewport.zoom + viewport.x + 40,
      screenY: centerY * viewport.zoom + viewport.y,
      worldX,
      worldY: centerY
    });
  }, [lastOutputIdFor, nodes, selectedIds, viewport]);

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

  /**
   * 提交产品图：画布上只落 Product images 与 Brand kit，
   * 右下角 agent 展开，生成 5 秒后以纯文本给出 product brief。
   */
  const generateBrief = useCallback(() => {
    const center = getViewportCenter();
    const productImages = buildNode('product-images', center.x - 520, center.y - 340, 'Product images');
    const brandKit = buildNode('brand-kit', center.x - 520, center.y + 20, 'Brand kit');
    briefInputIdsRef.current = [productImages.id, brandKit.id];
    addPrebuiltGraph([productImages, brandKit], []);

    setIsAgentOpen(true);
    setIsAgentBusy(true);
    messageSeq += 1;
    const pendingId = `msg-brief-${messageSeq}`;
    setMessages((current) => [
      ...current,
      { id: `msg-user-${messageSeq}`, role: 'user', content: OPENING_PROMPT },
      { id: pendingId, role: 'agent', content: 'Reading your product images — drafting the product brief…' }
    ]);

    window.setTimeout(() => {
      setMessages((current) =>
        current.map((message) =>
          message.id === pendingId ? { ...message, content: PRODUCT_BRIEF_TEXT, actions: BRIEF_ACTIONS, variant: 'brief' as const } : message
        )
      );
      setIsAgentBusy(false);
    }, BRIEF_GENERATING_MS);
  }, [addPrebuiltGraph, getViewportCenter]);

  /** brief 确认：把 Product brief 节点接到 Product images / Brand kit 右侧。 */
  /** 「Looks good, create the storyboard!」：brief 和 storyboard 一起落地，brief 的产出直接接到分镜的 Script 口。 */
  /** 「Looks good, add a product node!」：只落 Product brief，接到 Product images / Brand kit 上。 */
  const confirmBrief = useCallback(() => {
    const [imagesId, brandKitId] = briefInputIdsRef.current;
    const source = nodes.find((node) => node.id === imagesId);
    const briefNode = {
      ...buildNode('product-brief', (source?.x ?? 0) + 520, (source?.y ?? 0) + 120, 'Product brief'),
      width: 340,
      height: 560
    };

    addPrebuiltGraph(
      [briefNode],
      [imagesId, brandKitId].filter(Boolean).map((from, index) => ({
        id: `edge-brief-${Date.now()}-${index}`,
        source: from,
        sourceOutput: 'out',
        target: briefNode.id,
        targetInput: 'image'
      }))
    );
    briefNodeIdRef.current = briefNode.id;
    setSelectedIds([briefNode.id]);

    // 动作用过即收起，避免重复触发
    setMessages((current) => current.map((message) => ({ ...message, actions: undefined })));
  }, [addPrebuiltGraph, nodes]);

  /** 接受追问：落 Hook / Body / CTA / Trend，并把 Brief 接到三段脚本上。 */
  const generateScriptNodes = useCallback(() => {
    const briefId = briefNodeIdRef.current;
    const brief = nodes.find((node) => node.id === briefId);
    const columnX = (brief?.x ?? 0) + 460;
    const baseY = (brief?.y ?? 0) - 200;

    const hook = {
      ...buildNode('hook', columnX, baseY, 'Hook'),
      text: 'Upgrade your streetwear game with the ultimate modern layer. Too warm for a jacket, too cool for just a tee?',
      assetUrl: '/ad-hook.png',
      status: 'done' as const
    };
    const body = {
      ...buildNode('body', columnX, baseY + 700, 'Body'),
      text:
        '• Active Comfort: Designed with breathable fabric and a relaxed fit, giving you total freedom of movement whether you’re hitting the streets or lounging.\n\n' +
        '• Versatile Style: Seamlessly transitions into any seasonal outfit — featuring a stylish hood and a functional front kangaroo pocket for your everyday essentials.',
      assetUrl: '/ad-body.png',
      status: 'done' as const
    };
    const cta = {
      ...buildNode('cta', columnX, baseY + 1400, 'CTA'),
      text: 'Shop Now & Upgrade Your Style!',
      assetUrl: '/ad-cta.png',
      status: 'done' as const
    };
    // agent 承诺过「and pick a suggested trend」，这里直接给出建议趋势，而不是空态
    const trend = {
      ...buildNode('tiktok-trend', columnX, baseY + 2100, 'TikTok trend'),
      width: 264,
      trendId: 'matching-tracksuits'
    };

    addPrebuiltGraph(
      [hook, body, cta, trend],
      briefId
        ? [hook, body, cta].map((target, index) => ({
            id: `edge-script-${Date.now()}-${index}`,
            source: briefId,
            sourceOutput: 'out',
            target: target.id,
            targetInput: 'prompt'
          }))
        : []
    );
    setMessages((current) => current.map((message) => ({ ...message, actions: undefined })));
  }, [addPrebuiltGraph, nodes]);

  /** 当前选区是否恰好是一套「Hook + Body + CTA + TikTok trend」，且分镜还没生成过。 */
  const scriptSelectionNodes = useMemo(() => {
    if (selectedIds.length !== SCRIPT_KINDS.length) {
      return null;
    }
    const picked = selectedIds.map((id) => nodes.find((node) => node.id === id)).filter(Boolean) as CanvasNode[];
    if (picked.length !== SCRIPT_KINDS.length) {
      return null;
    }
    const kinds = picked.map((node) => node.kind).sort();
    const wanted = [...SCRIPT_KINDS].sort();
    if (kinds.join(',') !== wanted.join(',')) {
      return null;
    }
    if (nodes.some((node) => node.kind === 'storyboard')) {
      return null;
    }
    return picked;
  }, [nodes, selectedIds]);

  /** 选区一旦命中四件套就追问一次；选区变化后复位，允许下次重新触发。 */
  useEffect(() => {
    if (!scriptSelectionNodes) {
      scriptSelectionAskedRef.current = false;
      return;
    }
    if (scriptSelectionAskedRef.current) {
      return;
    }
    scriptSelectionAskedRef.current = true;
    setIsAgentOpen(true);
    messageSeq += 1;
    setMessages((current) => [
      ...current,
      {
        id: `msg-storyboard-offer-${messageSeq}`,
        role: 'agent',
        content: STORYBOARD_OFFER_QUESTION,
        actions: STORYBOARD_OFFER_ACTIONS
      }
    ]);
  }, [scriptSelectionNodes]);

  /** 落 Storyboard + Audio Clips，接上 Hook/Body/CTA 的文案、Trend 的视频，以及 Brief 的配音输入。 */
  const generateStoryboardAndAudio = useCallback(() => {
    const hook = nodes.find((node) => node.kind === 'hook');
    const body = nodes.find((node) => node.kind === 'body');
    const cta = nodes.find((node) => node.kind === 'cta');
    const trend = nodes.find((node) => node.kind === 'tiktok-trend');
    const anchor = hook ?? body ?? cta ?? trend;
    if (!anchor) {
      return;
    }

    const columnX = anchor.x + 460;
    const storyboard = {
      ...buildNode('storyboard', columnX, anchor.y, 'Storyboard'),
      width: 1000,
      height: 1250,
      storyboardReady: true
    };
    const audio = {
      ...buildNode('audio-clips', columnX, storyboard.y + 1350, 'Audio Clips Generation'),
      width: 1000
    };

    const edges = [
      ...[hook, body, cta]
        .filter((node): node is CanvasNode => Boolean(node))
        .map((node, index) => ({
          id: `edge-storyboard-${Date.now()}-${index}`,
          source: node.id,
          sourceOutput: 'out',
          target: storyboard.id,
          targetInput: 'prompt'
        })),
      ...(trend
        ? [
            {
              id: `edge-storyboard-trend-${Date.now()}`,
              source: trend.id,
              sourceOutput: 'out',
              target: storyboard.id,
              targetInput: 'video'
            }
          ]
        : []),
      ...(briefNodeIdRef.current
        ? [
            {
              id: `edge-storyboard-audio-${Date.now()}`,
              source: briefNodeIdRef.current,
              sourceOutput: 'out',
              target: audio.id,
              targetInput: 'prompt'
            }
          ]
        : [])
    ];

    addPrebuiltGraph([storyboard, audio], edges);
    setSelectedIds([storyboard.id]);
    setScriptAddAnchor(null);
    setMessages((current) => current.map((message) => ({ ...message, actions: undefined })));
  }, [addPrebuiltGraph, nodes]);

  /** 四件套选中时，「+」浮标要贴的世界/屏幕坐标（右边缘垂直居中）。 */
  const scriptSelectionPlusPos = useMemo(() => {
    if (!scriptSelectionNodes) {
      return null;
    }
    const right = Math.max(...scriptSelectionNodes.map((node) => node.x + node.width));
    const top = Math.min(...scriptSelectionNodes.map((node) => node.y));
    const bottom = Math.max(...scriptSelectionNodes.map((node) => node.y + getNodeHeight(node)));
    return worldToScreen(right, (top + bottom) / 2, viewport);
  }, [scriptSelectionNodes, viewport]);

  /** agent 气泡下方的后续动作。 */
  const handleAgentAction = useCallback(
    (label: string) => {
      if (label === BRIEF_ACTIONS[0]) {
        confirmBrief();
        return;
      }
      if (label === SCRIPT_OFFER_ACTIONS[0]) {
        generateScriptNodes();
        return;
      }
      if (label === SCRIPT_OFFER_ACTIONS[1]) {
        setMessages((current) => current.map((message) => ({ ...message, actions: undefined })));
        return;
      }
      if (label === STORYBOARD_OFFER_ACTIONS[0]) {
        generateStoryboardAndAudio();
        return;
      }
      if (label === STORYBOARD_OFFER_ACTIONS[1]) {
        setMessages((current) => current.map((message) => ({ ...message, actions: undefined })));
        return;
      }
      // eslint-disable-next-line no-console
      console.info('[canvas] brief follow-up', label);
    },
    [confirmBrief, generateScriptNodes, generateStoryboardAndAudio]
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
   * Storyboard 触发生成：卡片内输入框回车/点生成图标，和卡片通用的运行按钮，都走这一条。
   * 全程本地模拟（不打真实生成接口），保证 outcome 永远是落满 6 帧、不会撞上「没接后端」的报错。
   */
  const handleStoryboardGenerate = useCallback(
    (nodeId: string, text?: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node || node.kind !== 'storyboard' || node.storyboardReady || node.status === 'generating') {
        return;
      }
      patchNode(nodeId, { status: 'generating', error: undefined, ...(text !== undefined ? { text } : {}) });
      window.setTimeout(() => {
        patchNode(nodeId, {
          status: 'done',
          storyboardReady: true,
          width: STORYBOARD_READY_WIDTH,
          height: STORYBOARD_READY_HEIGHT
        });
      }, DEMO_GENERATING_MS);
    },
    [nodes, patchNode]
  );

  /**
   * operation 类节点敲回车/点运行。
   * Split A/V 是一次性的：抽完音轨它就功成身退——Audio Clips Generation 顶替它的位置、
   * 接手它的上游连线，然后把 Split A/V 从画布上撤掉。
   */
  const handleOperationGenerate = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (node?.kind !== 'split-av') {
        executeNode(nodeId);
        return;
      }

      const upstream = edges.filter((edge) => edge.target === nodeId);
      const existingHub = nodes.find((item) => item.kind === 'audio-clips');
      if (existingHub) {
        upstream.forEach((edge) => connectToBestInput(edge.source, edge.sourceOutput, existingHub.id));
      } else {
        const audioNode = { ...buildNode('audio-clips', node.x, node.y), width: AUDIO_CLIPS_WIDTH };
        addPrebuiltGraph(
          [audioNode],
          upstream.map((edge, index) => ({
            id: `edge-audio-${Date.now()}-${index}`,
            source: edge.source,
            sourceOutput: edge.sourceOutput,
            target: audioNode.id,
            targetInput: 'prompt'
          }))
        );
        setSelectedIds([audioNode.id]);
      }
      removeNode(nodeId);
    },
    [addPrebuiltGraph, connectToBestInput, edges, executeNode, nodes, removeNode]
  );

  /**
   * 视频卡中央的 Refine：从这条成片长出下游精修工作流。
   * 分镜节点带满内容落地，配音和成片节点保持默认空态等用户触发。
   */
  const handleRefine = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) {
        return;
      }
      const baseX = node.x + node.width + 160;
      const baseY = node.y - 200;
      const storyboard = {
        ...buildNode('storyboard', baseX, baseY, 'Storyboard'),
        width: STORYBOARD_READY_WIDTH,
        height: STORYBOARD_READY_HEIGHT,
        storyboardReady: true,
        status: 'done' as const
      };
      const audioClips = { ...buildNode('audio-clips', baseX, baseY + STORYBOARD_READY_HEIGHT + 80), width: AUDIO_CLIPS_WIDTH };
      const finalVideo = buildNode('video', baseX + STORYBOARD_READY_WIDTH + 160, baseY + 420, 'Refined cut');

      let refineEdges: CanvasEdge[] = [];
      refineEdges = appendEdge(refineEdges, nodeId, 'out', storyboard.id, 'video');
      refineEdges = appendEdge(refineEdges, storyboard.id, 'out', audioClips.id, 'prompt');
      refineEdges = appendEdge(refineEdges, storyboard.id, 'out', finalVideo.id, 'prompt');
      refineEdges = appendEdge(refineEdges, audioClips.id, 'out', finalVideo.id, 'audio');

      addPrebuiltGraph([storyboard, audioClips, finalVideo], refineEdges);
      setSelectedIds([storyboard.id, audioClips.id, finalVideo.id]);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        animateViewportTo(getFitViewport([node, storyboard, audioClips, finalVideo], rect.width, rect.height));
      }
    },
    [addPrebuiltGraph, animateViewportTo, nodes]
  );

  /** Audio Clips 空态点「Generate audio」：跑一段生成态，再展开完整配音面板。 */
  const handleAudioGenerate = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node || node.kind !== 'audio-clips' || node.audioReady || node.status === 'generating') {
        return;
      }
      patchNode(nodeId, { status: 'generating', error: undefined });
      window.setTimeout(() => {
        patchNode(nodeId, { status: 'done', audioReady: true });
      }, DEMO_GENERATING_MS);
    },
    [nodes, patchNode]
  );

  /** 变体集落地：生成中的容器先上画布，延时后把变体卡 patch 进去。 */
  const spawnVariationSet = useCallback(
    (source: CanvasNode, title: string, specs: VariationSpec[], vary: string[], offsetY = 0) => {
      const plan = source.variationPlan ?? DEFAULT_VARIATION_PLAN;
      const setNode = buildVariationSetNode(source, title, plan, vary);
      setNode.y += offsetY;
      addPrebuiltGraph([setNode], appendEdge([], source.id, 'out', setNode.id, 'prompt'));
      setSelectedIds([setNode.id]);
      window.setTimeout(() => {
        patchNode(setNode.id, { status: 'done', variations: specs });
      }, DEMO_GENERATING_MS);
    },
    [addPrebuiltGraph, patchNode]
  );

  /** 把一条变体落成画布上真正的 video 节点：方向对应的成片当视频，缩略图当封面。 */
  const materializeVariation = useCallback(
    (setNode: CanvasNode, spec: VariationSpec, index: number, count: number): CanvasNode => {
      // 带成片的卡要按 9:16 视频撑高，否则用媒体卡默认尺寸
      const videoHeight = Math.round(12 + ((NODE_DEFAULT_WIDTH - 24) * 16) / 9 + 8 + 24 + 36);
      const rowGap = spec.videoUrl ? videoHeight + 44 : 330;
      return {
        ...buildNode(
          'video',
          setNode.x + setNode.width + 140,
          setNode.y + (index - (count - 1) / 2) * rowGap,
          spec.name
        ),
        status: 'done' as const,
        assetUrl: spec.thumbnail,
        videoUrl: spec.videoUrl,
        ...(spec.videoUrl ? { height: videoHeight } : {}),
        text: spec.hook,
        note: `${spec.audience} · ${spec.whatChanged}`
      };
    },
    []
  );

  /** open-variation 落下的节点要等 state 提交后才存在；这里接力推进编辑模式。 */
  const pendingEditNodeIdRef = useRef<string | null>(null);
  useEffect(() => {
    const pending = pendingEditNodeIdRef.current;
    if (pending && nodes.some((item) => item.id === pending)) {
      pendingEditNodeIdRef.current = null;
      enterEditMode(pending);
    }
  }, [enterEditMode, nodes]);

  /**
   * 变体探索的统一分发器：一份产品源 → 一条创意策略 → 一组可控变体。
   * brief 提出三条方向（explore）或直接出一组发散概念（quick-explore）；
   * strategy 展开成变体集；变体可深分支（more-like-this）、落卡（expand-to-canvas）、进编辑器（open-variation）。
   * 全程本地模拟，接真实策略/生成接口后替换各分支内的数据源即可。
   */
  const handleVariationEvent = useCallback(
    (nodeId: string, event: VariationEvent) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) {
        return;
      }

      switch (event.type) {
        case 'plan-change':
          patchNode(nodeId, { variationPlan: event.plan });
          break;

        case 'toggle-planner': {
          const open = !node.variationPlannerOpen;
          patchNode(nodeId, {
            variationPlannerOpen: open,
            variationPlan: node.variationPlan ?? DEFAULT_VARIATION_PLAN,
            height: (node.height ?? PRODUCT_BRIEF_HEIGHT) + (open ? VARIATION_PLANNER_EXTRA : -VARIATION_PLANNER_EXTRA)
          });
          break;
        }

        case 'explore': {
          // 层级三选一里的「方向优先」：先提三条创意方向，每条都能再展开
          const plan = node.variationPlan ?? DEFAULT_VARIATION_PLAN;
          patchNode(nodeId, { status: 'generating' });
          window.setTimeout(() => {
            const strategies = buildStrategyNodes(node, plan);
            const strategyEdges = strategies.reduce<CanvasEdge[]>(
              (acc, strategy) => appendEdge(acc, nodeId, 'out', strategy.id, 'prompt'),
              []
            );
            addPrebuiltGraph(strategies, strategyEdges);
            patchNode(nodeId, { status: 'done' });
            setSelectedIds(strategies.map((strategy) => strategy.id));
          }, DEMO_GENERATING_MS);
          break;
        }

        case 'quick-explore': {
          // Quick explore：跳过方向，直接给 N 个刻意不同的概念（早期发散用）
          const plan = node.variationPlan ?? DEFAULT_VARIATION_PLAN;
          spawnVariationSet(
            node,
            `${plan.offer} — quick explore`,
            buildQuickExploreVariations(plan),
            ['Hook', 'Background', 'Talent', 'Copy', 'Storyline', 'Music', 'Duration']
          );
          break;
        }

        case 'expand-strategy':
          spawnVariationSet(
            node,
            `${node.title} — variations`,
            buildStrategyVariations(node.note ?? 'trend-led', node.variationPlan ?? DEFAULT_VARIATION_PLAN),
            node.varyDimensions ?? ['Hook']
          );
          break;

        case 'toggle-expanded': {
          // 高度先给个估值免得闪动，随后 content-resize 会贴合实际内容
          const expanded = !node.variationsExpanded;
          patchNode(nodeId, {
            variationsExpanded: expanded,
            width: expanded ? VARIATION_SET_EXPANDED_WIDTH : VARIATION_SET_WIDTH,
            height: expanded ? VARIATION_SET_EXPANDED_HEIGHT : VARIATION_SET_HEIGHT
          });
          break;
        }

        case 'refine': {
          // 补充指令：整组变体按这句话重调（demo：走一遍生成态，把指令记在卡片脚注上）
          patchNode(nodeId, { status: 'generating' });
          window.setTimeout(() => {
            patchNode(nodeId, { status: 'done', note: `Refined: ${event.prompt}` });
          }, DEMO_GENERATING_MS);
          break;
        }

        case 'content-resize': {
          // 内容自然高度 + 卡片上下留白（pt-3=12 / pb-9=36）+ 边框 2
          const height = Math.round(event.height + 12 + 36 + 2);
          if (height > 60 && Math.abs((node.height ?? 0) - height) > 2) {
            patchNode(nodeId, { height });
          }
          break;
        }

        case 'toggle-vary': {
          // strategy 卡的 Vary 设置折叠/展开，高度跟着内容走
          const open = !node.varyOpen;
          patchNode(nodeId, {
            varyOpen: open,
            height: (node.height ?? NODE_KIND_CONFIG.strategy.height) + (open ? STRATEGY_VARY_EXTRA : -STRATEGY_VARY_EXTRA)
          });
          break;
        }

        case 'toggle-dimension': {
          const vary = node.varyDimensions ?? [];
          const keep = node.keepConstant ?? [];
          if (vary.includes(event.dimension)) {
            patchNode(nodeId, {
              varyDimensions: vary.filter((dimension) => dimension !== event.dimension),
              keepConstant: keep.includes(event.dimension) ? keep : [...keep, event.dimension]
            });
          } else {
            patchNode(nodeId, {
              varyDimensions: [...vary, event.dimension],
              keepConstant: keep.filter((dimension) => dimension !== event.dimension)
            });
          }
          break;
        }

        case 'select-variation':
          // 单选语义：一组变体里只保留一个 selected，再点一次取消
          patchNode(nodeId, {
            variations: (node.variations ?? []).map((variation) =>
              variation.id === event.variationId
                ? { ...variation, status: variation.status === 'selected' ? 'draft' : 'selected' }
                : variation.status === 'selected'
                  ? { ...variation, status: 'draft' }
                  : variation
            )
          });
          break;

        case 'more-like-this': {
          // 深分支：拿这条变体当基准，只动 hook 和 CTA 的三个受控版本
          const base = node.variations?.find((variation) => variation.id === event.variationId);
          if (!base) {
            return;
          }
          const plan = node.variationPlan ?? DEFAULT_VARIATION_PLAN;
          const downstreamCount = edges.filter((edge) => edge.source === nodeId).length;
          spawnVariationSet(
            node,
            `More like “${base.name}”`,
            buildControlledVariations(base, plan),
            ['Hook', 'Copy'],
            downstreamCount * 160
          );
          break;
        }

        case 'open-variation': {
          const spec = node.variations?.find((variation) => variation.id === event.variationId);
          if (!spec) {
            return;
          }
          const downstreamCount = edges.filter((edge) => edge.source === nodeId).length;
          const videoNode = materializeVariation(node, spec, downstreamCount, downstreamCount * 2 + 1);
          addPrebuiltGraph([videoNode], appendEdge([], nodeId, 'out', videoNode.id, 'video'));
          patchNode(nodeId, {
            variations: (node.variations ?? []).map((variation) =>
              variation.id === spec.id ? { ...variation, status: 'edited' as const } : variation
            )
          });
          pendingEditNodeIdRef.current = videoNode.id;
          break;
        }

        case 'expand-to-canvas': {
          // 选中了某条方向就只落那一个节点；没选中才整组摊开
          const specs = node.variations ?? [];
          const selected = specs.filter((variation) => variation.status === 'selected');
          const toPlace = selected.length > 0 ? selected : specs;
          if (toPlace.length === 0) {
            return;
          }
          const variationNodes = toPlace.map((spec, index) => materializeVariation(node, spec, index, toPlace.length));
          const variationEdges = variationNodes.reduce<CanvasEdge[]>(
            (acc, videoNode) => appendEdge(acc, nodeId, 'out', videoNode.id, 'video'),
            []
          );
          addPrebuiltGraph(variationNodes, variationEdges);
          setSelectedIds(variationNodes.map((videoNode) => videoNode.id));
          break;
        }
      }
    },
    [addPrebuiltGraph, edges, materializeVariation, nodes, patchNode, spawnVariationSet]
  );

  /**
   * Video 节点点运行：如果上游同时接了 Storyboard 和 Audio Clips（即「剪成片」这条路），
   * 用本地固定成片模拟一次生成，而不是真的打生成接口——demo 用，别的 video 节点走原来的 executeNode。
   */
  const handleVideoRun = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (node?.kind === 'video') {
        const upstreamKinds = edges
          .filter((edge) => edge.target === nodeId)
          .map((edge) => nodes.find((item) => item.id === edge.source)?.kind);
        const isClipFromStoryboardAndAudio =
          upstreamKinds.includes('storyboard') && upstreamKinds.includes('audio-clips');
        if (isClipFromStoryboardAndAudio) {
          patchNode(nodeId, { status: 'generating', error: undefined });
          window.setTimeout(() => {
            // 出片同时把卡片撑到完整尺寸，9:16 的画面才不会被默认高度裁掉
            patchNode(nodeId, {
              status: 'done',
              videoUrl: CLIP_DEMO_VIDEO_URL,
              note: 'Dreamina Seedance 2.5',
              width: VIDEO_READY_WIDTH,
              height: VIDEO_READY_HEIGHT
            });
          }, DEMO_GENERATING_MS);
          return;
        }
      }
      executeNode(nodeId);
    },
    [edges, executeNode, nodes, patchNode]
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

  /** 多选时统一渲染在包围盒右侧、垂直居中的那一个 ⊕（世界坐标，父层已经带了缩放/平移）。 */
  const multiSelectAddAnchor = useMemo(() => {
    if (selectedIds.length <= 1) {
      return null;
    }
    const picked = nodes.filter((node) => selectedIds.includes(node.id));
    if (picked.length < 2) {
      return null;
    }
    const right = Math.max(...picked.map((node) => node.x + node.width));
    const top = Math.min(...picked.map((node) => node.y));
    const bottom = Math.max(...picked.map((node) => node.y + getNodeHeight(node)));
    return { x: right + 10, y: (top + bottom) / 2 };
  }, [nodes, selectedIds]);

  /** 打开时间线编辑器的节点；Timeline 节点和 Video 节点（Edit CTA）都能进全屏编辑态。 */
  const editDockNode = useMemo(
    () => nodes.find((node) => node.id === editDock?.nodeId && (node.kind === 'timeline' || node.kind === 'video')) ?? null,
    [editDock, nodes]
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
          // select-none：拖节点时鼠标划过别的卡片不会把它们的文字刷成一片选中态；
          // 输入框/文本域再单独放开，卡片内的文案照样能选能改
          'absolute inset-0 touch-none select-none [&_input]:select-text [&_textarea]:select-text',
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
              showAddButton={selectedIds.length <= 1}
              onResizePointerDown={handleResizePointerDown}
              onDropOnCard={handleDropOnCard}
              onOpenEditor={enterEditMode}
              onRunTool={runTool}
              onRun={handleVideoRun}
              onTextChange={handleTextChange}
              onStoryboardGenerate={handleStoryboardGenerate}
              onOperationGenerate={handleOperationGenerate}
              onAudioGenerate={handleAudioGenerate}
              onVariationEvent={handleVariationEvent}
              onRefine={handleRefine}
              isRefinedCut={
                node.kind === 'video' &&
                edges.some(
                  (edge) =>
                    edge.target === node.id && nodes.find((item) => item.id === edge.source)?.kind === 'storyboard'
                )
              }
              isEditing={editDock?.nodeId === node.id}
              endCardUrl={editDock?.nodeId === node.id ? editEndCardUrl : null}
              onExitEditor={exitEditMode}
              onDuplicate={duplicateNode}
              onDelete={removeNode}
            />
          ))}

          {/* 多选时的共用 ⊕：包围盒右侧、垂直居中，选中的每张卡都会连去同一个新节点 */}
          {multiSelectAddAnchor ? (
            <button
              type="button"
              title="Add connected node"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={openMultiAddPanel}
              className="absolute z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-solid border-neutral-fillLow bg-neutral-surface text-neutral-mediumOnSurface shadow-[0_1px_3px_rgba(16,24,40,0.10)] transition-colors hover:border-primary-fill hover:text-primary-fill"
              style={{ left: multiSelectAddAnchor.x, top: multiSelectAddAnchor.y }}
            >
              <KsIconPlus size={14} />
            </button>
          ) : null}
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

      {/* 选中 Hook/Body/CTA/Trend 四件套：右侧浮出「+」，打开节点面板可一键生成 Storyboard */}
      {scriptSelectionPlusPos ? (
        <button
          type="button"
          title="Add a connected node"
          onClick={() =>
            setScriptAddAnchor((current) => (current ? null : { x: scriptSelectionPlusPos.x, y: scriptSelectionPlusPos.y }))
          }
          className="absolute z-30 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-solid border-primary-fill bg-neutral-surface text-primary-fill shadow-[0_4px_12px_rgba(16,24,40,0.16)] transition-transform hover:scale-105"
          style={{ left: scriptSelectionPlusPos.x + 28, top: scriptSelectionPlusPos.y }}
        >
          <KsIconPlus size={16} />
        </button>
      ) : null}

      {scriptAddAnchor ? (
        <div className="absolute z-30" style={{ left: scriptAddAnchor.x + 28, top: scriptAddAnchor.y }}>
          <NodePalette
            onSelect={(kind) => {
              if (kind === 'storyboard') {
                generateStoryboardAndAudio();
                return;
              }
              const center = getViewportCenter();
              setSelectedIds([addNodeAt(kind, center.x, center.y)]);
              setScriptAddAnchor(null);
            }}
          />
        </div>
      ) : null}

      {/* 卡片 ⊕ 面板：跟随卡片位置浮在画布之上 */}
      {addPanelAnchor ? (
        <div className="absolute z-30" style={{ left: addPanelAnchor.screenX, top: addPanelAnchor.screenY }}>
          <NodePalette onSelect={addNodeFromCard} />
        </div>
      ) : null}

      {/* 编辑模式下让位给「Exit editing mode」，不叠在推近的节点上 */}
      {!editDock ? (
        <SelectionToolbar
          count={selectedIds.length}
          onSaveAsTemplate={saveAsTemplate}
          onDuplicate={duplicateSelected}
          onSelectAll={selectAll}
          onDelete={deleteSelected}
          onClear={() => setSelectedIds([])}
        />
      ) : null}

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
            title="TikTok ads-native templates"
            onClick={() => setIsStrategiesOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-full border border-solid border-neutral-fillLow bg-neutral-surface px-3.5 text-[12px] font-medium text-neutral-highOnSurface shadow-[0_1px_3px_rgba(16,24,40,0.10)] transition-colors hover:bg-neutral-surface2"
          >
            <KsIconAiGeneration size={14} />
            TikTok ads-native templates
          </button>
          <button
            type="button"
            title="Save this workflow as a template"
            onClick={() => {
              // eslint-disable-next-line no-console
              console.info('[canvas] save as template', { nodes: nodes.length });
            }}
            className="flex h-9 items-center gap-1.5 rounded-full border border-solid border-neutral-fillLow bg-neutral-surface px-3.5 text-[12px] font-medium text-neutral-highOnSurface shadow-[0_1px_3px_rgba(16,24,40,0.10)] transition-colors hover:bg-neutral-surface2"
          >
            <KsIconFolderAdd size={14} />
            Save as template
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

      {/* 空画布的 agent 输入区：提示词 + 模板/加节点/教程三个入口 */}
      {/* Composer 提交后的加载过场：3 秒后节点才落画布 */}
      {isLandingLoading ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 pl-[88px]" data-landing-loading>
          <span className="size-8 animate-spin rounded-full border-[3px] border-solid border-neutral-fillLow border-t-primary-fill" />
          <span className="text-[14px] font-medium text-neutral-mediumOnSurface">
            Reading your product — setting up the workspace…
          </span>
        </div>
      ) : null}

      {isCanvasEmpty && !isLandingLoading && !isStrategiesOpen ? (
        <CanvasComposer
          onGenerateBrief={landProductWorkflow}
          onOpenTemplates={() => setIsStrategiesOpen(true)}
          onAddNode={() => setSidebarPanel('nodes')}
          onOpenTutorials={() => {
            // eslint-disable-next-line no-console
            console.info('[canvas] open tutorials');
          }}
          onSubmit={(prompt) => {
            setIsAgentOpen(true);
            void sendMessage(prompt);
          }}
        />
      ) : null}

      {isStrategiesOpen ? (
        <ContentStrategiesPopover onPick={applyStrategy} onClose={() => setIsStrategiesOpen(false)} />
      ) : null}

      {/* 内联编辑模式：画布保持可见，底部滑入时间线；agent 对话在 Creative agent 面板里 */}
      {editDockNode ? (
        <NodeEditDock
          nodeId={editDockNode.id}
          videoUrl={editDockNode.videoUrl}
          posterUrl={editDockNode.assetUrl}
          sellingPoints={editSellingPoints}
          endCardUrl={editEndCardUrl}
          promotion={editPromotion}
          isClosing={isEditClosing}
          onClose={exitEditMode}
        />
      ) : null}

      {/* Creative agent：画布唯一的 agent 面板；剪辑步骤自动切换成该节点的剪辑对话 */}
      <AgentPanel
        isOpen={isAgentOpen}
        isBusy={isAgentBusy}
        messages={messages}
        editing={
          editDockNode
            ? {
                nodeTitle: editDockNode.title,
                initialPrompt: editDock?.prompt,
                onApplySellingPoints: (points) => {
                  setEditSellingPoints(points);
                  // 卖点贴片应用完：节点的视频换成带 selling-point 的渲染版本
                  patchNode(editDockNode.id, {
                    videoUrl: SELLING_POINT_VIDEO_URL,
                    status: 'done',
                    note: 'Selling-point render',
                    width: VIDEO_READY_WIDTH,
                    height: VIDEO_READY_HEIGHT
                  });
                },
                // 用户附上的片尾卡：整段替换时间线的 CTA 段，预览可直接播
                onApplyEndCard: (url) => setEditEndCardUrl(url),
                onApplyPromotion: (text) => setEditPromotion(text)
              }
            : null
        }
        isClosing={isEditClosing}
        onToggle={() => setIsAgentOpen((open) => !open)}
        onSend={sendMessage}
        onAction={handleAgentAction}
      />
    </div>
  );
}

export default CanvasPage;
