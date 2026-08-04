import { buildNode } from './graph-ops';
import type { CanvasEdge, CanvasNode, CanvasNodeKind } from './types';
import { findMatchingInput } from './utils';

/** 缩略图里的一个小节点块，viewBox 0 0 120 60。 */
export interface StrategyThumbNode {
  x: number;
  y: number;
  /** tailwind fill/stroke 类，例如 'fill-rose-100 stroke-rose-300'。 */
  colorClass: string;
}

interface StrategyNodeSpec {
  kind: CanvasNodeKind;
  title: string;
  text?: string;
  /** 相对工作流原点的世界坐标。 */
  x: number;
  y: number;
  /** 覆盖默认卡片宽度（内容较重的卡需要更宽）。 */
  width?: number;
  /** 覆盖默认卡片高度（如 9:16 竖版视频卡）。 */
  height?: number;
  /** media 形态卡片的封面资源。 */
  assetUrl?: string;
  /** 可播放的视频地址（media 卡渲染 <video>）。 */
  videoUrl?: string;
  /** TikTok trend 节点预设的趋势 id；缺省则落地时是空态。 */
  trendId?: string;
  /** Storyboard 节点是否直接以落满 6 帧的完整态出现（模板流程用）。 */
  storyboardReady?: boolean;
}

interface StrategyEdgeSpec {
  /** nodes 数组下标。 */
  from: number;
  to: number;
  /** 缺省时取来源第一个输出。 */
  output?: string;
  /** 缺省时按类型自动匹配目标输入。 */
  input?: string;
}

export interface ContentStrategy {
  id: string;
  title: string;
  description: string;
  /** 标题前的彩色圆点。 */
  accentClass: string;
  thumb: { nodes: StrategyThumbNode[]; edges: Array<[number, number]> };
  nodes: StrategyNodeSpec[];
  edges: StrategyEdgeSpec[];
}

/**
 * 内置的 TikTok 内容策略模板。
 * 每个策略是一张可直接落到画布上的小工作流，落地后所有节点保持可编辑。
 */
