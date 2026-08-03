/* eslint-disable max-lines-per-function */
import {
  KsIconAiAssistant,
  KsIconClose,
  KsIconCopyContent,
  KsIconCut,
  KsIconDelete,
  KsIconDownload,
  KsIconFolder,
  KsIconAiGeneration,
  KsIconPen,
  KsIconPlus,
  KsIconSearch,
  KsIconSend,
  KsIconShare,
  KsIconTips,
  KsIconSound,
  KsIconSplit,
  KsIconTextFile,
  KsIconUpload,
  KsIconVideoClip,
  KsIconZoomIn,
  KsIconZoomOut
} from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_TIMELINE_TRACKS, INTAKE_FIELDS } from '../const';
import { planEdit } from '../services/timeline-ai';
import {
  activeCaptionClip,
  activeCaptionText,
  activeGraphicsCues,
  activeVideoClip,
  applyOperations,
  buildPreview,
  clipPlaybackRate,
  findClip,
  findTrackIdOfClip,
  sourceTimeAt,
  timelineDuration
} from '../timeline-ops';
import type {
  AiEditorMessage,
  ClipDiffStatus,
  IntakeAnswers,
  RegionEdit,
  TimelineTrack,
  TimelineTrackKind,
  VideoFormatRatio
} from '../types';
import AiEditorPanel from './AiEditorPanel';
import { ToolPanel, ToolRail, type EditorTool } from './EditorToolPanels';
import { getClaudeKey, setClaudeKey } from '../services/claude-client';

interface TimelineEditorProps {
  /** 编辑对象的名称，展示在标题和预览占位上。 */
  sourceLabel: string;
  /** 来源节点的可播放视频；有值时预览区放真实视频而不是占位块。 */
  videoUrl?: string;
  /** 视频封面，也用作没有 videoUrl 时的静态预览图。 */
  posterUrl?: string;
  onClose: () => void;
}

/** 时间轴每秒占用的像素，缩放滑杆会在此基础上乘系数。 */
const BASE_PX_PER_SECOND = 104;
/** 标尺至少画这么多秒，内容更长时按内容延展。 */
const MIN_RULER_SECONDS = 9;
const PLAYBACK_TICK_MS = 100;
/** 预览视频与播放头允许的最大偏差（秒），超过才回拉。 */
const DRIFT_TOLERANCE = 0.4;
/** 思考步骤逐条揭示的间隔（毫秒）。 */
const THINKING_REVEAL_MS = 420;
/** 读不到素材时长时（解码失败等）建轨道用的兜底时长。 */
const FALLBACK_MEDIA_SECONDS = 6;
/** 每段分镜的目标时长（秒），用来决定把素材切成几段。 */
const TARGET_SEGMENT_SECONDS = 7;
const MIN_SEGMENTS = 2;
/** 转场元素的时长，跨在两段分镜的接缝上。 */
const TRANSITION_SECONDS = 0.5;

/** 圈选弹层里的快捷动作，每条就是一句会真的跑起来的诉求。 */
const REGION_ACTIONS: Array<{ label: string; prompt: string; icon: 'variations' | 'generate' | 'remove' }> = [
  { label: 'Create variations', prompt: 'create a variation of this area', icon: 'variations' },
  { label: 'Recolor', prompt: 'recolor this area', icon: 'generate' },
  { label: 'Remove object', prompt: 'remove this object and fill the background', icon: 'remove' }
];
const REGION_ACTIONS_MORE: typeof REGION_ACTIONS = [
  { label: 'Replace with product', prompt: 'replace with a product shot', icon: 'generate' },
  { label: 'Blur this area', prompt: 'blur this area', icon: 'generate' }
];

/** 静帧素材（片尾卡、产品图）的判断；这类片段用 <img> 预览而不是驱动视频。 */
const isStillSource = (url?: string): url is string => !!url && /\.(png|jpe?g|webp|gif|svg)$/i.test(url);

/** 画幅比例 → CSS aspect-ratio，Uncrop 变体在这些版位画布之间切换。 */
const FORMAT_ASPECT: Record<VideoFormatRatio, string> = {
  '9:16': '9 / 16',
  '1:1': '1 / 1',
  '16:9': '16 / 9',
  '4:5': '4 / 5'
};

/** 分镜按广告结构命名，和画布上的 Hook / Body / CTA 节点对齐。 */
const SEGMENT_LABELS = ['Hook', 'Body', 'Proof', 'CTA', 'Outro'];
const TRANSITION_LABELS = ['Cross dissolve', 'Whip pan', 'Dip to black', 'Cross dissolve'];

/** 轨道头上的短标签，比纯序号更容易分辨这一行是什么。 */
const TRACK_TAG: Record<TimelineTrackKind, string> = {
  video: 'VID',
  transition: 'TRN',
  audio: 'MUS',
  caption: 'TXT',
  graphics: 'FX'
};

/** 轨道 gutter 里的图标，取代原来的文字标签。 */
const TRACK_ICON: Record<TimelineTrackKind, (props: { size?: number }) => JSX.Element> = {
  video: KsIconVideoClip,
  transition: KsIconSplit,
  audio: KsIconSound,
  caption: KsIconTextFile,
  graphics: KsIconAiGeneration
};

/** 轨道头第二行的可读名称。 */
const TRACK_NAME: Record<TimelineTrackKind, string> = {
  video: 'Video',
  transition: 'Transition',
  audio: 'Music',
  caption: 'Captions',
  graphics: 'Graphics'
};

interface DemoAsset {
  id: string;
  name: string;
  kind: 'video' | 'image' | 'graphics';
  url?: string;
  /** graphics 资产：点它会定位并选中这个片段，方便继续用 @pill 改。 */
  refClipId?: string;
  /** graphics 资产的缩略文案。 */
  preview?: string;
}

/** My assets 面板的示例素材，全部来自 public/ 下的真实文件。 */
const DEMO_ASSETS: DemoAsset[] = [
  { id: 'asset-tracksuit', name: 'tracksuit trend', kind: 'video', url: '/tracksuit-trend.mp4' },
  { id: 'asset-garlic', name: 'garlic paste ad', kind: 'video', url: '/garlic-paste-ad.mp4' },
  { id: 'asset-front', name: 'hoodie — front', kind: 'image', url: '/hoodie-front.webp' },
  { id: 'asset-back', name: 'hoodie — back', kind: 'image', url: '/hoodie-back.webp' },
  { id: 'asset-pocket', name: 'hoodie — pocket', kind: 'image', url: '/hoodie-pocket.webp' },
  { id: 'asset-endcard', name: 'End card', kind: 'image', url: '/end-card.svg' }
];

/** 各类轨道的片段配色，扫一眼就能区分画面、转场、音乐和字幕。 */
const TRACK_TONE: Record<TimelineTrackKind, string> = {
  video: 'border-neutral-fillLow bg-neutral-surface2 hover:bg-neutral-surface3',
  transition: 'border-primary-fill/40 bg-primary-surface3 hover:bg-primary-surface2',
  audio: 'border-success-fill/40 bg-success-fill/10 hover:bg-success-fill/20',
  caption: 'border-neutral-fill/40 bg-neutral-surface3 hover:bg-neutral-surface2',
  graphics: 'border-primary-onSurface/40 bg-primary-surface2 hover:bg-primary-surface3'
};

/** 预览态下片段的描边样式，全用虚线以便和「选中」的实线区分开。 */
const DIFF_CLASS: Record<ClipDiffStatus, string> = {
  added: 'border-dashed border-success-fill bg-success-fill/10',
  removed: 'border-dashed border-error-fill bg-error-fillLow opacity-60',
  changed: 'border-dashed border-primary-fill bg-primary-surface3',
  unchanged: ''
};

/** 把秒格式化成 00:00.00。 */
const formatTime = (seconds: number) => {
  const clamped = Math.max(0, seconds);
  const mm = String(Math.floor(clamped / 60)).padStart(2, '0');
  const ss = String(Math.floor(clamped % 60)).padStart(2, '0');
  const cs = String(Math.floor((clamped % 1) * 100)).padStart(2, '0');
  return `${mm}:${ss}.${cs}`;
};

function ToolButton({
  children,
  isActive,
  title,
  onClick
}: {
  children: React.ReactNode;
  isActive?: boolean;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        'flex size-8 items-center justify-center rounded-lg transition-colors',
        isActive
          ? 'bg-primary-surface2 text-primary-onSurface'
          : 'text-neutral-mediumOnSurface hover:bg-neutral-surface2'
      )}
    >
      {children}
    </button>
  );
}

/**
 * 全屏时间线编辑器，参考 Flora 的 Timeline Editor。
 * 上方预览、下方多轨时间线、右侧属性面板。
 */
