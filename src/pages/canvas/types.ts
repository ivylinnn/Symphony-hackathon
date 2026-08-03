/** 节点分类：广告原生结构件 / 灵感复刻件 / 通用创意素材件 / 编辑处理件。 */
export type CanvasNodeCategory = 'ads-native' | 'inspiration' | 'creative' | 'edit';

/** 广告原生节点，对应一条广告的脚本结构。 */
export type AdsNativeNodeKind = 'hook' | 'body' | 'cta';

/** 灵感复刻节点：围绕一条 Top Ads 趋势拆解出的输入件与分镜。 */
export type InspirationNodeKind =
  | 'product-images'
  | 'brand-kit'
  | 'product-brief'
  | 'tiktok-trend'
  | 'storyboard'
  | 'audio-clips';

/** 创意节点，对应素材形态。 */
export type CreativeNodeKind = 'text' | 'image' | 'video' | 'audio' | 'avatar' | 'import';

/** 编辑节点，对素材做拆分/加工/批处理，通常多输入或多输出。 */
export type EditNodeKind = 'split-av' | 'split-tracks' | 'timeline' | 'batch';

export type CanvasNodeKind = AdsNativeNodeKind | InspirationNodeKind | CreativeNodeKind | EditNodeKind;

/** 端口承载的数据类型，决定图标与连线校验。 */
export type PortType = 'prompt' | 'image' | 'video' | 'audio';

export interface NodePortSpec {
  /** 在所属节点内唯一。 */
  id: string;
  label: string;
  type: PortType;
  /** 输入端口的最大接入数；不填表示不限。 */
  max?: number;
}

/** 卡片主体的展示形态，决定 NodeCard 渲染哪一种 body。 */
export type NodeBodyShape =
  | 'text'
  | 'media'
  | 'audio'
  | 'operation'
  | 'batch'
  | 'timeline'
  | 'product-images'
  | 'brand-kit'
  | 'product-brief'
  | 'tiktok-trend'
  | 'storyboard'
  | 'audio-clips';

/** 时间线上的一段素材。 */
export interface TimelineClip {
  id: string;
  label: string;
  /** 在时间线上的起始秒与时长秒，渲染时按像素/秒换算。 */
  start: number;
  duration: number;
  /** 有音频的片段会额外画一条波形。 */
  hasAudio: boolean;
  /**
   * 片段引用的媒体地址。有值的片段才驱动预览播放，
   * 字幕/音乐这类没有画面的片段留空。
   */
  sourceUrl?: string;
  /** 引用素材的入点（秒）。裁剪头部、切分都会改这个值。 */
  sourceStart?: number;
  /**
   * 这段占用的素材原始长度（秒），缺省等于 duration。
   * 与 duration 的比值就是播放速度 —— 变速/贴合时长靠它表达。
   */
  sourceDuration?: number;
}

export interface TimelineTrack {
  id: string;
  kind: 'video' | 'audio';
  visible: boolean;
  muted: boolean;
  clips: TimelineClip[];
}

/**
 * AI 编辑计划里的一步原子操作。
 * 每一步都能单独应用/跳过，所以必须是自包含的、不依赖前一步结果的描述。
 */
export type TimelineEditOp =
  /** 重设片段的起点与时长，剪短、挪位、变速都走这一个。 */
  | { type: 'set-timing'; clipId: string; start: number; duration: number }
  /** 在绝对时间 at 处切开片段，后半段 id 加 `-b` 后缀。 */
  | { type: 'split'; clipId: string; at: number }
  | { type: 'delete'; clipId: string }
  | { type: 'add-clip'; trackId: string; clip: TimelineClip }
  | { type: 'add-track'; track: TimelineTrack }
  | { type: 'set-track-flag'; trackId: string; flag: 'visible' | 'muted'; value: boolean };

export interface TimelineEditOperation {
  id: string;
  /** 一句话说明这步做什么，展示在 plan 列表里。 */
  label: string;
  op: TimelineEditOp;
}

/** Agent 针对一句 prompt 提出的整套改动，应用前先在时间线上做 diff 预览。 */
export interface TimelineEditPlan {
  id: string;
  prompt: string;
  /** Agent 的一句话总结。 */
  summary: string;
  operations: TimelineEditOperation[];
}

/** 预览时每个片段相对原时间线的状态，决定轨道上画什么描边。 */
export type ClipDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface ClipPreview {
  clip: TimelineClip;
  status: ClipDiffStatus;
}

/** 一条轨道的预览：应用后的片段，外加按原位置回填的待删除片段。 */
export interface TrackPreview {
  track: TimelineTrack;
  isNewTrack: boolean;
  clips: ClipPreview[];
}

/** 节点生成状态，驱动卡片上的状态条展示。 */
export type CanvasNodeStatus = 'idle' | 'generating' | 'done';

export interface CanvasNode {
  id: string;
  kind: CanvasNodeKind;
  /** 世界坐标，不随缩放变化。 */
  x: number;
  y: number;
  width: number;
  /** 覆盖类型默认卡片高度（如 9:16 竖版视频卡）；缺省用 NODE_KIND_CONFIG 的值。 */
  height?: number;
  title: string;
  text?: string;
  status: CanvasNodeStatus;
  /** 运行产物地址（图/视频/音频）。 */
  assetUrl?: string;
  /** 可直接播放的视频地址；存在时 media 卡渲染 <video>，assetUrl 退化为封面。 */
  videoUrl?: string;
  /** 运行失败时的原因，展示在卡片上。 */
  error?: string;
  /** 补充说明，例如用到的模型名。 */
  note?: string;
}

export interface CanvasEdge {
  id: string;
  source: string;
  /** 源节点的输出端口 id。 */
  sourceOutput: string;
  target: string;
  /** 目标节点的输入端口 id。 */
  targetInput: string;
}

/** 画布视口：world → screen 的平移和缩放。 */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** 正在拖拽中的连线，松手前只存端点。 */
export interface PendingConnection {
  source: string;
  sourceOutput: string;
  /** 世界坐标下的当前指针位置。 */
  toX: number;
  toY: number;
}

/** 素材库条目，用于「从素材库添加」面板。 */
export interface LibraryAsset {
  id: string;
  name: string;
  /** 落到画布上会生成哪种节点。 */
  kind: Extract<CanvasNodeKind, 'image' | 'video' | 'audio' | 'avatar'>;
  meta: string;
  /** 真实素材地址；示例数据没有，节点会退化成占位底纹。 */
  url?: string;
}
