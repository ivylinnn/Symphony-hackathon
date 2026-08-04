import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeCategory,
  CanvasNodeKind,
  LibraryAsset,
  NodeBodyShape,
  NodePortSpec,
  IntakeField,
  TimelineTrack
} from './types';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
export const ZOOM_STEP = 1.15;

/** 世界坐标下的点阵间距，缩放时按 zoom 等比放大。 */
export const GRID_SIZE = 24;

export const NODE_DEFAULT_WIDTH = 264;

/** 手动缩放节点时的下限，避免拖成看不见的一条。 */
export const MIN_NODE_WIDTH = 200;
export const MIN_NODE_HEIGHT = 120;

/** 端口行高，输入/输出行以卡片竖直中线为基准均分排布。 */
export const PORT_ROW_HEIGHT = 26;

/** fitView 时四周留白（屏幕像素）。 */
export const FIT_VIEW_PADDING = 80;

interface NodeKindConfig {
  category: CanvasNodeCategory;
  label: string;
  /** 卡片主体形态。 */
  body: NodeBodyShape;
  /**
   * 卡片高度。
   * 连线端点和 fitView 都要在渲染前拿到高度，所以固定而非实测 DOM，
   * 改动卡片内部结构时要同步这里。
   */
  height: number;
  /** 左侧输入端口。 */
  inputs: NodePortSpec[];
  /** 右侧输出端口。 */
  outputs: NodePortSpec[];
  /** media 形态的占位底纹（tailwind 渐变 token）。 */
  placeholder?: string;
  /** text 形态的空态提示。 */
  hint?: string;
  /** 编辑类节点的能力说明，展示在 hover 卡片上。 */
  description?: string;
}

const TEXT_NODE_HEIGHT = 168;
/** 脚本卡：9:16 配图 + 描述文案，三张卡等高便于纵向对齐。 */
const SCRIPT_CARD_HEIGHT = 640;
const MEDIA_NODE_HEIGHT = 296;
const AUDIO_NODE_HEIGHT = 192;
const OPERATION_NODE_HEIGHT = 172;
const TIMELINE_NODE_HEIGHT = 192;
/** Storyboard：2 行 × 3 格，需要更大的画布空间。 */
/** 分镜落满 6 帧后的完整尺寸；模板/自动生成流程会显式覆盖到这个值。 */
export const STORYBOARD_READY_WIDTH = 1000;
export const STORYBOARD_READY_HEIGHT = 1250;
/** 手动新增的空分镜：小卡片 + 底部输入框，等用户输入后再长大。 */
export const STORYBOARD_EMPTY_WIDTH = 320;
const STORYBOARD_EMPTY_HEIGHT = 300;
const BATCH_NODE_HEIGHT = 220;

/** 生成类节点通用的输入组合，和 Flora 的 Prompt/Image/Video/Audio 一致。 */
const GENERATIVE_INPUTS: NodePortSpec[] = [
  { id: 'prompt', label: 'Prompt', type: 'prompt', max: 1 },
  { id: 'image', label: 'Image', type: 'image', max: 9 },
  { id: 'video', label: 'Video', type: 'video', max: 3 },
  { id: 'audio', label: 'Audio', type: 'audio', max: 3 }
];

const TEXT_ONLY_INPUT: NodePortSpec[] = [{ id: 'prompt', label: 'Prompt', type: 'prompt', max: 1 }];