function TimelineEditor({ sourceLabel, videoUrl, posterUrl, onClose }: TimelineEditorProps) {
  /*
   * 有真实视频时，时间线从这条视频建起来（等 loadedmetadata 拿到真实时长）；
   * 没有视频的节点仍然用示例轨道，保持原有 demo 行为。
   */
  const [tracks, setTracks] = useState<TimelineTrack[]>(videoUrl ? [] : INITIAL_TIMELINE_TRACKS);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(videoUrl ? null : 'clip-1');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  /** 正在拖动播放头。 */
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [zoom, setZoom] = useState(1);
  /** 当前画幅；Uncrop 变体应用后从 9:16 切到目标版位。 */
  const [format, setFormat] = useState<VideoFormatRatio>('9:16');
  /** 正在内联编辑文案的字幕片段 id。 */
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  /** 中栏素材面板的页签与搜索词。 */
  const [assetsTab, setAssetsTab] = useState<'assets' | 'library' | 'transcript'>('assets');
  const [assetSearch, setAssetSearch] = useState('');
  /** 左侧工具栏当前停留的条目，默认是编辑 agent。 */
  const [activeTool, setActiveTool] = useState<EditorTool>('agent');
  /* 圈选编辑：pen 模式下在画面上画一个闭合区域，配一句指令交给 agent。 */
  const [isPenMode, setIsPenMode] = useState(false);
  const [penPoints, setPenPoints] = useState<Array<[number, number]> | null>(null);
  const [drawnPath, setDrawnPath] = useState<string | null>(null);
  const [regionPrompt, setRegionPrompt] = useState('');
  /** 圈选完成后弹层的锚点（相对预览区左上角的 px）。 */
  const [regionAnchor, setRegionAnchor] = useState<{ left: number; top: number } | null>(null);
  const [showMoreRegionActions, setShowMoreRegionActions] = useState(false);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const regionFileRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  /** 已应用的圈选编辑，渲染成画面上的调色蒙版。 */
  const [regionEdits, setRegionEdits] = useState<RegionEdit[]>([]);
  const regionSeqRef = useRef(0);
  /** 用户从输入区上传的素材，排在示例素材前面。 */
  const [uploadedAssets, setUploadedAssets] = useState<DemoAsset[]>([]);
  const assetSeqRef = useRef(0);
  const uploadSeqRef = useRef(0);
  const rulerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** 只根据素材时长建一次轨道，避免重新加载 metadata 时冲掉用户的编辑。 */
  const seededRef = useRef(false);
  /** 复制片段的自增后缀，保证 id 唯一。 */
  const copySeqRef = useRef(1);

  /* AI editor 会话：计划待确认时只做预览，应用后把上一版留在消息里可回滚。 */
  const [messages, setMessages] = useState<AiEditorMessage[]>([]);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const msgSeqRef = useRef(0);
  const versionSeqRef = useRef(0);
  /** 开场问候+问卷只落一次。 */
  const introSeededRef = useRef(false);
  /* Connect Claude：key 只存本浏览器 localStorage，绝不进代码或构建产物。 */
  const [claudeConnected, setClaudeConnected] = useState(() => Boolean(getClaudeKey()));
  const [showClaudeRow, setShowClaudeRow] = useState(false);
  const [claudeKeyDraft, setClaudeKeyDraft] = useState('');
  /* 拖素材 + 品牌元素识别 */
  const [dragAssetId, setDragAssetId] = useState<string | null>(null);
  const brandDropsRef = useRef(0);
  const brandSuggestedRef = useRef(false);

  const nextMessageId = () => {
    msgSeqRef.current += 1;
    return `msg-${msgSeqRef.current}`;
  };

  /** 当前待确认的计划。 */
  const plan = useMemo(() => {
    const message = messages.find((item) => item.role === 'plan' && item.id === pendingPlanId);
    return message && message.role === 'plan' ? message.plan : null;
  }, [messages, pendingPlanId]);

  /** 待确认计划里的全部操作 —— 预览和应用都以它为准。 */
  const acceptedOperations = useMemo(() => plan?.operations ?? [], [plan]);

  /** 计划待确认时，时间线画的是应用后的样子。 */
  const previewTracks = useMemo(
    () => (acceptedOperations.length > 0 ? applyOperations(tracks, acceptedOperations) : tracks),
    [tracks, acceptedOperations]
  );

  const trackPreviews = useMemo(
    () => buildPreview(tracks, previewTracks),
    [tracks, previewTracks]
  );

  /** 待确认计划里的画幅变更（若勾选中）。 */
  const pendingFormat = useMemo(() => {
    const formatOp = acceptedOperations.find((operation) => operation.op.type === 'set-format');
    return formatOp && formatOp.op.type === 'set-format' ? formatOp.op.ratio : null;
  }, [acceptedOperations]);

  /** 预览区实际画的画幅：待确认的画幅变更也先预览出来。 */
  const previewFormat = pendingFormat ?? format;

  const pxPerSecond = BASE_PX_PER_SECOND * zoom;
  const duration = Math.max(timelineDuration(previewTracks), 1);
  const rulerSeconds = Math.max(MIN_RULER_SECONDS, Math.ceil(duration));

  const patchMessage = (id: string, patch: Partial<Extract<AiEditorMessage, { role: 'thinking' }>>) =>
    setMessages((current) =>
      current.map((message) => (message.id === id ? ({ ...message, ...patch } as AiEditorMessage) : message))
    );

  /**
   * 跑一轮 agent：先落用户消息和思考占位，拿到回复后逐条揭示推理，
   * 最后落地成一个澄清问题或一份待确认的计划。
   */
  const runAgent = async (prompt: string, intake?: IntakeAnswers, region?: { path: string }) => {
    // 选中的元素作为定向上下文一起交给 agent；圈选/问卷流不叠加
    const target = !region && !intake && selectedClipMeta ? selectedClipMeta : undefined;
    // 两个 id 都先算好，别在 setState 更新函数里取，那会被 StrictMode 重复调用
    const userId = nextMessageId();
    const thinkingId = nextMessageId();
    setMessages((current) => [
      ...current,
      { id: userId, role: 'user', text: target ? `@${target.label} — ${prompt}` : prompt },
      { id: thinkingId, role: 'thinking', steps: [], revealed: 0 }
    ]);
    setIsPlanning(true);
    setPendingPlanId(null);

    try {
      const reply = await planEdit(prompt, tracks, currentTime, intake, region, target);
      patchMessage(thinkingId, { steps: reply.thinking, revealed: 0 });
      // 逐条揭示，让处理过程可见而不是一次性糊上来
      for (let step = 1; step <= reply.thinking.length; step += 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, THINKING_REVEAL_MS);
        });
        patchMessage(thinkingId, { revealed: step });
      }

      if (reply.kind === 'question') {
        setMessages((current) => [
          ...current,
          { id: nextMessageId(), role: 'question', text: reply.question, options: reply.options }
        ]);
        return;
      }

      const planId = nextMessageId();
      setMessages((current) => [
        ...current,
        { id: planId, role: 'plan', plan: reply.plan, status: 'pending', suggestions: reply.suggestions }
      ]);
      if (reply.plan.operations.length > 0) {
        setPendingPlanId(planId);
      }
    } finally {
      setIsPlanning(false);
    }
  };

  /* 打开编辑器先问清诉求：一条问候 + 一份问卷，答完再动时间线。 */
  useEffect(() => {
    if (introSeededRef.current) {
      return;
    }
    introSeededRef.current = true;
    setMessages([
      {
        id: nextMessageId(),
        role: 'answer',
        text: `“${sourceLabel}” is loaded. A few quick questions so the first cut lands close to what you need.`
      },
      { id: nextMessageId(), role: 'form', fields: INTAKE_FIELDS, answers: {}, submitted: false }
    ]);
    // 只在挂载时跑一次；sourceLabel 变化意味着换了节点，编辑器会整体重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 把问卷答案压成一句可读的诉求，同时把结构化答案交给 agent。 */
  const submitIntake = (messageId: string, answers: IntakeAnswers) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId && message.role === 'form' ? { ...message, answers, submitted: true } : message
      )
    );
    const packaging = Array.isArray(answers.packaging) ? answers.packaging : [];
    const parts = [
      typeof answers.clipCount === 'string' && answers.clipCount ? `${answers.clipCount} clips` : null,
      typeof answers.targetLength === 'string' && answers.targetLength ? `${answers.targetLength} each` : null,
      packaging.length ? packaging.join(', ') : null
    ].filter(Boolean);
    void runAgent(`Cutting ${parts.join(' · ')}`, answers);
  };

  /** 回答澄清问题：把选项接在原始诉求后面重跑，答案因此真的会改变结果。 */
  const answerQuestion = (messageId: string, option: string) => {
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) {
      return;
    }
    // 布局建议：直接执行/关闭，不走「原诉求 + 选项」的重跑逻辑
    if (messageId.startsWith('endcard-suggest-')) {
      setMessages((current) =>
        current.map((message) => (message.id === messageId ? { ...message, answer: option } : message))
      );
      if (option.startsWith('Yes')) {
        void runAgent('create an end card');
      }
      return;
    }
    const origin = [...messages.slice(0, index)].reverse().find((message) => message.role === 'user');
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, answer: option } : message))
    );
    void runAgent(
      origin && origin.role === 'user' ? `${origin.text} ${option}` : option,
      undefined,
      drawnPath ? { path: drawnPath } : undefined
    );
  };


  const applyPlan = () => {
    if (acceptedOperations.length === 0 || !pendingPlanId) {
      return;
    }
    const snapshot = tracks;
    const snapshotFormat = format;
    const snapshotRegions = regionEdits;
    versionSeqRef.current += 1;
    const version = versionSeqRef.current;
    setTracks(applyOperations(tracks, acceptedOperations));
    if (pendingFormat) {
      setFormat(pendingFormat);
    }
    const regionOps = acceptedOperations.filter(
      (operation) => operation.op.type === 'region-edit'
    );
    if (regionOps.length > 0) {
      setRegionEdits((current) => [
        ...current,
        ...regionOps.map((operation) => {
          regionSeqRef.current += 1;
          const op = operation.op as Extract<typeof operation.op, { type: 'region-edit' }>;
          return {
            id: `region-${regionSeqRef.current}`,
            path: op.path,
            patchUrl: op.patchUrl,
            blend: op.blend,
            prompt: op.prompt,
            label: operation.label
          };
        })
      ]);
    }
    // 生成的动态图形登记进 My assets，之后可以点它回来继续改
    const graphicsTracks = acceptedOperations
      .filter((operation) => operation.op.type === 'add-track')
      .map((operation) => (operation.op as Extract<typeof operation.op, { type: 'add-track' }>).track)
      .filter((track) => track.kind === 'graphics' && track.clips.length > 0);
    if (graphicsTracks.length > 0) {
      setUploadedAssets((current) => [
        ...graphicsTracks.map((track) => ({
          id: `asset-fx-${version}-${track.id}`,
          name: `Motion graphics v${version}`,
          kind: 'graphics' as const,
          refClipId: track.clips[0].id,
          preview: track.clips[0].text ?? track.clips[0].label
        })),
        ...current
      ]);
    }
    // 这轮圈选已经落地，清掉画面上的虚线
    setDrawnPath(null);
    setRegionAnchor(null);
    setIsPenMode(false);
    setMessages((current) =>
      current.map((message) =>
        message.id === pendingPlanId && message.role === 'plan'
          ? { ...message, status: 'applied', snapshot, snapshotFormat, snapshotRegions, version }
          : message
      )
    );
    setPendingPlanId(null);
  };

  const discardPlan = () => {
    setDrawnPath(null);
    setRegionAnchor(null);
    setMessages((current) =>
      current.map((message) =>
        message.id === pendingPlanId && message.role === 'plan' ? { ...message, status: 'discarded' } : message
      )
    );
    setPendingPlanId(null);
  };

  /** 回到某次编辑之前的那份拷贝。 */
  const restoreVersion = (messageId: string) => {
    const message = messages.find((item) => item.id === messageId);
    if (!message || message.role !== 'plan' || !message.snapshot) {
      return;
    }
    setTracks(message.snapshot);
    setFormat(message.snapshotFormat ?? '9:16');
    setRegionEdits(message.snapshotRegions ?? []);
    setSelectedClipId(null);
    setPendingPlanId(null);
    setMessages((current) => [
      ...current,
      { id: nextMessageId(), role: 'note', text: `Reverted to the timeline before v${message.version}.` }
    ]);
  };

  /** 播放头当前落在哪个有画面的片段上，决定预览播哪一段素材。 */
  /*
   * 叠层采样时间：播放头正好停在末尾时，半开区间会什么都取不到，
   * 而末尾恰恰是片尾卡所在 —— 往内收一帧，Jump to end 也能看到最后画面。
   */
  const sampleTime = Math.min(currentTime, Math.max(0, duration - 0.01));

  const active = useMemo(() => activeVideoClip(previewTracks, sampleTime), [previewTracks, sampleTime]);

  /**
   * 当前片段引用的是图片而不是视频时，预览要放 <img>。
   * 片尾卡、产品图这类静帧素材都走这条路。
   */
  const activeStillUrl = useMemo(() => {
    const url = active?.clip.sourceUrl;
    return isStillSource(url) ? url : undefined;
  }, [active]);

  /** 当前时间点应叠在画面上的字幕；用 previewTracks，待确认的字幕也能先看到。 */
  const captionText = useMemo(() => activeCaptionText(previewTracks, sampleTime), [previewTracks, sampleTime]);

  /** 当前时间点的动态图形卖点，同样用 previewTracks 以便未应用时先看到。 */
  const graphicsCues = useMemo(() => activeGraphicsCues(previewTracks, sampleTime), [previewTracks, sampleTime]);

  /*
   * 拿到真实时长后，用整条视频建一条视频轨；只建一次，后续编辑不再被覆盖。
   * 解码失败时也要建（用兜底时长），否则时间线会一直空着，编辑器直接不可用。
   */
  const seedFromMedia = (mediaDuration: number) => {
    if (!videoUrl || seededRef.current) {
      return;
    }
    seededRef.current = true;

    /*
     * 一整条视频摊成一个片段没法剪，所以按目标段长切成若干分镜，
     * 接缝上放转场，底下铺一条音乐。每段都带自己的素材入点，
     * 因此拖动、切分、删除任意一段都只影响那一段的画面。
     */
    const segments = Math.max(
      MIN_SEGMENTS,
      Math.min(SEGMENT_LABELS.length, Math.round(mediaDuration / TARGET_SEGMENT_SECONDS))
    );
    const segmentLength = mediaDuration / segments;

    const videoClips = Array.from({ length: segments }, (_, index) => ({
      id: `clip-scene-${index + 1}`,
      label: SEGMENT_LABELS[index] ?? `Scene ${index + 1}`,
      start: index * segmentLength,
      duration: segmentLength,
      hasAudio: true,
      sourceUrl: videoUrl,
      sourceStart: index * segmentLength,
      sourceDuration: segmentLength
    }));

    // 转场跨在接缝上，所以起点要往前挪半个转场长度
    const transitionClips = Array.from({ length: segments - 1 }, (_, index) => ({
      id: `clip-transition-${index + 1}`,
      label: TRANSITION_LABELS[index % TRANSITION_LABELS.length],
      start: Math.max(0, (index + 1) * segmentLength - TRANSITION_SECONDS / 2),
      duration: TRANSITION_SECONDS,
      hasAudio: false
    }));

    setTracks([
      { id: 'track-video', kind: 'video', visible: true, muted: false, clips: videoClips },
      ...(transitionClips.length
        ? [{ id: 'track-transition', kind: 'transition' as const, visible: true, muted: false, clips: transitionClips }]
        : []),
      {
        id: 'track-music',
        kind: 'audio',
        visible: true,
        muted: false,
        clips: [
          {
            id: 'clip-music',
            label: 'Brand BGM — upbeat',
            start: 0,
            duration: mediaDuration,
            hasAudio: true
          }
        ]
      }
    ]);
  };

  const handleMetadata = () => {
    const video = videoRef.current;
    seedFromMedia(video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : FALLBACK_MEDIA_SECONDS);
  };

  /*
   * 时间线是时钟：播放头由定时器推进，预览视频跟着播放头走。
   * 每一拍都按当前片段把「时间线时间」换算成「素材时间」，所以裁剪、切分、
   * 变速、删除都会直接改变播放内容 —— 跳过的片段就是跳过的画面。
   */
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const timer = setInterval(() => {
      setCurrentTime((time) => {
        const next = time + PLAYBACK_TICK_MS / 1000;
        if (next >= duration) {
          setIsPlaying(false);
          return duration;
        }
        const video = videoRef.current;
        const current = activeVideoClip(previewTracks, next);
        if (video && current && !video.seeking && !isStillSource(current.clip.sourceUrl)) {
          const target = sourceTimeAt(current.clip, next);
          if (Math.abs(video.currentTime - target) > DRIFT_TOLERANCE) {
            video.currentTime = target;
          }
        }
        return next;
      });
    }, PLAYBACK_TICK_MS);
    return () => clearInterval(timer);
  }, [duration, isPlaying, previewTracks]);

  /* 播放/暂停同步给预览视频；空隙里没有画面就停住。浏览器挡下带声播放时退回静音重试。 */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (!isPlaying || !active || isStillSource(active.clip.sourceUrl)) {
      video.pause();
      return;
    }
    video.playbackRate = Math.min(16, Math.max(0.0625, clipPlaybackRate(active.clip)));
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => undefined);
    });
  }, [isPlaying, active]);

  /* 轨道静音开关直接作用到预览。 */
  useEffect(() => {
    const video = videoRef.current;
    if (video && active) {
      video.muted = active.track.muted;
    }
  }, [active]);

  /** 选中片段的元数据，供 composer 的 @pill 和定向编辑使用。 */
  const selectedClipMeta = useMemo(() => {
    if (!selectedClipId) {
      return null;
    }
    const clip = findClip(tracks, selectedClipId);
    const trackId = findTrackIdOfClip(tracks, selectedClipId);
    const kind = tracks.find((track) => track.id === trackId)?.kind;
    return clip && kind ? { id: clip.id, label: clip.label, kind } : null;
  }, [selectedClipId, tracks]);

  /** 闭合路径的包围盒；生成的贴片按它铺开再裁到路径里。 */
  const pathBounds = (path: string) => {
    const nums = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    if (xs.length === 0 || ys.length === 0) {
      return { x: 0, y: 0, width: 100, height: 100 };
    }
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    // 稍微外扩，避免贴片边缘和蒙版边缘出现缝隙
    return {
      x: minX - 1,
      y: minY - 1,
      width: Math.max(1, Math.max(...xs) - minX) + 2,
      height: Math.max(1, Math.max(...ys) - minY) + 2
    };
  };

  /** 圈选路径：0-100 归一化坐标，随画幅缩放。 */
  const penPathFrom = (points: Array<[number, number]>) =>
    points.length ? `M ${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z` : '';

  const penPoint = (event: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100))
    ];
  };

  const startPenStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawnPath(null);
    setPenPoints([penPoint(event)]);
  };

  const movePenStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = penPoint(event);
    setPenPoints((current) => {
      if (!current) {
        return current;
      }
      const [lastX, lastY] = current[current.length - 1];
      // 采样间隔 >1.2 个单位，避免路径点爆炸
      return Math.hypot(point[0] - lastX, point[1] - lastY) < 1.2 ? current : [...current, point];
    });
  };

  const endPenStroke = () => {
    setPenPoints((current) => {
      if (current && current.length >= 3) {
        const path = penPathFrom(current);
        setDrawnPath(path);
        // 弹层锚在圈选区正下方；坐标换算成预览区内的 px
        const frame = frameRef.current?.getBoundingClientRect();
        const area = previewAreaRef.current?.getBoundingClientRect();
        if (frame && area) {
          const bounds = pathBounds(path);
          setRegionAnchor({
            left: frame.left - area.left + (bounds.x + bounds.width / 2) * (frame.width / 100),
            top: frame.top - area.top + (bounds.y + bounds.height) * (frame.height / 100) + 10
          });
        }
      }
      return null;
    });
  };

  /** 圈选 + 指令交给 agent，走同一个会话与计划评审。 */
  const submitRegionPrompt = (preset?: string) => {
    const text = (preset ?? regionPrompt).trim();
    if (!text || !drawnPath || isPlanning) {
      return;
    }
    setRegionPrompt('');
    setShowMoreRegionActions(false);
    // 收起弹层，但保留 drawnPath —— 计划待确认时画面上还要看到这块蒙版
    setRegionAnchor(null);
    setActiveTool('agent');
    void runAgent(`Edit the circled area: ${text}`, undefined, { path: drawnPath });
  };

  const closeRegionPopover = () => {
    setDrawnPath(null);
    setRegionPrompt('');
    setRegionAnchor(null);
    setShowMoreRegionActions(false);
  };

  /** 彻底退出圈选模式：清掉画到一半的轨迹和弹层，恢复普通预览交互。 */
  const exitPenMode = () => {
    setIsPenMode(false);
    setPenPoints(null);
    closeRegionPopover();
  };

  /** 画面上要渲染的圈选蒙版：已应用的 + 待确认计划里的（虚线描边）。 */
  const previewRegions = useMemo(() => {
    const pending = acceptedOperations
      .filter((operation) => operation.op.type === 'region-edit')
      .map((operation, index) => {
        const op = operation.op as Extract<typeof operation.op, { type: 'region-edit' }>;
        return {
          id: `pending-region-${index}`,
          path: op.path,
          patchUrl: op.patchUrl,
          blend: op.blend,
          prompt: op.prompt,
          label: operation.label,
          pending: true
        };
      });
    return [...regionEdits.map((region) => ({ ...region, pending: false })), ...pending];
  }, [regionEdits, acceptedOperations]);

  /** 统一的跳转入口：播放头和预览视频一起挪到对应的素材位置。 */
  const seekTo = (seconds: number) => {
    const clamped = Math.max(0, Math.min(duration, seconds));
    setCurrentTime(clamped);
    const video = videoRef.current;
    const current = activeVideoClip(previewTracks, clamped);
    if (video && current) {
      video.currentTime = sourceTimeAt(current.clip, clamped);
    }
  };

  /** 把指针位置换算成时间并跳过去。 */
  const seekFromPointer = (clientX: number) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    seekTo((clientX - rect.left) / pxPerSecond);
  };

  /*
   * 标尺可拖动：按下就接管指针，拖动过程中持续 seek，画面跟着走。
   * 用 setPointerCapture，指针滑出标尺甚至滑出窗口也不会丢事件。
   */
  const startScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsScrubbing(true);
    // 拖动时先暂停，否则定时器和拖动会互相抢播放头
    setIsPlaying(false);
    seekFromPointer(event.clientX);
  };

  const moveScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      seekFromPointer(event.clientX);
    }
  };

  const endScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsScrubbing(false);
  };

  const toggleTrackFlag = (trackId: string, flag: 'visible' | 'muted') => {
    setTracks((current) =>
      current.map((track) => (track.id === trackId ? { ...track, [flag]: !track[flag] } : track))
    );
  };

  const deleteSelectedClip = () => {
    if (!selectedClipId) {
      return;
    }
    setTracks((current) =>
      current.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== selectedClipId) }))
    );
    setSelectedClipId(null);
  };

  /*
   * Delete / Backspace 删掉选中的片段。
   * 焦点在输入框里时不接管，否则改字幕、写 prompt、填问卷都会被误删打断。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing || !selectedClipId) {
        return;
      }
      // 阻止 Backspace 触发浏览器后退
      event.preventDefault();
      deleteSelectedClip();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedClipId]);

  /*
   * Esc 逐级退出圈选：先收起「描述修改」弹层（保留画笔），再退出画笔模式本身。
   * 焦点在输入框里时不接管 —— 弹层输入框自带 Esc 收起逻辑，这里再处理会把
   * 两级退出压成一步（React 同步重渲染后新监听器还会吃到同一个事件）。
   */
  useEffect(() => {
    if (!isPenMode) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) {
        return;
      }
      event.preventDefault();
      if (drawnPath) {
        closeRegionPopover();
      } else {
        exitPenMode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPenMode, drawnPath]);

  /** 在播放头处切开选中片段；走和 AI 计划同一套算子，素材入点才会跟着分。 */
  const splitSelectedClip = () => {
    if (!selectedClipId) {
      return;
    }
    setTracks((current) =>
      applyOperations(current, [
        { id: 'manual-split', label: 'Split', op: { type: 'split', clipId: selectedClipId, at: currentTime } }
      ])
    );
  };

  /** 素材列表：当前来源视频排最前，其余是 public/ 里的示例素材。 */
  const allAssets = useMemo<DemoAsset[]>(
    () => [
      ...(videoUrl ? [{ id: 'asset-source', name: sourceLabel, kind: 'video' as const, url: videoUrl }] : []),
      ...uploadedAssets,
      ...DEMO_ASSETS
    ],
    [videoUrl, sourceLabel, uploadedAssets]
  );

  /** 从输入区上传：转成 object URL 进 My assets，并切到该页签让用户看到结果。 */
  const uploadAssets = (files: FileList) => {
    const added: DemoAsset[] = Array.from(files).map((file) => {
      uploadSeqRef.current += 1;
      return {
        id: `asset-upload-${uploadSeqRef.current}`,
        // 去掉扩展名，列表里更干净
        name: file.name.replace(/\.[^.]+$/, ''),
        kind: file.type.startsWith('video') ? ('video' as const) : ('image' as const),
        url: URL.createObjectURL(file)
      };
    });
    if (added.length === 0) {
      return;
    }
    setUploadedAssets((current) => [...added, ...current]);
    setAssetsTab('assets');
    setAssetSearch('');
    setMessages((current) => [
      ...current,
      {
        id: nextMessageId(),
        role: 'note',
        text: `Added ${added.map((asset) => `“${asset.name}”`).join(', ')} to My assets.`
      }
    ]);
  };
  const visibleAssets = allAssets.filter((asset) =>
    asset.name.toLowerCase().includes(assetSearch.trim().toLowerCase())
  );

  /** Transcript 页签的数据源：字幕轨里的所有 cue，按时间排序。 */
  const captionCues = useMemo(
    () =>
      tracks
        .filter((track) => track.kind === 'caption')
        .flatMap((track) => track.clips.filter((clip) => clip.text))
        .sort((a, b) => a.start - b.start),
    [tracks]
  );

  /** 点素材缩略图：接到视频轨末尾成为新片段，视频素材带自己的画面。 */
  const addAssetToTimeline = (asset: DemoAsset) => {
    // graphics 资产是「引用」：跳到它的片段并选中，@pill 立刻可用
    if (asset.kind === 'graphics') {
      const clip = asset.refClipId ? findClip(tracks, asset.refClipId) : undefined;
      if (clip) {
        seekTo(clip.start);
        setSelectedClipId(clip.id);
        setActiveTool('agent');
      } else {
        setMessages((current) => [
          ...current,
          { id: nextMessageId(), role: 'note', text: `“${asset.name}” is no longer on the timeline.` }
        ]);
      }
      return;
    }
    const videoTrack = tracks.find((track) => track.kind === 'video');
    if (!videoTrack) {
      return;
    }
    assetSeqRef.current += 1;
    const clipDuration = asset.kind === 'video' ? 3 : 2;
    const clip = {
      id: `clip-asset-${assetSeqRef.current}`,
      label: asset.name,
      start: timelineDuration(tracks),
      duration: clipDuration,
      hasAudio: asset.kind === 'video',
      // 图片和视频都带素材地址，静帧靠它在预览里渲染
      ...(asset.url ? { sourceUrl: asset.url, sourceStart: 0, sourceDuration: clipDuration } : {})
    };
    setTracks((current) =>
      applyOperations(current, [
        { id: 'manual-add-asset', label: 'Add asset', op: { type: 'add-clip', trackId: videoTrack.id, clip } }
      ])
    );
    setSelectedClipId(clip.id);
    // 连续放了两个以上品牌素材（图片/片尾卡）→ 主动提出把版式做完
    if (asset.kind === 'image') {
      brandDropsRef.current += 1;
      if (brandDropsRef.current >= 2 && !brandSuggestedRef.current) {
        brandSuggestedRef.current = true;
        setMessages((current) => [
          ...current,
          {
            id: `endcard-suggest-${nextMessageId()}`,
            role: 'question',
            text: 'Looks like you’re assembling branding assets — want me to finish the layout as an end card?',
            options: ['Yes — finish the layout', 'No thanks']
          }
        ]);
        setActiveTool('agent');
      }
    }
  };

  const deleteTrack = (trackId: string) => {
    setTracks((current) => current.filter((track) => track.id !== trackId));
    setSelectedClipId(null);
  };

  /** 提交内联编辑的字幕文案；空串视为取消，不清空原文案。 */
  const commitCaptionText = (clipId: string, raw: string) => {
    setEditingCaptionId(null);
    const text = raw.trim();
    if (!text || findClip(tracks, clipId)?.text === text) {
      return;
    }
    setTracks((current) =>
      applyOperations(current, [
        { id: 'manual-set-text', label: 'Edit caption', op: { type: 'set-text', clipId, text } }
      ])
    );
  };

  /** 复制选中片段，接在它后面，并把后续片段整体后移让出位置。 */
  const duplicateSelectedClip = () => {
    if (!selectedClipId) {
      return;
    }
    const source = findClip(tracks, selectedClipId);
    const trackId = findTrackIdOfClip(tracks, selectedClipId);
    if (!source || !trackId) {
      return;
    }
    const copyId = `${source.id}-copy-${copySeqRef.current++}`;
    setTracks((current) =>
      applyOperations(current, [
        // 先给副本腾位置，再插入，否则会和后面的片段叠在一起
        ...current
          .flatMap((track) => track.clips)
          .filter((clip) => clip.start >= source.start + source.duration)
          .map((clip) => ({
            id: `shift-${clip.id}`,
            label: 'Shift',
            op: { type: 'set-timing' as const, clipId: clip.id, start: clip.start + source.duration, duration: clip.duration }
          })),
        {
          id: 'manual-duplicate',
          label: 'Duplicate',
          op: {
            type: 'add-clip' as const,
            trackId,
            clip: { ...source, id: copyId, start: source.start + source.duration }
          }
        }
      ])
    );
    setSelectedClipId(copyId);
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-neutral-surface1" data-timeline-editor>
      {/* 顶栏：关闭 / 项目名 / 导出动作 */}
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-solid border-neutral-fillLow bg-neutral-surface px-3">
        <button
          type="button"
          title="Close timeline editor"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
        >
          <KsIconClose size={15} />
        </button>
        <span className="flex-1 truncate text-center text-[13px] font-semibold text-neutral-highOnSurface">
          {sourceLabel}
        </span>
        <button
          type="button"
          title="Save to library"
          className="flex size-8 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
        >
          <KsIconFolder size={15} />
        </button>
        <button
          type="button"
          title="Download"
          className="flex size-8 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
        >
          <KsIconDownload size={15} />
        </button>
        <button
          type="button"
          title="Share"
          className="flex size-8 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
        >
          <KsIconShare size={15} />
        </button>
        <button
          type="button"
          title="Sync this cut to TikTok Ads Manager"
          className="ml-1 rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface px-3.5 py-1.5 text-[12px] font-semibold text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
        >
          Sync to TTAM
        </button>
        <button
          type="button"
          title="Export (demo)"
          className="rounded-lg bg-primary-fill px-3.5 py-1.5 text-[12px] font-semibold text-neutral-onFill transition-opacity hover:opacity-90"
        >
          Export
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 最左：工具栏 */}
        <ToolRail active={activeTool} onSelect={setActiveTool} />

        {/* 左：当前工具的面板，agent 是默认项 */}
        <aside
          data-ai-sidebar
          className="flex w-[340px] shrink-0 flex-col overflow-hidden border-r border-solid border-neutral-fillLow bg-neutral-surface"
        >
          {activeTool !== 'agent' ? (
            <ToolPanel
              tool={activeTool}
              tracks={tracks}
              onSeek={seekTo}
              onSelectClip={setSelectedClipId}
              onToggleTrackFlag={toggleTrackFlag}
              onAsk={(prompt) => {
                // 面板里的动作也走同一个会话，切回 agent 才看得到思考和计划
                setActiveTool('agent');
                void runAgent(prompt);
              }}
            />
          ) : (
            <>
          <div className="flex shrink-0 items-center gap-2 px-3.5 py-3">
            <span className="text-[15px] font-bold text-primary-onSurface">Editing agent</span>
            <span className="flex-1" />
            <button
              type="button"
              data-claude-connect
              title={claudeConnected ? 'Prompts run through your Claude account' : 'Connect your Claude account (Anthropic API key)'}
              onClick={() => setShowClaudeRow((v) => !v)}
              className={clsx(
                'rounded-full border border-solid px-2.5 py-1 text-[11px] font-medium transition-colors',
                claudeConnected
                  ? 'border-success-fill/40 bg-success-fill/10 text-success-onSurface'
                  : 'border-neutral-fillLow text-neutral-mediumOnSurface hover:bg-neutral-surface2'
              )}
            >
              {claudeConnected ? 'Claude ✓' : 'Connect Claude'}
            </button>
          </div>
          {showClaudeRow ? (
            <div className="shrink-0 border-b border-solid border-neutral-fillLow px-3.5 pb-3">
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  value={claudeKeyDraft}
                  placeholder="sk-ant-…"
                  onChange={(event) => setClaudeKeyDraft(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface1 px-2 py-1.5 text-[12px] text-neutral-highOnSurface outline-none focus:border-primary-fill"
                />
                <button
                  type="button"
                  disabled={!claudeKeyDraft.trim()}
                  onClick={() => {
                    setClaudeKey(claudeKeyDraft.trim());
                    setClaudeConnected(true);
                    setClaudeKeyDraft('');
                    setShowClaudeRow(false);
                    setMessages((current) => [
                      ...current,
                      { id: nextMessageId(), role: 'note', text: 'Connected — prompts now run through your Claude account (claude-sonnet-5). Falls back to the local planner if the call fails.' }
                    ]);
                  }}
                  className="rounded-lg bg-primary-fill px-2.5 py-1.5 text-[12px] font-semibold text-neutral-onFill disabled:opacity-50"
                >
                  Save
                </button>
                {claudeConnected ? (
                  <button
                    type="button"
                    onClick={() => {
                      setClaudeKey(null);
                      setClaudeConnected(false);
                      setShowClaudeRow(false);
                      setMessages((current) => [
                        ...current,
                        { id: nextMessageId(), role: 'note', text: 'Disconnected — back to the local planner.' }
                      ]);
                    }}
                    className="rounded-lg px-2 py-1.5 text-[12px] text-neutral-mediumOnSurface hover:bg-neutral-surface2"
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
              <p className="mt-1.5 text-[10px] leading-[14px] text-neutral-lowOnSurface">
                Your API key is stored only in this browser and sent straight to Anthropic — never to our servers or the repo.
              </p>
            </div>
          ) : null}
          <AiEditorPanel
            isBusy={isPlanning}
            messages={messages}
            pendingPlanId={pendingPlanId}
            onSubmit={runAgent}
            selectedClip={selectedClipMeta}
            onClearSelection={() => setSelectedClipId(null)}
            onUpload={uploadAssets}
            onSubmitIntake={submitIntake}
            onAnswer={answerQuestion}
            onApply={applyPlan}
            onDiscard={discardPlan}
            onRestore={restoreVersion}
          />
            </>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {/* 中：素材面板 */}
            <section className="flex w-[380px] shrink-0 flex-col border-r border-solid border-neutral-fillLow bg-neutral-surface">
              <div className="flex shrink-0 items-center gap-4 border-b border-solid border-neutral-fillLow px-4 pt-3">
                {(
                  [
                    ['assets', 'My assets'],
                    ['library', 'Library'],
                    ['transcript', 'Transcript']
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAssetsTab(key)}
                    className={clsx(
                      'border-b-2 border-solid pb-2 text-[11px] font-semibold uppercase tracking-wide transition-colors',
                      assetsTab === key
                        ? 'border-primary-fill text-neutral-highOnSurface'
                        : 'border-transparent text-neutral-lowOnSurface hover:text-neutral-mediumOnSurface'
                    )}
                  >
                    {label}
                  </button>
                ))}
                <span className="flex-1" />
                <button
                  type="button"
                  title="Upload media (demo)"
                  className="mb-1 flex size-7 items-center justify-center rounded-md text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
                >
                  <KsIconUpload size={14} />
                </button>
              </div>

              {assetsTab === 'assets' ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="shrink-0 px-4 py-3">
                    <label className="flex items-center gap-2 rounded-lg bg-neutral-surface1 px-2.5 py-1.5">
                      <KsIconSearch size={13} className="shrink-0 text-neutral-lowOnSurface" />
                      <input
                        value={assetSearch}
                        placeholder="Search"
                        onChange={(event) => setAssetSearch(event.target.value)}
                        className="w-full bg-transparent text-[12px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface"
                      />
                    </label>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                    <div className="grid grid-cols-6 gap-2">
                      {visibleAssets.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            setDragAssetId(asset.id);
                            event.dataTransfer.effectAllowed = 'copy';
                          }}
                          onDragEnd={() => setDragAssetId(null)}
                          title={
                            asset.kind === 'graphics'
                              ? `Select “${asset.name}” on the timeline to keep editing it`
                              : `Add “${asset.name}” to the end of the video track`
                          }
                          onClick={() => addAssetToTimeline(asset)}
                          className="text-left"
                        >
                          <span className="relative block aspect-square overflow-hidden rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface2 transition-transform hover:-translate-y-0.5">
                            {asset.kind === 'image' ? (
                              <img src={asset.url} alt={asset.name} className="size-full object-cover" />
                            ) : asset.kind === 'video' ? (
                              <video src={asset.url} muted playsInline preload="metadata" className="size-full object-cover" />
                            ) : (
                              <span className="flex size-full flex-col justify-end bg-neutral-fillHigh p-1.5">
                                <span className="line-clamp-3 text-left text-[9px] font-extrabold uppercase leading-[11px] text-neutral-onFill">
                                  {asset.preview}
                                </span>
                              </span>
                            )}
                            {asset.kind === 'video' ? (
                              <span className="absolute bottom-1 right-1 rounded bg-neutral-fillHigh/70 px-1 text-[9px] text-neutral-onFill">
                                ▶
                              </span>
                            ) : null}
                            {asset.kind === 'graphics' ? (
                              <span className="absolute right-1 top-1 rounded bg-primary-fill px-1 text-[8px] font-bold text-neutral-onFill">
                                FX
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 block truncate text-[11px] text-neutral-mediumOnSurface">{asset.name}</span>
                        </button>
                      ))}
                    </div>
                    {visibleAssets.length === 0 ? (
                      <p className="mt-6 text-center text-[12px] text-neutral-lowOnSurface">
                        No assets match “{assetSearch}”.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : assetsTab === 'library' ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
                  <KsIconFolder size={22} className="text-neutral-lowOnSurface" />
                  <p className="text-[12px] text-neutral-mediumOnSurface">
                    The brand library connects here in the full product.
                  </p>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  {captionCues.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {captionCues.map((cue) => (
                        <li key={cue.id}>
                          <button
                            type="button"
                            title="Jump to this line"
                            onClick={() => seekTo(cue.start)}
                            className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-surface1"
                          >
                            <span className="shrink-0 text-[11px] tabular-nums text-neutral-lowOnSurface">
                              {formatTime(cue.start).slice(0, 5)}
                            </span>
                            <span className="text-[12px] leading-[17px] text-neutral-highOnSurface">{cue.text}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-6 text-center text-[12px] text-neutral-lowOnSurface">
                      Add subtitles and the transcript shows up here.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* 右：预览 Viewer */}
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
                <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
                  Viewer
                </span>
                {videoUrl ? (
                  <button
                    type="button"
                    data-pen-toggle
                    title={isPenMode ? 'Exit draw mode (Esc)' : 'Draw an area, then describe the change'}
                    onClick={() => (isPenMode ? exitPenMode() : setIsPenMode(true))}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors',
                      isPenMode
                        ? 'bg-primary-fill text-neutral-onFill'
                        : 'text-neutral-mediumOnSurface hover:bg-neutral-surface2'
                    )}
                  >
                    {isPenMode ? <KsIconClose size={13} /> : <KsIconPen size={13} />}
                    {isPenMode ? 'Exit draw mode' : 'Draw to edit'}
                  </button>
                ) : null}
              </div>
              {isPenMode && !drawnPath ? (
                <p className="shrink-0 px-4 pt-2 text-[11px] text-neutral-lowOnSurface">
                  Draw around the part you want to change — e.g. circle the shoes. Press Esc to exit draw mode.
                </p>
              ) : null}

          <div ref={previewAreaRef} className="relative flex min-h-0 flex-1 items-center justify-center p-6">

            {/* 来源节点带视频就直接放它，点画面或用下方走带都能播放/暂停；否则退回占位块 */}
            {videoUrl ? (
              <div
                ref={frameRef}
                data-preview-frame={previewFormat}
                className={clsx(
                  'relative flex h-full max-h-full items-center justify-center overflow-hidden rounded-xl bg-neutral-fillHigh',
                  // 画幅超出原始 9:16 的部分由 AI 扩画补齐，先用渐变示意；待确认时画虚线框
                  previewFormat !== '9:16' && 'bg-gradient-to-r from-primary-surface3/60 via-neutral-fillHigh to-primary-surface3/60',
                  pendingFormat && pendingFormat !== format && 'border border-dashed border-primary-fill'
                )}
                style={{ aspectRatio: FORMAT_ASPECT[previewFormat], containerType: 'inline-size' }}
              >
                <video
                  key={videoUrl}
                  ref={videoRef}
                  src={videoUrl}
                  poster={posterUrl}
                  playsInline
                  preload="metadata"
                  title={isPlaying ? `Pause ${sourceLabel}` : `Play ${sourceLabel}`}
                  onLoadedMetadata={handleMetadata}
                  onError={() => seedFromMedia(FALLBACK_MEDIA_SECONDS)}
                  onClick={() => setIsPlaying((playing) => !playing)}
                  className="size-full cursor-pointer object-contain"
                />
                {/* 静帧片段（片尾卡、产品图）盖在视频之上 */}
                {activeStillUrl ? (
                  <img
                    data-still-overlay
                    src={activeStillUrl}
                    alt={active?.clip.label ?? ''}
                    className="pointer-events-none absolute inset-0 size-full object-cover"
                  />
                ) : null}
                {/* 圈选调色蒙版：mix-blend color 只换色相，画面细节保留 */}
                {previewRegions.map((region) => {
                  const bounds = pathBounds(region.path);
                  return (
                    <svg
                      key={region.id}
                      data-region-overlay={region.pending ? 'pending' : 'applied'}
                      data-region-blend={region.blend}
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="pointer-events-none absolute inset-0 size-full"
                    >
                      <defs>
                        <clipPath id={`mask-${region.id}`} clipPathUnits="userSpaceOnUse">
                          <path d={region.path} />
                        </clipPath>
                      </defs>
                      {/* 生成的画面只贴在蒙版里；recolor 用 color 混合保留原有明暗 */}
                      <image
                        href={region.patchUrl}
                        x={bounds.x}
                        y={bounds.y}
                        width={bounds.width}
                        height={bounds.height}
                        preserveAspectRatio="none"
                        clipPath={`url(#mask-${region.id})`}
                        style={{ mixBlendMode: region.blend === 'color' ? 'color' : 'normal' }}
                      />
                      {region.pending ? (
                        <path d={region.path} fill="none" stroke="#ffffff" strokeWidth={0.55} strokeDasharray="2.4 1.6" />
                      ) : null}
                    </svg>
                  );
                })}
                {/* 正在画/画好待指令的轨迹 */}
                {penPoints || drawnPath ? (
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="pointer-events-none absolute inset-0 size-full"
                  >
                    <path
                      d={penPoints ? penPathFrom(penPoints) : drawnPath ?? ''}
                      fill="#2f6bff"
                      fillOpacity={0.12}
                      stroke="#ffffff"
                      strokeWidth={0.55}
                      strokeDasharray="2 1.4"
                    />
                  </svg>
                ) : null}
                {/* 动态图形卖点：大标题 + 展开细线 + 角标 + 进度条，跟着播放头切换 */}
                {graphicsCues.length > 0 ? (
                  <span data-graphics-overlay className="pointer-events-none absolute inset-0">
                    {/* 画面亮的时候白字会糊，压一层自下而上的暗角 */}
                    <span className="absolute inset-x-0 bottom-0 top-1/3 bg-gradient-to-t from-black/45 via-black/20 to-transparent" />
                    {graphicsCues.map(({ clip, index, total }) => {
                      const g = clip.graphic ?? { kind: 'headline' as const };
                      const scale = g.scale ?? 1;
                      const fg = g.fg ?? '#ffffff';
                      const accent = g.accent ?? '#ffffff';
                      const y = g.y;
                      if (g.kind === 'lower-third') {
                        return (
                          <span key={clip.id} className="absolute inset-x-0 block px-4" style={{ top: `${y ?? 76}%` }}>
                            <span className="block h-px w-7 origin-left animate-rule-in" style={{ background: accent }} />
                            <span className="mt-2 block animate-graphic-in font-medium uppercase" style={{ color: fg, fontSize: 12.5 * scale, lineHeight: 1.3, letterSpacing: '0.09em' }}>
                              {clip.text}
                            </span>
                          </span>
                        );
                      }
                      if (g.kind === 'banner') {
                        return (
                          <span key={clip.id} className="absolute inset-x-0 flex justify-center px-4" style={{ top: `${y ?? 80}%` }}>
                            <span
                              className="flex max-w-full animate-graphic-in items-center gap-2.5 border border-solid px-3.5 py-2"
                              style={{ background: g.bg ?? 'rgba(8,7,6,0.55)', borderColor: `${accent}59`, backdropFilter: 'blur(6px)' }}
                            >
                              <span className="min-w-0 truncate font-medium uppercase" style={{ color: fg, fontSize: 10 * scale, letterSpacing: '0.24em' }}>
                                {clip.text}
                              </span>
                              {g.cta ? (
                                <span
                                  className="shrink-0 whitespace-nowrap border border-solid px-2.5 py-1 font-semibold uppercase"
                                  style={{ borderColor: accent, color: accent, fontSize: 8.5 * scale, letterSpacing: '0.2em' }}
                                >
                                  {g.cta}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        );
                      }
                      if (g.kind === 'badge') {
                        return (
                          <span key={clip.id} className="absolute right-4 block animate-graphic-in" style={{ top: `${y ?? 12}%`, transform: 'rotate(-3deg)' }}>
                            <span className="block border border-solid px-3 py-1.5 text-center font-medium uppercase" style={{ background: g.bg ?? 'rgba(242,236,225,0.94)', borderColor: accent, color: g.bg ? fg : '#1b1713', fontSize: 9 * scale, letterSpacing: '0.18em' }}>
                              {clip.text}
                            </span>
                          </span>
                        );
                      }
                      if (g.kind === 'logo') {
                        return (
                          <span key={clip.id} className="absolute inset-x-0 block text-center" style={{ top: `${y ?? 42}%` }}>
                            {/* 字距会在末字后多出一格，textIndent 补回来才是光学居中 */}
                            <span className="block animate-graphic-in whitespace-nowrap font-light uppercase" style={{ color: fg, fontSize: 24 * scale, letterSpacing: '0.5em', textIndent: '0.5em' }}>
                              {clip.text}
                            </span>
                            {/* 小号 lockup（片尾卡副标）不画线，避免和主 logo 的下划线重复 */}
                            {scale >= 0.7 ? (
                              <span className="mx-auto mt-2.5 block h-px w-10 animate-rule-in" style={{ background: accent }} />
                            ) : null}
                          </span>
                        );
                      }
                      // headline（默认）：时装杂志式排版 —— 画面正中、最大字重的衬线大标题逐词从遮罩里升起
                      const words = (clip.text ?? '').split(/\s+/).filter(Boolean);
                      // 没有显式 y 时垂直居中；set-style 挪过位置后改用 top 定位，保持“往上/往下挪”的语义
                      const positioned = y == null
                        ? { top: '50%', transform: 'translateY(-50%)' }
                        : { top: `${y}%` };
                      return (
                        <span key={clip.id} className="absolute inset-x-0 block" style={positioned}>
                          {total > 1 ? (
                            <span className="flex items-center gap-2 px-4">
                              <span className="animate-hud-in text-[8px] font-medium tabular-nums tracking-[0.34em]" style={{ color: `${fg}b3` }}>
                                {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
                              </span>
                              <span className="h-px flex-1 animate-hud-in" style={{ background: `${fg}40` }} />
                              <span className="animate-hud-in text-[8px] font-medium uppercase tracking-[0.34em]" style={{ color: `${fg}b3` }}>
                                Details
                              </span>
                            </span>
                          ) : null}
                          <span
                            className="mt-3 block px-3 text-center uppercase"
                            style={{
                              color: fg,
                              // cqw 跟画幅宽度走：常规预览下相当于 ~72–80px 的成片字号，上限 80px
                              fontSize: `min(${13 * scale}cqw, ${80 * scale}px)`,
                              lineHeight: 1.04,
                              letterSpacing: '-0.01em',
                              fontWeight: 900,
                              fontFamily: "'Playfair Display', Didot, Georgia, 'Times New Roman', serif"
                            }}
                          >
                            {words.map((word, wordIndex) => (
                              <Fragment key={wordIndex}>
                                {/* 每个词包一层 overflow-hidden 遮罩，词从遮罩下缘升起，逐词错峰 */}
                                <span className="inline-block max-w-full overflow-hidden align-bottom pb-[0.08em] pr-[0.05em]">
                                  <span
                                    className="inline-block animate-mask-up"
                                    style={{
                                      animationDelay: `${0.12 + wordIndex * 0.11}s`,
                                      // 末词转斜体，衬线大标题里混一笔 italic 是杂志排版的惯用对比
                                      ...(words.length > 1 && wordIndex === words.length - 1 ? { fontStyle: 'italic' } : {})
                                    }}
                                  >
                                    {word}
                                  </span>
                                </span>
                                {wordIndex < words.length - 1 ? ' ' : null}
                              </Fragment>
                            ))}
                          </span>
                          <span
                            className="mx-auto mt-3 block h-px w-12 animate-rule-in"
                            style={{ background: accent, animationDelay: `${0.2 + words.length * 0.11}s` }}
                          />
                        </span>
                      );
                    })}
                  </span>
                ) : null}
                {/* 字幕叠层：跟着播放头换行；双击直接进入该条字幕的内联编辑 */}
                {captionText ? (
                  <span
                    data-caption-overlay
                    title="Double-click to edit this caption"
                    onDoubleClick={() => {
                      const clip = activeCaptionClip(tracks, currentTime);
                      if (clip) {
                        setEditingCaptionId(clip.id);
                      }
                    }}
                    className="absolute inset-x-3 bottom-7 cursor-text text-center"
                  >
                    <span className="rounded-md bg-neutral-fillHigh/75 box-decoration-clone px-1.5 py-0.5 text-[13px] font-semibold leading-[22px] text-neutral-onFill">
                      {captionText}
                    </span>
                  </span>
                ) : null}
                {previewFormat !== '9:16' ? (
                  <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-neutral-fillHigh/70 px-1.5 py-0.5 text-[10px] font-medium text-neutral-onFill">
                    AI-extended · {previewFormat}
                  </span>
                ) : null}
                {/* 暂停时给个可点提示，播放时不挡画面 */}
                {!isPlaying ? (
                  <span className="pointer-events-none absolute flex size-14 items-center justify-center rounded-full bg-neutral-fillHigh/60 pl-1 text-[20px] text-neutral-onFill">
                    ▶
                  </span>
                ) : null}
                {/* pen 模式的捕获层，接管一切指针事件 */}
                {isPenMode ? (
                  <svg
                    data-pen-layer
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 size-full cursor-crosshair touch-none"
                    onPointerDown={startPenStroke}
                    onPointerMove={movePenStroke}
                    onPointerUp={endPenStroke}
                  >
                    <rect width="100" height="100" fill="transparent" style={{ pointerEvents: 'all' }} />
                  </svg>
                ) : null}
              </div>
            ) : posterUrl ? (
              <img
                src={posterUrl}
                alt={sourceLabel}
                className="h-full max-h-full rounded-xl bg-neutral-fillHigh object-contain"
              />
            ) : (
              <div className="flex h-full max-h-full w-[236px] items-center justify-center rounded-xl bg-gradient-to-br from-neutral-surface2 to-primary-surface2">
                <span className="text-[12px] font-medium text-neutral-mediumOnSurface">{sourceLabel}</span>
              </div>
            )}

            {/* 圈选弹层：贴着圈出来的区域，输入 + 快捷动作 */}
            {isPenMode && drawnPath && regionAnchor ? (
              <div
                data-region-popover
                style={{ left: regionAnchor.left, top: regionAnchor.top }}
                className="absolute z-30 w-[268px] -translate-x-1/2 overflow-hidden rounded-2xl border border-solid border-neutral-fillLow bg-neutral-surface shadow-[0_16px_40px_rgba(16,24,40,0.22)]"
              >
                <div className="flex items-center gap-1.5 px-2.5 py-2">
                  <button
                    type="button"
                    title="Upload a reference image"
                    onClick={() => regionFileRef.current?.click()}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
                  >
                    <KsIconPlus size={15} />
                  </button>
                  <input
                    ref={regionFileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      if (event.target.files?.length) {
                        uploadAssets(event.target.files);
                      }
                      event.target.value = '';
                    }}
                  />
                  <input
                    data-region-prompt
                    autoFocus
                    value={regionPrompt}
                    placeholder="Describe your idea"
                    onChange={(event) => setRegionPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        submitRegionPrompt();
                      } else if (event.key === 'Escape') {
                        closeRegionPopover();
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface"
                  />
                  <button
                    type="button"
                    title="Send"
                    disabled={!regionPrompt.trim() || isPlanning}
                    onClick={() => submitRegionPrompt()}
                    className={clsx(
                      'flex size-7 shrink-0 items-center justify-center rounded-full transition-colors',
                      regionPrompt.trim() && !isPlanning
                        ? 'bg-primary-fill text-neutral-onFill'
                        : 'bg-neutral-surface2 text-neutral-lowOnSurface'
                    )}
                  >
                    <KsIconSend size={13} />
                  </button>
                </div>

                <div className="border-t border-solid border-neutral-fillLow py-1">
                  {[...REGION_ACTIONS, ...(showMoreRegionActions ? REGION_ACTIONS_MORE : [])].map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      disabled={isPlanning}
                      onClick={() => submitRegionPrompt(action.prompt)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-neutral-highOnSurface transition-colors hover:bg-neutral-surface1 disabled:opacity-50"
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center text-neutral-mediumOnSurface">
                        {action.icon === 'variations' ? (
                          <KsIconCopyContent size={15} />
                        ) : action.icon === 'remove' ? (
                          <KsIconDelete size={15} />
                        ) : (
                          <KsIconAiGeneration size={15} />
                        )}
                      </span>
                      {action.label}
                    </button>
                  ))}
                  {!showMoreRegionActions ? (
                    <button
                      type="button"
                      onClick={() => setShowMoreRegionActions(true)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-neutral-lowOnSurface transition-colors hover:bg-neutral-surface1"
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <KsIconTips size={14} />
                      </span>
                      See more
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
            </section>
          </div>

          {/* 时间线区：横跨素材区与预览区下方 */}
          <div className="shrink-0 border-t border-solid border-neutral-fillLow bg-neutral-surface">
            <div className="flex items-center gap-2 border-b border-solid border-neutral-fillLow px-3 py-1.5">
              <span className="flex items-center gap-1.5 rounded-md bg-neutral-surface2 px-2.5 py-1 text-[11px] font-medium text-neutral-highOnSurface">
                <span className="size-1.5 rounded-full bg-primary-fill" />
                Main Timeline
              </span>
            </div>
            <div className="flex items-center gap-1 px-3 py-2">
              <button
                type="button"
                title={isPlaying ? 'Pause' : 'Play'}
                onClick={() => setIsPlaying((playing) => !playing)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-fillHigh text-[13px] text-neutral-onFill transition-opacity hover:opacity-85"
              >
                {isPlaying ? '❚❚' : '▶'}
              </button>
              <span className="ml-1.5 mr-2 shrink-0 text-[14px] font-medium tabular-nums text-neutral-highOnSurface">
                {formatTime(currentTime).slice(0, 5)}
                <span className="text-neutral-lowOnSurface"> / {formatTime(duration).slice(0, 5)}</span>
              </span>

              <ToolButton title="Jump to start" onClick={() => seekTo(0)}>
                ⏮
              </ToolButton>
              <ToolButton title="Jump to end" onClick={() => seekTo(duration)}>
                ⏭
              </ToolButton>
              <span className="mx-1 h-4 w-px bg-neutral-fillLow" />
              <ToolButton title="Split clip at playhead" onClick={splitSelectedClip}>
                <KsIconCut size={15} />
              </ToolButton>
              <ToolButton title="Duplicate clip" onClick={duplicateSelectedClip}>
                <KsIconCopyContent size={15} />
              </ToolButton>
              <ToolButton title="Delete clip (Delete)" onClick={deleteSelectedClip}>
                <KsIconDelete size={15} />
              </ToolButton>

              <span className="flex-1" />

              <div className="flex items-center gap-2">
                <KsIconZoomOut size={14} className="text-neutral-lowOnSurface" />
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={zoom}
                  title="Timeline zoom"
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="w-24 accent-primary-fill"
                />
                <KsIconZoomIn size={14} className="text-neutral-lowOnSurface" />
              </div>
            </div>

            {/* 轨道区固定高度：轨道多出来时纵向滚动，gutter 吸左、标尺吸顶不跟着跑 */}
            <div
              className="flex max-h-[272px] overflow-auto border-t border-solid border-neutral-fillLow"
              onDragOver={(event) => {
                if (dragAssetId) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                }
              }}
              onDrop={(event) => {
                if (!dragAssetId) {
                  return;
                }
                event.preventDefault();
                const asset = allAssets.find((item) => item.id === dragAssetId);
                setDragAssetId(null);
                if (asset) {
                  addAssetToTimeline(asset);
                }
              }}
            >
              {/* 轨道头 */}
              <div className="sticky left-0 z-30 w-[56px] shrink-0 border-r border-solid border-neutral-fillLow bg-neutral-surface">
                <div className="sticky top-0 z-10 h-8 border-b border-solid border-neutral-fillLow bg-neutral-surface" />
                {trackPreviews.map(({ track, isNewTrack }) => {
                  const Icon = TRACK_ICON[track.kind];
                  return (
                    <div
                      key={track.id}
                      title={`${TRACK_NAME[track.kind]} track`}
                      className={clsx(
                        'group relative flex h-[72px] items-center justify-center border-b border-solid border-neutral-fillLow',
                        isNewTrack && 'bg-success-fill/5'
                      )}
                    >
                      <span className={clsx(isNewTrack ? 'text-success-onSurface' : 'text-neutral-mediumOnSurface')}>
                        <Icon size={18} />
                      </span>
                      {/* 控件默认藏起来，保持 gutter 干净，hover 再露出来 */}
                      <div className="absolute inset-x-0 bottom-0 hidden justify-center gap-0.5 bg-neutral-surface/95 py-0.5 group-hover:flex">
                        <button
                          type="button"
                          title={track.visible ? 'Hide track' : 'Show track'}
                          onClick={() => toggleTrackFlag(track.id, 'visible')}
                          className={clsx(
                            'flex size-4 items-center justify-center rounded text-[9px]',
                            track.visible ? 'text-neutral-mediumOnSurface' : 'text-neutral-lowOnSurface opacity-50'
                          )}
                        >
                          👁
                        </button>
                        <button
                          type="button"
                          title={track.muted ? 'Unmute track' : 'Mute track'}
                          onClick={() => toggleTrackFlag(track.id, 'muted')}
                          className={clsx(
                            'flex size-4 items-center justify-center rounded',
                            track.muted ? 'text-neutral-lowOnSurface opacity-50' : 'text-neutral-mediumOnSurface'
                          )}
                        >
                          <KsIconSound size={10} />
                        </button>
                        <button
                          type="button"
                          title="Delete track"
                          onClick={() => deleteTrack(track.id)}
                          className="flex size-4 items-center justify-center rounded text-neutral-lowOnSurface transition-colors hover:text-error-fill"
                        >
                          <KsIconDelete size={10} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 标尺 + 轨道 */}
              <div className="relative min-w-0 flex-1">
                <div style={{ width: rulerSeconds * pxPerSecond }}>
                  <div
                    ref={rulerRef}
                    data-timeline-ruler
                    className={clsx(
                      'sticky top-0 z-20 h-8 touch-none border-b border-solid border-neutral-fillLow bg-neutral-surface',
                      isScrubbing ? 'cursor-grabbing' : 'cursor-grab'
                    )}
                    onPointerDown={startScrub}
                    onPointerMove={moveScrub}
                    onPointerUp={endScrub}
                    onPointerCancel={endScrub}
                  >
                    {Array.from({ length: rulerSeconds + 1 }, (_, second) => {
                      // 每 5 秒打标签，其余只画一根短刻度
                      const isMajor = second % 5 === 0;
                      return (
                        <span key={second}>
                          <span
                            className={clsx(
                              'absolute w-px bg-neutral-fillLow',
                              isMajor ? 'top-0 h-3' : 'top-0 h-1.5'
                            )}
                            style={{ left: second * pxPerSecond }}
                          />
                          {isMajor ? (
                            <span
                              className="absolute top-3.5 text-[11px] tabular-nums text-neutral-mediumOnSurface"
                              style={{ left: second * pxPerSecond + 5 }}
                            >
                              {`${String(Math.floor(second / 60)).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}`}
                            </span>
                          ) : null}
                        </span>
                      );
                    })}
                    {/* 播放头在标尺里的部分：把手 + 线段。标尺吸顶，纵向滚动时它们仍然可见可拖 */}
                    <span
                      className="pointer-events-none absolute inset-y-0 w-px bg-neutral-fillHigh"
                      style={{ left: currentTime * pxPerSecond }}
                    >
                      <span
                        data-playhead-handle
                        className={clsx(
                          'pointer-events-auto absolute -left-[7px] -top-0.5 block h-4 w-[15px] touch-none rounded-b-[3px] rounded-t-full border border-solid border-neutral-fillHigh bg-neutral-surface',
                          isScrubbing ? 'cursor-grabbing' : 'cursor-grab'
                        )}
                        onPointerDown={startScrub}
                        onPointerMove={moveScrub}
                        onPointerUp={endScrub}
                        onPointerCancel={endScrub}
                      />
                    </span>
                  </div>

                  {trackPreviews.map(({ track, clips }) => (
                    <div key={track.id} className="relative h-[72px] border-b border-solid border-neutral-fillLow">
                      {clips.map(({ clip, status }) => {
                        // 内联编辑态：input 不能嵌在 button 里，换成同样式的 div
                        if (editingCaptionId === clip.id) {
                          return (
                            <div
                              key={`${clip.id}-editing`}
                              className="absolute top-2 z-10 flex h-[56px] flex-col overflow-hidden rounded-lg border border-primary-fill bg-primary-surface2"
                              style={{ left: clip.start * pxPerSecond, width: Math.max(120, clip.duration * pxPerSecond) }}
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              <span className="truncate px-1.5 pt-1 text-[10px] font-medium text-neutral-highOnSurface">
                                {clip.label}
                              </span>
                              <input
                                autoFocus
                                defaultValue={clip.text ?? ''}
                                title="Edit caption text"
                                onFocus={(event) => event.target.select()}
                                onBlur={(event) => commitCaptionText(clip.id, event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    commitCaptionText(clip.id, event.currentTarget.value);
                                  } else if (event.key === 'Escape') {
                                    setEditingCaptionId(null);
                                  }
                                }}
                                className="mx-1.5 mb-1 mt-auto rounded border border-solid border-primary-fill/40 bg-neutral-surface px-1 py-0.5 text-[10px] italic text-neutral-highOnSurface outline-none"
                              />
                            </div>
                          );
                        }
                        return (
                        <button
                          key={`${clip.id}-${status}`}
                          type="button"
                          title={
                            status === 'removed'
                              ? `${clip.label} — will be removed`
                              : track.kind === 'caption' && clip.text
                                ? `${clip.label} — double-click to edit the caption`
                                : clip.label
                          }
                          // 幽灵块只是预览，不参与选中
                          disabled={status === 'removed'}
                          onClick={() => setSelectedClipId(clip.id)}
                          onDoubleClick={() => {
                            // 只有真实存在的字幕片段可编辑；预览中的幽灵/新增块不行
                            if (track.kind === 'caption' && clip.text && status === 'unchanged') {
                              setEditingCaptionId(clip.id);
                            }
                          }}
                          className={clsx(
                            'absolute top-2 flex h-[56px] flex-col overflow-hidden rounded-lg border text-left transition-colors',
                            status === 'unchanged' && selectedClipId === clip.id
                              ? 'border-primary-fill bg-primary-surface2'
                              : status === 'unchanged'
                                ? TRACK_TONE[track.kind]
                                : DIFF_CLASS[status],
                            !track.visible && 'opacity-40'
                          )}
                          style={{ left: clip.start * pxPerSecond, width: Math.max(24, clip.duration * pxPerSecond) }}
                        >
                          <span
                            className={clsx(
                              'truncate px-1.5 pt-1 text-[10px] font-medium text-neutral-highOnSurface',
                              status === 'removed' && 'line-through'
                            )}
                          >
                            {clip.label}
                          </span>
                          {clip.text ? (
                            <span className="truncate px-1.5 text-[9px] italic leading-[13px] text-neutral-mediumOnSurface">
                              “{clip.text}”
                            </span>
                          ) : null}
                          {clip.hasAudio ? (
                            <span className="mt-auto flex h-4 items-end gap-px px-1 pb-1">
                              {Array.from({ length: 24 }, (_, bar) => (
                                <span
                                  key={bar}
                                  className="flex-1 rounded-sm bg-primary-fill/40"
                                  style={{ height: `${30 + ((bar * 37) % 70)}%` }}
                                />
                              ))}
                            </span>
                          ) : null}
                        </button>
                        );
                      })}
                    </div>
                  ))}

                  {/* 播放头竖线（把手在吸顶的标尺里） */}
                  <div
                    className="pointer-events-none absolute top-0 z-10 h-full w-px bg-neutral-fillHigh"
                    style={{ left: currentTime * pxPerSecond }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default TimelineEditor;