export const CONTENT_STRATEGIES: ContentStrategy[] = [
  {
    id: 'inspiration-video-replication',
    title: 'Inspiration Video Replication',
    description: 'Rebuild a trending ad around your product, brief, and brand kit.',
    accentClass: 'bg-rose-400',
    thumb: {
      // 产品图 + 品牌资产在最左，先汇入 Brief；Brief 与 Trend 再进分镜
      nodes: [
        { x: 2, y: 8, colorClass: 'fill-rose-100 stroke-rose-300' },
        { x: 2, y: 28, colorClass: 'fill-amber-100 stroke-amber-300' },
        { x: 34, y: 8, colorClass: 'fill-sky-100 stroke-sky-300' },
        { x: 34, y: 38, colorClass: 'fill-violet-100 stroke-violet-300' },
        { x: 66, y: 22, colorClass: 'fill-neutral-surface2 stroke-neutral-fillLow' },
        { x: 96, y: 22, colorClass: 'fill-emerald-100 stroke-emerald-300' }
      ],
      edges: [
        [0, 2],
        [1, 2],
        [2, 4],
        [3, 4],
        [4, 5]
      ]
    },
    nodes: [
      // 第一列：产品图 + 品牌资产
      { kind: 'product-images', title: 'Product images', x: 0, y: 620 },
      { kind: 'brand-kit', title: 'Brand kit', x: 0, y: 1000 },
      // 第二列：Brief
      { kind: 'product-brief', title: 'Product brief', x: 460, y: 800, width: 300 },
      // 第三列：Hook → Body → CTA → Trend，同一 x、同宽，纵向对齐
      { kind: 'tiktok-trend', title: 'TikTok trend', x: 920, y: 2100, width: 264, trendId: 'matching-tracksuits' },
      // 第四列：Storyboard + 配音
      {
        kind: 'storyboard',
        title: 'Storyboard',
        x: 1400,
        y: 620,
        width: 1000,
        height: 1250,
        storyboardReady: true
      },
      {
        kind: 'video',
        title: 'Short Sleeve Hoodie Ad · final cut',
        text: 'Final 9:16 cut generated from the storyboard.',
        x: 2600, y: 800,
        height: 540,
        videoUrl: '/hoodie-ad.mp4'
      },
      { kind: 'audio-clips', title: 'Audio Clips Generation', x: 1400, y: 1720, width: 1000 },
      {
        kind: 'hook',
        title: 'Hook',
        text: 'Upgrade your streetwear game with the ultimate modern layer. Too warm for a jacket, too cool for just a tee?',
        x: 920, y: 0,
        assetUrl: '/ad-hook.png'
      },
      {
        kind: 'body',
        title: 'Body',
        text:
          '• Active Comfort: Designed with breathable fabric and a relaxed fit, giving you total freedom of movement whether you’re hitting the streets or lounging.\n\n' +
          '• Versatile Style: Seamlessly transitions into any seasonal outfit — featuring a stylish hood and a functional front kangaroo pocket for your everyday essentials.',
        x: 920, y: 700,
        assetUrl: '/ad-body.png'
      },
      {
        kind: 'cta',
        title: 'CTA',
        text: 'Shop Now & Upgrade Your Style!',
        x: 920, y: 1400,
        assetUrl: '/ad-cta.png'
      }
    ],
    edges: [
      // 产品图和品牌资产先进 Brief
      { from: 0, to: 2, input: 'image' },
      { from: 1, to: 2, input: 'image' },
      // Brief 分发到 Hook / Body / CTA
      { from: 2, to: 7, input: 'prompt' },
      { from: 2, to: 8, input: 'prompt' },
      { from: 2, to: 9, input: 'prompt' },
      // 三段脚本 + 趋势一起汇入 Storyboard
      { from: 7, to: 4, input: 'prompt' },
      { from: 8, to: 4, input: 'prompt' },
      { from: 9, to: 4, input: 'prompt' },
      { from: 3, to: 4, input: 'video' },
      { from: 4, to: 5, input: 'prompt' },
      // 配音：Brief 进左侧 Prompt，产出的音频接 Video
      { from: 2, to: 6, input: 'prompt' },
      { from: 6, to: 5, input: 'audio' }
    ]
  },
  {
    id: 'product-swap',
    title: 'Product Swap',
    description: 'Keep the winning video, swap in your product — one output per image.',
    accentClass: 'bg-violet-400',
    thumb: {
      nodes: [
        { x: 10, y: 8, colorClass: 'fill-rose-100 stroke-rose-300' },
        { x: 10, y: 38, colorClass: 'fill-violet-100 stroke-violet-300' },
        { x: 88, y: 22, colorClass: 'fill-emerald-100 stroke-emerald-300' }
      ],
      edges: [
        [0, 2],
        [1, 2]
      ]
    },
    nodes: [
      { kind: 'import', title: 'Winning video', text: 'Your proven ad, straight from Library.', x: 0, y: 0 },
      { kind: 'image', title: 'Product shot', x: 0, y: 250 },
      { kind: 'video', title: 'Swapped cut', x: 460, y: 120 }
    ],
    edges: [
      { from: 0, to: 2, input: 'image' },
      { from: 1, to: 2, input: 'image' }
    ]
  },
  {
    id: 'hook-cta-replacement',
    title: 'Hook/CTA Replacement',
    description: 'Generate fresh hooks and splice each onto your proven body.',
    accentClass: 'bg-emerald-400',
    thumb: {
      nodes: [
        { x: 10, y: 8, colorClass: 'fill-rose-100 stroke-rose-300' },
        { x: 10, y: 38, colorClass: 'fill-emerald-100 stroke-emerald-300' },
        { x: 88, y: 22, colorClass: 'fill-violet-100 stroke-violet-300' }
      ],
      edges: [
        [0, 2],
        [1, 2]
      ]
    },
    nodes: [
      { kind: 'hook', title: 'Fresh hook', text: 'New scroll-stopping opener.', x: 0, y: 0 },
      { kind: 'body', title: 'Proven body', text: 'The body that already converts.', x: 0, y: 220 },
      { kind: 'cta', title: 'Fresh CTA', text: 'New closing call to action.', x: 0, y: 440 },
      { kind: 'video', title: 'Respliced cut', x: 460, y: 160 }
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3, input: 'prompt' }
    ]
  },
  {
    id: 'character-swap',
    title: 'Character Swap',
    description: 'Keep the winning video — swap the creator for your avatar.',
    accentClass: 'bg-sky-400',
    thumb: {
      nodes: [
        { x: 10, y: 8, colorClass: 'fill-rose-100 stroke-rose-300' },
        { x: 14, y: 38, colorClass: 'fill-sky-100 stroke-sky-300' },
        { x: 88, y: 22, colorClass: 'fill-emerald-100 stroke-emerald-300' }
      ],
      edges: [
        [0, 2],
        [1, 2]
      ]
    },
    nodes: [
      { kind: 'import', title: 'Winning video', text: 'Your proven ad, straight from Library.', x: 0, y: 0 },
      { kind: 'avatar', title: 'Your avatar', x: 0, y: 250 },
      { kind: 'video', title: 'Swapped creator', x: 460, y: 130 }
    ],
    edges: [
      { from: 0, to: 2, input: 'image' },
      { from: 1, to: 2, input: 'video' }
    ]
  },
  {
    id: 'clothing-try-on',
    title: 'Clothing Try-On',
    description: 'Put your catalog on an avatar — one try-on video per garment.',
    accentClass: 'bg-indigo-400',
    thumb: {
      nodes: [
        { x: 10, y: 8, colorClass: 'fill-sky-100 stroke-sky-300' },
        { x: 10, y: 38, colorClass: 'fill-violet-100 stroke-violet-300' },
        { x: 88, y: 22, colorClass: 'fill-emerald-100 stroke-emerald-300' }
      ],
      edges: [
        [0, 2],
        [1, 2]
      ]
    },
    nodes: [
      { kind: 'image', title: 'Garment catalog', x: 0, y: 0 },
      { kind: 'avatar', title: 'Avatar model', x: 0, y: 340 },
      { kind: 'video', title: 'Try-on video', x: 460, y: 170 }
    ],
    edges: [
      { from: 0, to: 2, input: 'image' },
      { from: 1, to: 2, input: 'video' }
    ]
  },
  {
    id: 'seasonal-refresh',
    title: 'Seasonal Refresh',
    description: 'Re-shoot a proven ad for the season without re-shooting anything.',
    accentClass: 'bg-amber-400',
    thumb: {
      nodes: [
        { x: 8, y: 22, colorClass: 'fill-rose-100 stroke-rose-300' },
        { x: 50, y: 34, colorClass: 'fill-neutral-surface2 stroke-neutral-fillLow' },
        { x: 92, y: 22, colorClass: 'fill-amber-100 stroke-amber-300' }
      ],
      edges: [
        [0, 1],
        [1, 2]
      ]
    },
    nodes: [
      { kind: 'import', title: 'Proven ad', text: 'The evergreen ad to refresh.', x: 0, y: 0 },
      { kind: 'text', title: 'Seasonal brief', text: 'Holiday palette, winter styling, gifting angle.', x: 0, y: 250 },
      { kind: 'image', title: 'Season pack shot', x: 440, y: 0 },
      { kind: 'video', title: 'Refreshed cut', x: 880, y: 130 }
    ],
    edges: [
      { from: 0, to: 2, input: 'image' },
      { from: 1, to: 2, input: 'prompt' },
      { from: 2, to: 3, input: 'image' }
    ]
  }
];