export const NODE_KIND_CONFIG: Record<CanvasNodeKind, NodeKindConfig> = {
  // —— Ads-native：一条广告的脚本结构 ——
  hook: {
    category: 'ads-native',
    label: 'Hook',
    body: 'script-card',
    height: SCRIPT_CARD_HEIGHT,
    hint: 'Opening line that stops the scroll…',
    inputs: TEXT_ONLY_INPUT,
    outputs: [{ id: 'out', label: 'Text', type: 'prompt' }]
  },
  body: {
    category: 'ads-native',
    label: 'Body',
    body: 'script-card',
    height: SCRIPT_CARD_HEIGHT,
    hint: 'Main message, product value, proof…',
    inputs: TEXT_ONLY_INPUT,
    outputs: [{ id: 'out', label: 'Text', type: 'prompt' }]
  },
  cta: {
    category: 'ads-native',
    label: 'CTA',
    body: 'script-card',
    height: SCRIPT_CARD_HEIGHT,
    hint: 'Closing call to action…',
    inputs: TEXT_ONLY_INPUT,
    outputs: [{ id: 'out', label: 'Text', type: 'prompt' }]
  },

  // —— Inspiration：围绕 Top Ads 趋势复刻的输入件与分镜 ——
  'product-images': {
    category: 'inspiration',
    label: 'Product images',
    body: 'product-images',
    height: 300,
    description: 'Product shots that ground the remake in your own catalog — up to 20 images.',
    inputs: [],
    outputs: [{ id: 'out', label: 'Images', type: 'image' }]
  },
  'brand-kit': {
    category: 'inspiration',
    label: 'Brand kit',
    body: 'brand-kit',
    height: 310,
    description: 'Logo, colors and type — upload from your computer or pick from the library.',
    inputs: [],
    outputs: [{ id: 'out', label: 'Brand assets', type: 'image' }]
  },
  'product-brief': {
    category: 'inspiration',
    label: 'Product brief',
    body: 'product-brief',
    height: 440,
    description: 'Who the product is for and what the ad must say.',
    inputs: [{ id: 'image', label: 'Images', type: 'image', max: 20 }],
    outputs: [{ id: 'out', label: 'Brief', type: 'prompt' }]
  },
  'tiktok-trend': {
    category: 'inspiration',
    label: 'TikTok trend',
    body: 'tiktok-trend',
    height: 500,
    description: 'The Top Ads trend being replicated, with its creative formula.',
    inputs: [],
    outputs: [{ id: 'out', label: 'Trend video', type: 'video' }]
  },
  'audio-clips': {
    category: 'inspiration',
    label: 'Audio Clips Generation',
    body: 'audio-clips',
    height: 310,
    description: 'ElevenLabs voiceover clips generated from the connected brief, one clip per storyboard frame.',
    inputs: [{ id: 'prompt', label: 'Prompt', type: 'prompt', max: 1 }],
    outputs: [{ id: 'out', label: 'Audio', type: 'audio' }]
  },
  storyboard: {
    category: 'inspiration',
    label: 'Storyboard',
    body: 'storyboard',
    height: STORYBOARD_EMPTY_HEIGHT,
    description: 'Scene-by-scene plan with voiceover, drafted from every connected input.',
    inputs: [
      // Hook / Body / CTA 三段脚本都接这里，上限放到 4
      { id: 'prompt', label: 'Script', type: 'prompt', max: 4 },
      { id: 'image', label: 'Image', type: 'image', max: 9 },
      { id: 'video', label: 'Video', type: 'video', max: 3 }
    ],
    outputs: [{ id: 'out', label: 'Plan', type: 'prompt' }]
  },

  // —— Creative：素材形态 ——
  text: {
    category: 'creative',
    label: 'Text',
    body: 'text',
    height: TEXT_NODE_HEIGHT,
    hint: 'Describe what you want to generate…',
    inputs: TEXT_ONLY_INPUT,
    outputs: [{ id: 'out', label: 'Text', type: 'prompt' }]
  },
  image: {
    category: 'creative',
    label: 'Image',
    body: 'media',
    height: MEDIA_NODE_HEIGHT,
    placeholder: 'bg-gradient-to-br from-primary-surface2 to-neutral-surface2',
    inputs: GENERATIVE_INPUTS,
    outputs: [{ id: 'out', label: 'Image', type: 'image' }]
  },
  video: {
    category: 'creative',
    label: 'Video',
    body: 'media',
    height: MEDIA_NODE_HEIGHT,
    placeholder: 'bg-gradient-to-br from-neutral-surface2 to-primary-surface2',
    inputs: GENERATIVE_INPUTS,
    outputs: [{ id: 'out', label: 'Video', type: 'video' }]
  },
  audio: {
    category: 'creative',
    label: 'Audio',
    body: 'audio',
    height: AUDIO_NODE_HEIGHT,
    inputs: [
      { id: 'prompt', label: 'Prompt', type: 'prompt', max: 1 },
      { id: 'audio', label: 'Audio', type: 'audio', max: 3 }
    ],
    outputs: [{ id: 'out', label: 'Audio', type: 'audio' }]
  },
  avatar: {
    category: 'creative',
    label: 'Avatar',
    body: 'media',
    height: MEDIA_NODE_HEIGHT,
    placeholder: 'bg-gradient-to-br from-primary-surface2 to-primary-surface3',
    inputs: [
      { id: 'prompt', label: 'Prompt', type: 'prompt', max: 1 },
      { id: 'image', label: 'Image', type: 'image', max: 4 },
      { id: 'audio', label: 'Audio', type: 'audio', max: 1 }
    ],
    outputs: [{ id: 'out', label: 'Video', type: 'video' }]
  },
  import: {
    category: 'creative',
    label: 'Import',
    body: 'text',
    height: TEXT_NODE_HEIGHT,
    hint: 'Drop a file or pick from Library…',
    inputs: [],
    outputs: [{ id: 'out', label: 'Asset', type: 'image' }]
  },

  // —— Edit：对已有素材做拆分加工，多输出 ——
  'split-av': {
    category: 'edit',
    label: 'Split A/V',
    body: 'operation',
    height: OPERATION_NODE_HEIGHT,
    description: 'Extract the audio track from a video and produce a muted video alongside it.',
    inputs: [{ id: 'video', label: 'Video', type: 'video', max: 1 }],
    outputs: [
      { id: 'video', label: 'Video', type: 'video' },
      { id: 'audio', label: 'Audio', type: 'audio' }
    ]
  },
  'split-tracks': {
    category: 'edit',
    label: 'Split Tracks',
    body: 'operation',
    height: OPERATION_NODE_HEIGHT,
    description: 'Separate one audio input into BGM and individual voiceover tracks.',
    inputs: [{ id: 'audio', label: 'Audio', type: 'audio', max: 1 }],
    outputs: [
      { id: 'bgm', label: 'BGM', type: 'audio' },
      { id: 'vo-1', label: 'Voiceover 1', type: 'audio' },
      { id: 'vo-2', label: 'Voiceover 2', type: 'audio' }
    ]
  },
  timeline: {
    category: 'edit',
    label: 'Timeline',
    body: 'timeline',
    height: TIMELINE_NODE_HEIGHT,
    description: 'Trim & edit video, audio, images on a multi-track timeline.',
    inputs: [
      { id: 'video', label: 'Video', type: 'video', max: 8 },
      { id: 'image', label: 'Image', type: 'image', max: 8 },
      { id: 'audio', label: 'Audio', type: 'audio', max: 4 }
    ],
    outputs: [{ id: 'out', label: 'Video', type: 'video' }]
  },
  batch: {
    category: 'edit',
    label: 'Batch',
    body: 'batch',
    height: BATCH_NODE_HEIGHT,
    description: 'Process multiple items at once — generate variations and scale in one step.',
    inputs: [
      { id: 'image', label: 'Image', type: 'image' },
      { id: 'video', label: 'Video', type: 'video' },
      { id: 'prompt', label: 'Prompt', type: 'prompt' }
    ],
    outputs: [{ id: 'out', label: 'Items', type: 'image' }]
  }
};

