/** 节点分类：广告原生结构件 / 通用创意素材件 / 编辑处理件。 */
export type CanvasNodeCategory = 'ads-native' | 'creative' | 'edit';

/** 广告原生节点，对应一条广告的脚本结构。 */
export type AdsNativeNodeKind = 'hook' | 'body' | 'cta';

/** 创意节点，对应素材形态。 */
export type CreativeNodeKind = 'text' | 'image' | 'video' | 'audio' | 'avatar' | 'import';

/** 编辑节点，对素材做拆分/加工/批处理，通常多输入或多输出。 */
export type EditNodeKind = 'split-av' | 'split-tracks' | 'timeline' | 'batch';

export type CanvasNodeKind = AdsNativeNodeKind | CreativeNodeKind | EditNodeKind;

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
export type NodeBodyShape = 'text' | 'media' | 'audio' | 'operation' | 'batch' | 'timeline';

/** 时间线上的一段素材。 */
export interface TimelineClip {
  id: string;
  label: string;
  /** 起始秒与时长秒，渲染时按像素/秒换算。 */
  start: number;
  duration: number;
  /** 有音频的片段会额外画一条波形。 */
  hasAudio: boolean;
}

export interface TimelineTrack {
  id: string;
  kind: 'video' | 'audio';
  visible: boolean;
  muted: boolean;
  clips: TimelineClip[];
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
  title: string;
  text?: string;
  status: CanvasNodeStatus;
  /** 运行产物地址（图/视频/音频）。 */
  assetUrl?: string;
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