let strategyEdgeSeq = 0;

/**
 * 把策略模板实例化为画布节点和连线。
 * centerX/centerY 是模板包围盒中心要落到的世界坐标。
 */
export const buildStrategyGraph = (
  strategy: ContentStrategy,
  centerX: number,
  centerY: number
): { nodes: CanvasNode[]; edges: CanvasEdge[] } => {
  const minX = Math.min(...strategy.nodes.map((spec) => spec.x));
  const maxX = Math.max(...strategy.nodes.map((spec) => spec.x));
  const minY = Math.min(...strategy.nodes.map((spec) => spec.y));
  const maxY = Math.max(...strategy.nodes.map((spec) => spec.y));
  const offsetX = centerX - (minX + maxX) / 2;
  const offsetY = centerY - (minY + maxY) / 2;

  const nodes = strategy.nodes.map((spec) => ({
    ...buildNode(spec.kind, spec.x + offsetX, spec.y + offsetY, spec.title),
    ...(spec.width ? { width: spec.width } : {}),
    ...(spec.height ? { height: spec.height } : {}),
    ...(spec.assetUrl ? { assetUrl: spec.assetUrl } : {}),
    ...(spec.videoUrl ? { videoUrl: spec.videoUrl } : {}),
    ...(spec.trendId ? { trendId: spec.trendId } : {}),
    ...(spec.storyboardReady ? { storyboardReady: true } : {}),
    ...(spec.text || spec.assetUrl ? { text: spec.text, status: 'done' as const } : {})
  }));

  const edges = strategy.edges.reduce<CanvasEdge[]>((acc, spec) => {
    const source = nodes[spec.from];
    const target = nodes[spec.to];
    if (!source || !target) {
      return acc;
    }
    const output = spec.output ?? 'out';
    const input = spec.input ?? findMatchingInput(source.kind, output, target.kind)?.id;
    if (!input) {
      return acc;
    }
    strategyEdgeSeq += 1;
    return [
      ...acc,
      { id: `edge-strategy-${Date.now()}-${strategyEdgeSeq}`, source: source.id, sourceOutput: output, target: target.id, targetInput: input }
    ];
  }, []);

  return { nodes, edges };
};