/** Batch 卡片上的示例条目，接真实批处理后替换为已连入的素材。 */
export const BATCH_PREVIEW_ITEMS = [
  'Flat Lay Fashion 2, 2',
  'Menswear Outfit Grid 2, 1',
  'Fashion Flat Lay 2, 3',
  'High Fashion Flat Lays 1, 1'
];

/** Timeline 编辑器的示例轨道数据。 */
export const INITIAL_TIMELINE_TRACKS: TimelineTrack[] = [
  {
    id: 'track-1',
    kind: 'video',
    visible: true,
    muted: false,
    clips: [
      { id: 'clip-1', label: 'Video 9: Merge Audio into Video', start: 0, duration: 3.08, hasAudio: true },
      { id: 'clip-2', label: 'Street b-roll', start: 3.3, duration: 2.4, hasAudio: false }
    ]
  },
  {
    id: 'track-2',
    kind: 'audio',
    visible: true,
    muted: false,
    clips: [{ id: 'clip-3', label: 'Brand BGM — upbeat', start: 0, duration: 5.7, hasAudio: true }]
  }
];

export const CATEGORY_LABEL: Record<CanvasNodeCategory, string> = {
  'ads-native': 'Ads-native',
  inspiration: 'Inspiration',
  creative: 'Creative',
  edit: 'Edit'
};

/** 工具栏分组顺序，也是新增节点的展示顺序。 */
export const CATEGORY_ORDER: CanvasNodeCategory[] = ['ads-native', 'inspiration', 'creative', 'edit'];

export const KINDS_BY_CATEGORY: Record<CanvasNodeCategory, CanvasNodeKind[]> = {
  'ads-native': ['hook', 'body', 'cta'],
  inspiration: ['product-images', 'brand-kit', 'product-brief', 'tiktok-trend', 'storyboard', 'audio-clips'],
  creative: ['text', 'image', 'video', 'audio', 'avatar', 'import'],
  edit: ['split-av', 'split-tracks', 'timeline', 'batch']
};

/**
 * 素材库示例数据。
 * 接入真实素材库接口后替换，节点侧不需要改动。
 */
export const LIBRARY_ASSETS: LibraryAsset[] = [
  { id: 'asset-1', name: 'Serum bottle — studio', kind: 'image', meta: 'PNG · 1080×1920' },
  { id: 'asset-2', name: 'Serum bottle — wet stone', kind: 'image', meta: 'PNG · 1080×1920' },
  { id: 'asset-3', name: 'Unboxing b-roll', kind: 'video', meta: 'MP4 · 0:12' },
  { id: 'asset-4', name: 'Street scene b-roll', kind: 'video', meta: 'MP4 · 0:08' },
  { id: 'asset-5', name: 'Brand BGM — upbeat', kind: 'audio', meta: 'MP3 · 0:30' },
  { id: 'asset-6', name: 'UGC presenter — Mia', kind: 'avatar', meta: 'Avatar · licensed' }
];

/**
 * 首屏示例图：Hook → Body → CTA 串成脚本骨架，各自挂素材节点。
 * 真接入生成能力后应替换为后端返回的节点数据。
 */
export const INITIAL_NODES: CanvasNode[] = [
  {
    id: 'node-hook-1',
    kind: 'hook',
    x: 0,
    y: 0,
    width: NODE_DEFAULT_WIDTH,
    title: 'Hook',
    text: 'POV: your 10-step routine just became one bottle.',
    status: 'done'
  },
  {
    id: 'node-body-1',
    kind: 'body',
    x: 0,
    y: 220,
    width: NODE_DEFAULT_WIDTH,
    title: 'Body',
    text: 'Clinically tested hydration that lasts 72 hours — on wet stone, morning light, cinematic product shot.',
    status: 'done'
  },
  {
    id: 'node-cta-1',
    kind: 'cta',
    x: 0,
    y: 440,
    width: NODE_DEFAULT_WIDTH,
    title: 'CTA',
    text: 'Shop the bundle — 20% off today.',
    status: 'idle'
  },
  {
    id: 'node-image-1',
    kind: 'image',
    x: 440,
    y: -60,
    width: NODE_DEFAULT_WIDTH,
    title: 'Product hero',
    status: 'done'
  },
  {
    id: 'node-avatar-1',
    kind: 'avatar',
    x: 440,
    y: 250,
    width: NODE_DEFAULT_WIDTH,
    title: 'UGC presenter',
    status: 'generating'
  },
  {
    id: 'node-video-1',
    kind: 'video',
    x: 880,
    y: 80,
    width: NODE_DEFAULT_WIDTH,
    title: 'Final cut',
    status: 'done'
  },
  {
    id: 'node-split-1',
    kind: 'split-av',
    x: 1320,
    y: 120,
    width: NODE_DEFAULT_WIDTH,
    title: 'Split A/V',
    status: 'idle'
  },
  {
    id: 'node-tracks-1',
    kind: 'split-tracks',
    x: 1320,
    y: 340,
    width: NODE_DEFAULT_WIDTH,
    title: 'Split Tracks',
    status: 'idle'
  }
];

export const INITIAL_EDGES: CanvasEdge[] = [
  { id: 'edge-1', source: 'node-hook-1', sourceOutput: 'out', target: 'node-image-1', targetInput: 'prompt' },
  { id: 'edge-2', source: 'node-body-1', sourceOutput: 'out', target: 'node-avatar-1', targetInput: 'prompt' },
  { id: 'edge-3', source: 'node-image-1', sourceOutput: 'out', target: 'node-video-1', targetInput: 'image' },
  { id: 'edge-4', source: 'node-avatar-1', sourceOutput: 'out', target: 'node-video-1', targetInput: 'video' },
  { id: 'edge-5', source: 'node-video-1', sourceOutput: 'out', target: 'node-split-1', targetInput: 'video' },
  { id: 'edge-6', source: 'node-split-1', sourceOutput: 'audio', target: 'node-tracks-1', targetInput: 'audio' }
];

/**
 * 打开编辑器时先问清的几件事：素材完整度、投放平台、切几条、每条多长、要什么包装。
 * 答案会被组合成一份复合编辑计划，而不是只当作一句 prompt。
 */
export const INTAKE_FIELDS: IntakeField[] = [
  {
    id: 'source',
    label: 'Is this the full video, or part of a longer recording?',
    kind: 'single',
    required: true,
    options: ['This is the full video', 'This is a clip — I have more footage to upload']
  },
  {
    id: 'clipCount',
    label: 'How many short clips do you want to create?',
    kind: 'text',
    placeholder: 'e.g. 3'
  },
  {
    id: 'targetLength',
    label: 'Target length per clip',
    kind: 'single',
    required: true,
    options: ['~15 seconds', '~30 seconds', '~60 seconds', '~90 seconds']
  },
  {
    id: 'packaging',
    label: 'What packaging do you want on each clip? (multi-select)',
    kind: 'multi',
    options: ['Captions', 'Title text overlay', 'Background music', 'Light motion graphics', 'Other'],
    followUp: {
      whenOption: 'Light motion graphics',
      id: 'graphicsBrief',
      label: 'What should the graphics say?',
      placeholder: 'e.g. breathable fabric, kangaroo pocket, built for movement'
    }
  }
];
