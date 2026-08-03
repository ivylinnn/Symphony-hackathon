/**
 * Stub of `@/api` — the platform capabilities the canvas calls into.
 * Returns mocked-but-shaped data so the feature's real code paths (generateScript →
 * Hook/Body/CTA, voiceover, library) run end to end without a live account.
 */
import { delay, placeholderImage } from '../placeholder';
import { type MyLibraryAsset, type SavedProduct, ScriptType } from './typings';

export async function listProducts(_args: { limit?: number; offset?: number }): Promise<{ products: SavedProduct[] }> {
  await delay(200);
  return {
    products: [
      {
        name: 'Hydration Serum',
        description: '72-hour clinical hydration in one lightweight drop — dermatologist tested, no residue.',
        price: '29',
        currency: 'USD',
      },
    ],
  };
}

export async function generateScript(args: {
  needNum?: number;
  productName?: string;
  description?: string;
  price?: string;
  duration?: number;
  language?: string;
}): Promise<{
  Scripts: Array<{ modelNames?: string[]; Script: Array<{ Type: ScriptType; Content: string }> }>;
}> {
  await delay(650);
  const name = args?.productName ?? 'the product';
  return {
    Scripts: [
      {
        modelNames: ['symphony-demo-llm'],
        Script: [
          { Type: ScriptType.HOOK, Content: `Stop scrolling — ${name} just replaced your entire shelf.` },
          {
            Type: ScriptType.USP,
            Content: `Clinically tested, ${name} delivers 72-hour hydration in one lightweight drop. Real results, zero residue.`,
          },
          { Type: ScriptType.CTA, Content: 'Tap to grab the bundle — 20% off ends tonight.' },
        ],
      },
    ],
  };
}

export async function generateVoiceover(_args: {
  script: string;
  voiceId?: string;
  videoId?: string;
}): Promise<{ TtsList: Array<{ AudioUrl?: string }>; VoiceDuration?: number }> {
  await delay(600);
  // A silent 1-frame WAV keeps <audio> happy without shipping a real asset.
  return {
    TtsList: [{ AudioUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=' }],
    VoiceDuration: 12,
  };
}

/* ------------------------------------------------------------------ */
/* Timeline AI editing                                                 */
/* ------------------------------------------------------------------ */

export interface WireClip {
  ClipId: string;
  Label: string;
  Start: number;
  Duration: number;
  HasAudio?: boolean;
  Text?: string;
  /** 引用的素材地址；静帧（片尾卡等）也走这里。 */
  SourceUrl?: string;
  /** 图形片段的结构化样式（kind/y/scale/fg/accent/bg/cta）。 */
  Graphic?: Record<string, unknown>;
}

export interface WireTrack {
  TrackId: string;
  Kind: 'video' | 'transition' | 'audio' | 'caption' | 'graphics';
  Clips: WireClip[];
}

export interface WireOperation {
  Label: string;
  Type: 'set-timing' | 'split' | 'delete' | 'add-clip' | 'add-track' | 'set-track-flag' | 'set-text' | 'set-style' | 'set-format' | 'region-edit';
  ClipId?: string;
  TrackId?: string;
  Start?: number;
  Duration?: number;
  At?: number;
  Flag?: 'visible' | 'muted';
  Value?: boolean;
  Ratio?: string;
  Text?: string;
  Style?: Record<string, unknown>;
  Path?: string;
  Patch?: string;
  Blend?: 'color' | 'normal';
  Clip?: WireClip;
  Track?: WireTrack & { Visible?: boolean; Muted?: boolean };
}

/**
 * The agent either proposes a plan or stops to ask one clarifying question.
 * `Thinking` is the reasoning trace the panel reveals while it works.
 */
/** 思考轨迹的一步：给了 Title 就渲染成小标题 + 正文，否则只是一段话。 */
export type WireThinkingStep = string | { Title: string; Body: string };

export interface WireAgentReply {
  Kind: 'plan' | 'question';
  Thinking: WireThinkingStep[];
  Summary?: string;
  Operations?: WireOperation[];
  Question?: string;
  /**
   * Each option is a phrase that gets appended to the original prompt and re-sent,
   * so answering genuinely resolves the request instead of replaying a canned branch.
   */
  Options?: string[];
  /** 这一步之后值得做的几件事，面板渲染成 pill，点了就当成新指令。 */
  Suggestions?: string[];
}

let opSeq = 0;
const nextId = (prefix: string) => {
  opSeq += 1;
  return `${prefix}-${opSeq}`;
};

const endOf = (tracks: WireTrack[]) =>
  Math.max(0, ...tracks.flatMap((t) => t.Clips.map((c) => c.Start + c.Duration)));

const allClips = (tracks: WireTrack[]) => tracks.flatMap((t) => t.Clips);

/** 停用词之外的词才用来匹配片段标签，避免 "the"/"clip" 命中所有片段。 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'my', 'this', 'that', 'it', 'is',
  'remove', 'delete', 'cut', 'drop', 'kill', 'clip', 'track', 'please', 'from', 'out',
]);

/** 按 prompt 里的关键词找片段，命中标签词最多的那个。 */
const matchClip = (tracks: WireTrack[], prompt: string): WireClip | undefined => {
  const words = prompt.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (words.length === 0) {
    return undefined;
  }
  let best: { clip: WireClip; score: number } | undefined;
  allClips(tracks).forEach((clip) => {
    const label = clip.Label.toLowerCase();
    const score = words.filter((word) => label.includes(word)).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { clip, score };
    }
  });
  return best?.clip;
};

const has = (prompt: string, ...needles: string[]) => needles.some((n) => prompt.includes(n));

/** 按分镜角色生成字幕文案；demo 里是固定稿，真实端点由模型听写/撰写。 */
const CAPTION_COPY: Array<[RegExp, string]> = [
  [/hook/i, 'Stop scrolling — this changes everything.'],
  [/body/i, '72-hour results in one lightweight step.'],
  [/proof/i, 'Clinically tested. Loved by 10,000+ customers.'],
  [/cta/i, 'Tap to shop — 20% off ends tonight.'],
  [/outro/i, 'Your new routine starts today.'],
];
const captionLine = (sceneLabel: string) =>
  CAPTION_COPY.find(([re]) => re.test(sceneLabel))?.[1] ?? `${sceneLabel} — on-screen line.`;

/**
 * 动态图形要打的产品卖点。真实端点会从 product brief / brand kit 里抽，
 * demo 里用一组成衣卖点，配合角标和进度条构成一段轻量的图形包装。
 */
const SELLING_POINTS: Array<{ tag: string; headline: string }> = [
  { tag: 'Lifestyle', headline: 'BREATHABLE FABRIC' },
  { tag: 'Details', headline: 'FUNCTIONAL KANGAROO POCKET' },
  { tag: 'Fit', headline: 'RELAXED COMFORTABLE FIT' },
  { tag: 'Styling', headline: 'VERSATILE LAYERING' },
  { tag: 'Movement', headline: 'BUILT FOR MOVEMENT' },
];

/**
 * 用户自己写的卖点：按逗号/分号/换行/顿号切开，也认 " and "。
 * 标签取首词，正文整体大写，和默认卖点保持同一种视觉语言。
 */
const parseSellingPoints = (brief: string): Array<{ tag: string; headline: string }> =>
  brief
    .split(/[,;，、\n]+|\s+\band\b\s+/i)
    .map((part) => part.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)
    .slice(0, 6)
    .map((part) => ({ tag: part.split(/\s+/)[0].replace(/[^\p{L}\p{N}]/gu, ''), headline: part.toUpperCase() }));

/** 把卖点均匀铺在整条片子上，每条留一点间隔，避免首尾贴边。 */
const buildGraphicsClips = (
  total: number,
  count: number,
  points: Array<{ tag: string; headline: string }> = SELLING_POINTS
): WireClip[] => {
  const source = points.length > 0 ? points : SELLING_POINTS;
  const slots = Math.max(1, Math.min(count, source.length));
  const slotLength = total / slots;
  // 每条卖点占本段的 70%，剩下的留白让画面喘口气
  const hold = Math.max(0.8, slotLength * 0.7);
  return source.slice(0, slots).map((point, index) => ({
    ClipId: nextId('clip-graphic'),
    Label: point.tag || `Point ${index + 1}`,
    Start: index * slotLength + (slotLength - hold) / 2,
    Duration: hold,
    HasAudio: false,
    Text: point.headline,
  }));
};

/** 风格词 → 图形样式 patch；「AI 改已有设计」就是把这些 patch 打到结构化对象上。 */
const STYLE_PRESETS: Array<{ names: string[]; label: string; style: Record<string, unknown> }> = [
  { names: ['premium', 'luxury', '高级'], label: 'premium', style: { fg: '#f2ece1', accent: '#c6a06a', scale: 0.95 } },
  { names: ['minimal', 'minimalist', '极简'], label: 'minimal', style: { fg: '#ffffff', accent: '#ffffff', scale: 0.82 } },
  { names: ['energetic', 'bold', '活力'], label: 'energetic', style: { fg: '#ffffff', accent: '#ff5a5f', scale: 1.18 } },
  { names: ['tiktok'], label: 'TikTok-native', style: { fg: '#ffffff', accent: '#25f4ee', scale: 1.1, y: 38 } },
  { names: ['instagram'], label: 'Instagram-native', style: { fg: '#ffffff', accent: '#e1306c', scale: 0.9 } },
  { names: ['black and gold', 'gold and black', '黑金'], label: 'black & gold', style: { fg: '#f2ece1', accent: '#c6a06a', bg: '#0d0b08' } },
  { names: ['brand color', 'brand colour', '品牌色'], label: 'brand colors', style: { fg: '#ffffff', accent: '#2f6bff' } },
];
const matchStylePreset = (prompt: string) =>
  STYLE_PRESETS.find((preset) => preset.names.some((name) => prompt.includes(name)));

/** 片尾卡场景的深色底（内联 SVG，随画幅拉伸）。 */
const DARK_BG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#17130f"/><stop offset="1" stop-color="#060504"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/></svg>`
  );

/** 常见颜色词 → 一组配色，生成的贴片以此为主色。 */
const COLOR_WORDS: Array<{ names: string[]; label: string; ramp: [string, string, string] }> = [
  { names: ['blue', '蓝'], label: 'blue', ramp: ['#5b8cff', '#2f4fd6', '#16256b'] },
  { names: ['red', '红'], label: 'red', ramp: ['#ff6b6f', '#d92d33', '#6b1114'] },
  { names: ['green', '绿'], label: 'green', ramp: ['#4bd6a0', '#12a06a', '#0a4a32'] },
  { names: ['black', '黑'], label: 'black', ramp: ['#3a3d44', '#1b1d22', '#0a0b0d'] },
  { names: ['white', '白'], label: 'white', ramp: ['#ffffff', '#e4e7ec', '#a9b0ba'] },
  { names: ['yellow', '黄'], label: 'yellow', ramp: ['#ffd75e', '#eab308', '#7a5a04'] },
  { names: ['orange', '橙'], label: 'orange', ramp: ['#ffa457', '#f97316', '#7c3708'] },
  { names: ['purple', '紫'], label: 'purple', ramp: ['#b18cff', '#7c3aed', '#3b1a75'] },
  { names: ['pink', '粉'], label: 'pink', ramp: ['#ff8ec4', '#ec4899', '#7a1f4c'] },
  { names: ['gold', '金'], label: 'gold', ramp: ['#e8c98a', '#c9a86a', '#6d5730'] },
  { names: ['silver', '银'], label: 'silver', ramp: ['#e6eaef', '#b6bec9', '#6d757f'] },
  { names: ['denim', 'jean'], label: 'denim', ramp: ['#7290c4', '#3f5f96', '#1d2c47'] },
  { names: ['leather'], label: 'leather', ramp: ['#a9703f', '#6f4522', '#331e0e'] },
  { names: ['grass', 'lawn'], label: 'grass', ramp: ['#7bc95a', '#3f8f2c', '#1d4413'] },
  { names: ['sky', 'cloud'], label: 'sky', ramp: ['#a9d4ff', '#5aa2ee', '#2b5d94'] },
];

/** 没提颜色时，用 prompt 的哈希稳定地挑一组配色，同样的话每次结果一致。 */
const rampFor = (prompt: string) => {
  const named = COLOR_WORDS.find((entry) => entry.names.some((name) => prompt.includes(name)));
  if (named) {
    return named;
  }
  let hash = 0;
  for (let i = 0; i < prompt.length; i += 1) {
    hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  }
  return COLOR_WORDS[hash % COLOR_WORDS.length];
};

/** 纯换色类指令：保留原有明暗只换色相，比整块替换更像真的。 */
const isRecolor = (prompt: string) =>
  /\b(recolor|colou?r|repaint|tint|make it|turn it|update to|change to)\b/.test(prompt) || /改成|换成|变成/.test(prompt);

/**
 * 「生成」圈选区域的新画面。
 * demo 里按 prompt 的配色与哈希合成一张贴片；真实端点是 inpainting 模型，
 * 但出入参一致：进去是 mask + prompt，出来是只贴在 mask 内的图。
 */
const renderRegionPatch = (prompt: string, ramp: [string, string, string]) => {
  let hash = 7;
  for (let i = 0; i < prompt.length; i += 1) {
    hash = (hash * 33 + prompt.charCodeAt(i)) >>> 0;
  }
  const rand = (n: number) => ((hash >> (n * 3)) & 0xff) / 255;
  const blobs = Array.from({ length: 5 }, (_, i) =>
    `<ellipse cx="${(15 + rand(i) * 70).toFixed(1)}" cy="${(15 + rand(i + 2) * 70).toFixed(1)}" rx="${(14 + rand(i + 1) * 26).toFixed(1)}" ry="${(10 + rand(i + 3) * 22).toFixed(1)}" fill="${i % 2 ? ramp[0] : ramp[2]}" opacity="${(0.18 + rand(i + 4) * 0.3).toFixed(2)}"/>`
  ).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">` +
    `<stop offset="0" stop-color="${ramp[0]}"/><stop offset="0.55" stop-color="${ramp[1]}"/><stop offset="1" stop-color="${ramp[2]}"/>` +
    `</linearGradient><filter id="s"><feGaussianBlur stdDeviation="6"/></filter></defs>` +
    `<rect width="100" height="100" fill="url(#g)"/>` +
    `<g filter="url(#s)">${blobs}</g>` +
    `<rect width="100" height="100" fill="url(#g)" opacity="0.35"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/**
 * 下一步建议：优先补时间线上还没有的东西，再给几条通用动作，
 * 并避开刚刚做过的那件事，免得建议看起来像复读。
 */
const suggestNext = (tracks: WireTrack[], prompt: string): string[] => {
  const filled = (kind: WireTrack['Kind']) => tracks.some((t) => t.Kind === kind && t.Clips.length > 0);
  const hasEndCard = allClips(tracks).some((c) => /end card/i.test(c.Label));
  const pool = [
    ...(filled('caption') ? [] : ['Add captions']),
    ...(hasEndCard ? [] : ['Add branding elements']),
    'Swap the product',
    'Swap the model',
    ...(filled('graphics') ? [] : ['Add motion graphics']),
    ...(filled('audio') ? [] : ['Lay in a music bed']),
    'Refresh the hook',
    'Dub into another language',
    'Resize for feed',
  ];
  const words = prompt.toLowerCase();
  // 刚做过的那件事不再建议，避免像复读
  return pool.filter((item) => !words.includes(item.toLowerCase().split(' ').slice(-1)[0])).slice(0, 3);
};

/** 读一遍时间线，作为思考轨迹的第一步，让它引用真实结构而不是套话。 */
const surveyLine = (tracks: WireTrack[]): WireThinkingStep => {
  const clips = allClips(tracks).length;
  const kinds = tracks.map((t) => t.Kind);
  return {
    Title: 'Reading the timeline',
    Body: `${tracks.length} track${tracks.length > 1 ? 's' : ''} (${kinds.join(', ')}), ${clips} clip${
      clips > 1 ? 's' : ''
    }, ${endOf(tracks).toFixed(1)}s total.`,
  };
};

/**
 * Stub of the timeline-editing agent. Reads the current timeline plus a natural-language
 * instruction and returns either a plan of atomic operations or a clarifying question.
 * Intent matching is keyword-based here; the real endpoint would run an LLM over the same
 * request/response shape.
 */
export async function planTimelineEdit(args: {
  prompt: string;
  playhead: number;
  tracks: WireTrack[];
  intake?: {
    source?: string;
    clipCount?: string;
    targetLength?: string;
    packaging?: string[];
    graphicsBrief?: string;
  };
  region?: { Path: string };
  target?: { ClipId: string; Label: string; Kind: WireTrack['Kind'] };
}): Promise<WireAgentReply> {
  const reply = await planTimelineEditInner(args);
  // 计划类回复统一补上「下一步」建议，省得每个分支各写一遍
  if (reply.Kind === 'plan' && !reply.Suggestions) {
    reply.Suggestions = suggestNext(args.tracks ?? [], args.prompt ?? '');
  }
  return reply;
}

async function planTimelineEditInner(args: {
  prompt: string;
  playhead: number;
  tracks: WireTrack[];
  /** 开场问卷的结构化答案；有值时直接组合成一份复合首刀计划。 */
  intake?: {
    source?: string;
    clipCount?: string;
    targetLength?: string;
    packaging?: string[];
    /** 用户在「Light motion graphics」下写的卖点文案。 */
    graphicsBrief?: string;
  };
  /** 用户在画面上圈出的区域，路径是 0-100 归一化坐标。 */
  region?: { Path: string };
  /** 时间线上当前选中的元素；有值时优先把指令理解为对它的编辑。 */
  target?: { ClipId: string; Label: string; Kind: WireTrack['Kind'] };
}): Promise<WireAgentReply> {
  await delay(900);

  const prompt = (args.prompt ?? '').toLowerCase().trim();
  const tracks = args.tracks ?? [];
  const videoTracks = tracks.filter((t) => t.Kind === 'video');
  const audioTracks = tracks.filter((t) => t.Kind === 'audio');
  const total = endOf(tracks);
  const survey = surveyLine(tracks);
  const durationMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(?:s\b|sec|second)/);

  /* -1) 圈选重生成：优先级最高，用户明确指着画面某处 */
  if (args.region?.Path) {
    const instruction = (args.prompt ?? '').replace(/^edit the circled area:\s*/i, '').trim();
    const ramp = rampFor(prompt);
    const recolor = isRecolor(prompt);
    return {
      Kind: 'plan',
      Thinking: [
        survey,
        {
          Title: 'Masking the drawn region',
          Body: 'A region is circled on the frame, so the edit is confined to that path — everything outside it is left untouched.',
        },
        {
          Title: 'Interpreting the instruction',
          Body: `Reading “${instruction || prompt}” as the target look, which resolves to a ${ramp.label} palette for the generated fill.`,
        },
        {
          Title: recolor ? 'Compositing on hue' : 'Replacing the masked content',
          Body: recolor
            ? 'This reads as a recolor, so only the hue is replaced — the original shading, texture and highlights survive underneath.'
            : 'This asks for different content rather than a different colour, so the generated fill replaces what was inside the mask.',
        },
      ],
      Summary: `Regenerated the circled area as “${instruction || prompt}” — masked to your drawing and carried across the cut.`,
      Operations: [
        {
          Label: `Regenerate circled area → ${instruction || prompt}`,
          Type: 'region-edit',
          Path: args.region.Path,
          Patch: renderRegionPatch(prompt, ramp.ramp),
          Blend: recolor ? 'color' : 'normal',
        },
      ],
    };
  }

  /* -0.5) 选中元素的定向编辑：能定向的吃掉，不能定向的落回通用意图 */
  if (args.target) {
    const target = allClips(tracks).find((c) => c.ClipId === args.target?.ClipId);
    if (target) {
      const name = `@${target.Label}`;
      const targetThinking = [survey, `“${target.Label}” is selected — reading the instruction against it first.`];

      if (has(prompt, 'remove', 'delete', 'get rid of', '删', '去掉')) {
        const trailing = allClips(tracks).filter((c) => c.Start > target.Start);
        return {
          Kind: 'plan',
          Thinking: [...targetThinking, trailing.length ? `Pulling the ${trailing.length} following clip${trailing.length > 1 ? 's' : ''} up to close the gap.` : 'Nothing follows it.'],
          Summary: `Removed ${name}${trailing.length ? ' and closed the gap behind it' : ''}.`,
          Operations: [
            { Label: `Delete "${target.Label}"`, Type: 'delete', ClipId: target.ClipId },
            ...trailing.map<WireOperation>((c) => ({
              Label: `Pull "${c.Label}" ${target.Duration.toFixed(1)}s earlier`,
              Type: 'set-timing',
              ClipId: c.ClipId,
              Start: Math.max(0, c.Start - target.Duration),
              Duration: c.Duration,
            })),
          ],
        };
      }

      const explicit = prompt.match(/(\d+(?:\.\d+)?)\s*(?:s\b|sec|second|秒)/);
      if (explicit) {
        const duration = Math.max(0.2, Number(explicit[1]));
        return {
          Kind: 'plan',
          Thinking: [...targetThinking, `Retiming just this clip to ${duration.toFixed(1)}s; nothing else moves.`],
          Summary: `Set ${name} to ${duration.toFixed(1)}s.`,
          Operations: [
            { Label: `Fit "${target.Label}" to ${duration.toFixed(1)}s`, Type: 'set-timing', ClipId: target.ClipId, Start: target.Start, Duration: duration },
          ],
        };
      }

      if (has(prompt, 'shorter', 'tighten', '短')) {
        const duration = Math.max(0.3, target.Duration * 0.7);
        return {
          Kind: 'plan',
          Thinking: [...targetThinking, `Tightening it 30% → ${duration.toFixed(1)}s.`],
          Summary: `Tightened ${name} to ${duration.toFixed(1)}s.`,
          Operations: [
            { Label: `Tighten "${target.Label}" to ${duration.toFixed(1)}s`, Type: 'set-timing', ClipId: target.ClipId, Start: target.Start, Duration: duration },
          ],
        };
      }
      if (has(prompt, 'longer', 'extend', '长')) {
        const duration = target.Duration * 1.3;
        return {
          Kind: 'plan',
          Thinking: [...targetThinking, `Extending it 30% → ${duration.toFixed(1)}s.`],
          Summary: `Extended ${name} to ${duration.toFixed(1)}s.`,
          Operations: [
            { Label: `Extend "${target.Label}" to ${duration.toFixed(1)}s`, Type: 'set-timing', ClipId: target.ClipId, Start: target.Start, Duration: duration },
          ],
        };
      }

      // 图形样式的增量编辑：位置 / 大小 / 配色 / 风格 / 变体
      if (args.target.Kind === 'graphics') {
        const stylePatch: Record<string, unknown> = {};
        const notes: string[] = [];
        if (has(prompt, 'higher', 'move up', '上移')) { stylePatch.y = -12; notes.push('moved up'); }
        if (has(prompt, 'lower', 'move down', '下移')) { stylePatch.y = 12; notes.push('moved down'); }
        if (has(prompt, 'larger', 'bigger', '大一点')) { stylePatch.scale = 1.25; notes.push('scaled up'); }
        if (has(prompt, 'smaller', '小一点')) { stylePatch.scale = 0.8; notes.push('scaled down'); }
        const preset = matchStylePreset(prompt);
        if (preset) { Object.assign(stylePatch, preset.style); notes.push(`${preset.label} style`); }
        if (Object.keys(stylePatch).length > 0) {
          return {
            Kind: 'plan',
            Thinking: [
              ...targetThinking,
              { Title: 'Patching the design', Body: `Updating ${name} in place — ${notes.join(', ')} — nothing is regenerated.` },
            ],
            Summary: `Updated ${name}: ${notes.join(', ')}.`,
            Operations: [
              { Label: `Restyle "${target.Label}" (${notes.join(', ')})`, Type: 'set-style', ClipId: target.ClipId, Style: stylePatch },
            ],
          };
        }
        if (has(prompt, 'variation', 'versions', 'alternatives', '变体')) {
          return {
            Kind: 'question',
            Thinking: [...targetThinking, { Title: 'Drafting variations', Body: 'Four directions for this graphic — pick one and it applies as an in-place patch.' }],
            Question: `Which direction should ${name} take?`,
            Options: ['make it premium', 'make it minimal', 'make it energetic', 'make it TikTok-native'],
          };
        }
      }

      // 改文案：update to X / say X / change to X / 改成 X（仅字幕与图形有文案）
      const rewrite = (args.prompt ?? '').match(/(?:update to|change to|rewrite to|say|改成|改为)\s*[:：]?\s*(.+)$/i);
      if (rewrite && (args.target.Kind === 'caption' || args.target.Kind === 'graphics')) {
        const text = args.target.Kind === 'graphics' ? rewrite[1].trim().toUpperCase() : rewrite[1].trim();
        return {
          Kind: 'plan',
          Thinking: [...targetThinking, 'Rewriting its on-screen copy in place — timing untouched.'],
          Summary: `Rewrote ${name} to “${text}”.`,
          Operations: [
            { Label: `Rewrite "${target.Label}" → “${text}”`, Type: 'set-text', ClipId: target.ClipId, Text: text },
          ],
        };
      }
      // 没读出定向意图 → 落回通用意图，选中只是上下文而不是牢笼
    }
  }

  /* 0) 开场问卷：一次性把时长、字幕、音乐、标题条组合成首刀 */
  if (args.intake) {
    const { clipCount, targetLength, packaging = [], graphicsBrief } = args.intake;
    const target = Number(targetLength?.match(/(\d+)/)?.[1] ?? 0);
    const factor = target > 0 && total > 0 ? target / total : 1;
    const finalTotal = target > 0 ? target : total;
    const wants = (item: string) => packaging.includes(item);

    const thinking: WireThinkingStep[] = [survey];
    const operations: WireOperation[] = [];

    if (target > 0 && Math.abs(factor - 1) > 0.01) {
      thinking.push({
        Title: 'Fitting the target length',
        Body: `Target is ${target}s per clip against ${total.toFixed(1)}s of material, so every clip is retimed ${factor.toFixed(2)}× rather than chopping the tail.`,
      });
      operations.push(
        ...allClips(tracks).map<WireOperation>((c) => ({
          Label: `Fit "${c.Label}" to ${(c.Duration * factor).toFixed(2)}s`,
          Type: 'set-timing',
          ClipId: c.ClipId,
          Start: c.Start * factor,
          Duration: c.Duration * factor,
        }))
      );
    } else if (target > 0) {
      thinking.push({
        Title: 'Checking the length',
        Body: `Already ${total.toFixed(1)}s, which matches the ${target}s target — no retime needed.`,
      });
    }

    // 分镜按 retime 后的时间算，字幕/标题才能对上
    const scenes = (videoTracks[0]?.Clips ?? []).map((c) => ({
      ...c,
      Start: c.Start * factor,
      Duration: c.Duration * factor,
    }));

    if (wants('Captions') && scenes.length > 0) {
      thinking.push({
        Title: 'Writing the captions',
        Body: `One cue per scene, ${scenes.length} in total, timed against the retimed layout so the lines stay on their shots.`,
      });
      operations.push({
        Label: `Add captions (${scenes.length} cues)`,
        Type: 'add-track',
        Track: {
          TrackId: nextId('track-captions'),
          Kind: 'caption',
          Visible: true,
          Muted: false,
          Clips: scenes.map((clip) => ({
            ClipId: nextId('clip-caption'),
            Label: `Caption — ${clip.Label}`,
            Start: clip.Start,
            Duration: clip.Duration,
            HasAudio: false,
            Text: captionLine(clip.Label),
          })),
        },
      });
    }

    if (wants('Title text overlay')) {
      const titleLength = Math.min(2.5, finalTotal);
      thinking.push({
        Title: 'Adding the title card',
        Body: `A ${titleLength.toFixed(1)}s card over the opening, sized to clear the hook before the first cut.`,
      });
      operations.push({
        Label: `Add title overlay (${titleLength.toFixed(1)}s)`,
        Type: 'add-track',
        Track: {
          TrackId: nextId('track-title'),
          Kind: 'caption',
          Visible: true,
          Muted: false,
          Clips: [
            {
              ClipId: nextId('clip-title'),
              Label: 'Title card',
              Start: 0,
              Duration: titleLength,
              HasAudio: false,
              Text: 'THE ONLY STEP YOUR ROUTINE NEEDS',
            },
          ],
        },
      });
    }

    if (wants('Background music')) {
      thinking.push(`Laying a music bed across the full ${finalTotal.toFixed(1)}s.`);
      operations.push({
        Label: `Add music bed (${finalTotal.toFixed(1)}s)`,
        Type: 'add-track',
        Track: {
          TrackId: nextId('track-music'),
          Kind: 'audio',
          Visible: true,
          Muted: false,
          Clips: [
            {
              ClipId: nextId('clip-music'),
              Label: 'AI music bed — upbeat',
              Start: 0,
              Duration: finalTotal,
              HasAudio: true,
            },
          ],
        },
      });
    }

    if (wants('Light motion graphics')) {
      const written = graphicsBrief ? parseSellingPoints(graphicsBrief) : [];
      const graphicsClips = buildGraphicsClips(
        finalTotal,
        written.length > 0 ? written.length : Math.max(3, scenes.length),
        written
      );
      thinking.push({
        Title: 'Building the motion graphics',
        Body:
          written.length > 0
            ? `Using the ${written.length} selling point${written.length > 1 ? 's' : ''} you wrote, spaced across the ${finalTotal.toFixed(1)}s cut so each gets a clear beat.`
            : `No copy was given, so pulling ${graphicsClips.length} selling points from the product brief and spacing them across the cut.`,
      });
      operations.push({
        Label: `Add motion graphics (${graphicsClips.length} selling points)`,
        Type: 'add-track',
        Track: {
          TrackId: nextId('track-graphics'),
          Kind: 'graphics',
          Visible: true,
          Muted: false,
          Clips: graphicsClips,
        },
      });
    }

    const packagingText = packaging.length ? packaging.join(', ').toLowerCase() : 'no extra packaging';
    const countText = clipCount ? `${clipCount} clip${clipCount === '1' ? '' : 's'}` : 'this cut';
    const summary = operations.length
      ? `First pass — ${countText} at ${
          target > 0 ? `~${target}s` : 'current length'
        } with ${packagingText}.`
      : `Noted: ${countText}, ${packagingText}. Nothing to change on the timeline yet — tell me what to cut.`;

    return { Kind: 'plan', Thinking: thinking, Summary: summary, Operations: operations };
  }

  /* 1) 静音 / 取消静音 —— 要排在 "music" 之前，否则 "mute the music" 会被当成加音乐 */
  if (has(prompt, 'mute', 'silence the', 'unmute')) {
    const unmute = prompt.includes('unmute');
    const target = audioTracks[0] ?? tracks[0];
    if (target) {
      return {
        Kind: 'plan',
        Thinking: [survey, `Targeting the ${target.Kind} track for a ${unmute ? 'unmute' : 'mute'}.`],
        Summary: `${unmute ? 'Unmuted' : 'Muted'} the ${target.Kind} track.`,
        Operations: [
          {
            Label: `${unmute ? 'Unmute' : 'Mute'} ${target.TrackId}`,
            Type: 'set-track-flag',
            TrackId: target.TrackId,
            Flag: 'muted',
            Value: !unmute,
          },
        ],
      };
    }
  }

  /* 2) 删除片段 —— 认不出目标就反问，而不是瞎删一个 */
  if (has(prompt, 'remove', 'delete', 'get rid of', 'drop the', 'cut the')) {
    const target = matchClip(tracks, prompt);
    if (!target) {
      const candidates = allClips(tracks).map((c) => c.Label).slice(0, 5);
      if (candidates.length > 0) {
        return {
          Kind: 'question',
          Thinking: [survey, 'The instruction is a removal, but no clip label matches it confidently.'],
          Question: 'Which clip should I remove?',
          Options: candidates,
        };
      }
    }
    if (target) {
      const trailing = allClips(tracks).filter((c) => c.Start > target.Start);
      return {
        Kind: 'plan',
        Thinking: [
          survey,
          `Matched "${target.Label}" (${target.Duration.toFixed(1)}s at ${target.Start.toFixed(1)}s).`,
          trailing.length
            ? `${trailing.length} clip${trailing.length > 1 ? 's' : ''} sit after it and will be pulled up to close the gap.`
            : 'Nothing follows it, so no gap to close.',
        ],
        Summary: trailing.length
          ? `Removed "${target.Label}" and pulled the following ${trailing.length} clip${
              trailing.length > 1 ? 's' : ''
            } up to close the gap.`
          : `Removed "${target.Label}". Nothing follows it, so the rest of the cut is untouched.`,
        Operations: [
          { Label: `Delete "${target.Label}"`, Type: 'delete', ClipId: target.ClipId },
          ...trailing.map<WireOperation>((c) => ({
            Label: `Pull "${c.Label}" ${target.Duration.toFixed(1)}s earlier`,
            Type: 'set-timing',
            ClipId: c.ClipId,
            Start: Math.max(0, c.Start - target.Duration),
            Duration: c.Duration,
          })),
        ],
      };
    }
  }

  /* 3) 在播放头切开 */
  if (has(prompt, 'split', 'cut here', 'cut at', 'slice')) {
    const at = args.playhead;
    const target = allClips(tracks).find((c) => at > c.Start && at < c.Start + c.Duration);
    if (target) {
      return {
        Kind: 'plan',
        Thinking: [survey, `Playhead sits at ${at.toFixed(2)}s, inside "${target.Label}".`],
        Summary: `Split "${target.Label}" at the playhead.`,
        Operations: [
          { Label: `Split "${target.Label}" at ${at.toFixed(2)}s`, Type: 'split', ClipId: target.ClipId, At: at },
        ],
      };
    }
    return {
      Kind: 'plan',
      Thinking: [survey, `Playhead at ${at.toFixed(2)}s is not over any clip.`],
      Summary: 'The playhead is not over a clip, so there is nothing to split there.',
      Operations: [],
    };
  }

  /* 4a) 智能扩画（Uncrop）—— 没说目标版位就先问 */
  if (has(prompt, 'uncrop', 'expand the frame', 'outpaint', 'placement', 'aspect ratio', '扩画')) {
    const ratioMatch =
      prompt.match(/(1:1|16:9|4:5|9:16)/)?.[1] ??
      (has(prompt, 'square') ? '1:1' : has(prompt, 'landscape') ? '16:9' : undefined);
    if (!ratioMatch) {
      return {
        Kind: 'question',
        Thinking: [survey, 'Uncrop targets a placement, and each placement wants a different canvas.'],
        Question: 'Which placement should this variant target?',
        Options: ['square 1:1 for feed', 'landscape 16:9 for in-stream', 'portrait 4:5 for feed'],
      };
    }
    return {
      Kind: 'plan',
      Thinking: [
        survey,
        `Source frame is 9:16 — outpainting the edges to reach ${ratioMatch}.`,
        'Scene content stays centered; the AI fills the extended canvas.',
      ],
      Summary: `Uncropped the cut to ${ratioMatch} — edges AI-extended so the variant fits new placements.`,
      Operations: [{ Label: `Uncrop to ${ratioMatch} (AI outpaint the edges)`, Type: 'set-format', Ratio: ratioMatch }],
    };
  }

  /* 4b) 配音（Dubbing）—— 换语言重配，原声静音 */
  if (has(prompt, 'dub', '配音')) {
    const language = ['spanish', 'japanese', 'german', 'french', 'portuguese', 'korean'].find((item) =>
      prompt.includes(item)
    );
    if (!language) {
      return {
        Kind: 'question',
        Thinking: [survey, 'A dub replaces the dialogue — the target language decides the voice model.'],
        Question: 'Which language should the dub target?',
        Options: ['in Spanish', 'in Japanese', 'in German'],
      };
    }
    const spoken = language[0].toUpperCase() + language.slice(1);
    const videoTrack = videoTracks[0];
    return {
      Kind: 'plan',
      Thinking: [survey, `Muting the original dialogue and laying a ${spoken} AI dub under the full ${total.toFixed(1)}s.`],
      Summary: `Dubbed the cut into ${spoken} — original dialogue muted, AI dub matched to the scene timing.`,
      Operations: [
        ...(videoTrack
          ? [
              {
                Label: 'Mute the original dialogue',
                Type: 'set-track-flag' as const,
                TrackId: videoTrack.TrackId,
                Flag: 'muted' as const,
                Value: true,
              },
            ]
          : []),
        {
          Label: `Add ${spoken} dub track (AI)`,
          Type: 'add-track',
          Track: {
            TrackId: nextId('track-dub'),
            Kind: 'audio',
            Visible: true,
            Muted: false,
            Clips: [
              {
                ClipId: nextId('clip-dub'),
                Label: `Dub — ${spoken} (AI)`,
                Start: 0,
                Duration: Math.max(1, total),
                HasAudio: true,
              },
            ],
          },
        },
      ],
    };
  }

  /* 4c) AI 旁白（Voiceover）—— 从分镜结构起稿的解说轨 */
  if (has(prompt, 'voiceover', 'narration', '旁白')) {
    const scenes = videoTracks[0]?.Clips ?? [];
    return {
      Kind: 'plan',
      Thinking: [
        survey,
        scenes.length
          ? `Drafting a read from the scene structure (${scenes.map((c) => c.Label).join(' → ')}).`
          : 'No scene structure found — drafting a single read over the cut.',
      ],
      Summary: `Added an AI voiceover reading the ad script over the full ${total.toFixed(1)}s cut.`,
      Operations: [
        {
          Label: 'Add AI voiceover track',
          Type: 'add-track',
          Track: {
            TrackId: nextId('track-voiceover'),
            Kind: 'audio',
            Visible: true,
            Muted: false,
            Clips: [
              {
                ClipId: nextId('clip-voiceover'),
                Label: 'AI voiceover — script read',
                Start: 0,
                Duration: Math.max(1, total),
                HasAudio: true,
              },
            ],
          },
        },
      ],
    };
  }

  /* 4d) Hook 替换（Hook Swap）—— 同一时段换一个新开场，方向先问清 */
  if (has(prompt, 'swap the hook', 'hook swap', 'replace the hook', 'new hook', 'fresh hook', '换个hook', '换 hook', '替换 hook')) {
    const first = videoTracks[0]?.Clips[0];
    if (first) {
      const style = ['question-led', 'bold claim', 'social proof'].find((item) => prompt.includes(item));
      if (!style) {
        return {
          Kind: 'question',
          Thinking: [survey, `The hook ("${first.Label}", ${first.Duration.toFixed(1)}s) can be rebuilt in several directions.`],
          Question: 'Which direction should the new hook take?',
          Options: ['question-led hook', 'bold claim hook', 'social proof hook'],
        };
      }
      return {
        Kind: 'plan',
        Thinking: [
          survey,
          `Replacing "${first.Label}" with a ${style} variant at the exact same timing, so nothing downstream moves.`,
        ],
        Summary: `Swapped the hook for a ${style} variant — same ${first.Duration.toFixed(1)}s slot, rest of the cut untouched.`,
        Operations: [
          { Label: `Remove current hook "${first.Label}"`, Type: 'delete', ClipId: first.ClipId },
          {
            Label: `Add ${style} hook (AI generated)`,
            Type: 'add-clip',
            TrackId: videoTracks[0].TrackId,
            Clip: {
              ClipId: nextId('clip-hook-swap'),
              Label: `Hook v2 — ${style} (AI)`,
              Start: first.Start,
              Duration: first.Duration,
              HasAudio: true,
            },
          },
        ],
      };
    }
  }

  /* 4c-2) 品牌元素 / 片尾卡：把 End card 接到视频轨末尾，再打一条品牌字幕 */
  if (has(prompt, 'branding', 'brand element', 'end card', 'endcard', '品牌', '片尾')) {
    const track = videoTracks[0];
    if (track) {
      const at = endOf([track]);
      const cardLength = 3;
      const preset = matchStylePreset(prompt);
      const style = preset?.style ?? { fg: '#f2ece1', accent: '#c6a06a' };
      return {
        Kind: 'plan',
        Thinking: [
          survey,
          { Title: 'Building the end scene', Body: `A ${cardLength}s branded close at ${at.toFixed(1)}s: dark background, logo, tagline, CTA and promo — each its own editable layer, not a flattened image.` },
          { Title: 'Choosing the look', Body: preset ? `Styled ${preset.label}, per the instruction.` : 'Defaulting to the brand’s premium cream-and-gold on black.' },
        ],
        Summary: 'Added an end card scene — logo, tagline, Shop now CTA and promo badge as separate editable layers.',
        Operations: [
          { Label: `Add end-card background (${cardLength}s)`, Type: 'add-clip', TrackId: track.TrackId,
            Clip: { ClipId: nextId('clip-endbg'), Label: 'End card bg', Start: at, Duration: cardLength, HasAudio: false, SourceUrl: DARK_BG } },
          { Label: 'Add logo layer', Type: 'add-track',
            Track: { TrackId: nextId('track-ec-logo'), Kind: 'graphics', Visible: true, Muted: false,
              Clips: [{ ClipId: nextId('clip-ec-logo'), Label: 'Logo', Start: at, Duration: cardLength, HasAudio: false, Text: 'AURAK', Graphic: { kind: 'logo', y: 30, ...style } }] } },
          { Label: 'Add tagline layer', Type: 'add-track',
            Track: { TrackId: nextId('track-ec-tag'), Kind: 'graphics', Visible: true, Muted: false,
              // 副标走小号 logo lockup：居中、细体、宽字距，比大标题更衬品牌收尾
              Clips: [{ ClipId: nextId('clip-ec-tag'), Label: 'Tagline', Start: at + 0.3, Duration: cardLength - 0.3, HasAudio: false, Text: 'CRAFTED FOR MOTION', Graphic: { kind: 'logo', y: 45, scale: 0.42, ...style } }] } },
          { Label: 'Add CTA layer', Type: 'add-track',
            Track: { TrackId: nextId('track-ec-cta'), Kind: 'graphics', Visible: true, Muted: false,
              Clips: [{ ClipId: nextId('clip-ec-cta'), Label: 'CTA', Start: at + 0.5, Duration: cardLength - 0.5, HasAudio: false, Text: 'AURAK.COM', Graphic: { kind: 'banner', y: 72, cta: 'Shop now', ...style } }] } },
          { Label: 'Add promo badge', Type: 'add-track',
            Track: { TrackId: nextId('track-ec-promo'), Kind: 'graphics', Visible: true, Muted: false,
              Clips: [{ ClipId: nextId('clip-ec-promo'), Label: 'Promo', Start: at + 0.7, Duration: cardLength - 0.7, HasAudio: false, Text: '20% OFF — SUMMER', Graphic: { kind: 'badge', y: 12, ...style } }] } },
        ],
      };
    }
  }
  if (false) {
    const track = videoTracks[0];
    if (track) {
      const at = endOf([track]);
      const cardLength = 2.5;
      return {
        Kind: 'plan',
        Thinking: [
          survey,
          {
            Title: 'Placing the end card',
            Body: `Appending the branded end frame at ${at.toFixed(1)}s so the logo and shop CTA close the cut.`,
          },
          { Title: 'Adding the brand line', Body: 'A short lockup cue over the card keeps the name on screen while it holds.' },
        ],
        Summary: 'Added branding — end card with the shop CTA, plus a brand lockup line over it.',
        Operations: [
          {
            Label: `Add end card (${cardLength}s)`,
            Type: 'add-clip',
            TrackId: track.TrackId,
            Clip: {
              ClipId: nextId('clip-endcard'),
              Label: 'End card',
              Start: at,
              Duration: cardLength,
              HasAudio: false,
              SourceUrl: '/end-card.svg',
            },
          },
          {
            Label: 'Add brand lockup line',
            Type: 'add-track',
            Track: {
              TrackId: nextId('track-brand'),
              Kind: 'graphics',
              Visible: true,
              Muted: false,
              Clips: [
                {
                  ClipId: nextId('clip-brand'),
                  Label: 'Brand',
                  Start: at,
                  Duration: cardLength,
                  HasAudio: false,
                  Text: 'AURAK — CRAFTED FOR MOTION',
                },
              ],
            },
          },
        ],
      };
    }
  }

  /* 4c-3) 换产品 / 换模特：这类替换要指到画面上的具体位置，引导去用画笔 */
  if (has(prompt, 'swap the product', 'swap product', 'replace the product', 'swap the model', 'swap model', 'replace the model', '换产品', '换模特')) {
    const isModel = has(prompt, 'model', '模特');
    return {
      Kind: 'plan',
      Thinking: [
        survey,
        {
          Title: 'Locating the subject',
          Body: `A ${isModel ? 'model' : 'product'} swap has to target a specific area of the frame, and nothing is circled yet.`,
        },
      ],
      Summary: `To swap the ${isModel ? 'model' : 'product'}, hit “Draw to edit” on the viewer, circle ${
        isModel ? 'the person' : 'the product'
      }, and describe the replacement — the swap is generated inside your drawing and carried across the cut.`,
      Operations: [],
    };
  }

  /* 4d-2) 单条图形：标题动画 / lower third / 促销 banner / 徽章 / logo reveal */
  {
    const graphicIntents: Array<{
      match: string[];
      kind: string;
      label: string;
      defaults: { text: string; duration: number; start?: number; graphic?: Record<string, unknown> };
      title: string;
    }> = [
      { match: ['title animation', 'animated title', 'premium title', '标题动画'], kind: 'headline', label: 'Title',
        defaults: { text: 'CRAFTED FOR MOTION', duration: 2.6 }, title: 'Composing the title' },
      { match: ['lower third', 'lower-third'], kind: 'lower-third', label: 'Lower third',
        defaults: { text: 'ALEX RIVERA — FOUNDER, AURAK', duration: 3.2 }, title: 'Placing the lower third' },
      { match: ['banner', 'sale banner', 'cta banner', '促销条'], kind: 'banner', label: 'Banner',
        defaults: { text: 'SUMMER SALE — 20% OFF', duration: 3.5, graphic: { cta: 'Shop now' } }, title: 'Building the banner' },
      { match: ['badge', 'sticker', 'promotional badge', '徽章', 'exclusive'], kind: 'badge', label: 'Badge',
        defaults: { text: 'SUMMER EXCLUSIVE — 20% OFF', duration: 3 }, title: 'Stamping the badge' },
      { match: ['logo reveal', 'animate our logo', 'animate the logo', 'logo animation'], kind: 'logo', label: 'Logo',
        defaults: { text: 'AURAK', duration: 3, start: 0 }, title: 'Revealing the logo' },
    ];
    const intent = graphicIntents.find((g) => has(prompt, ...g.match));
    if (intent) {
      const custom = (args.prompt ?? '').split(/[:：]/).slice(1).join(':').trim();
      const text = (custom || intent.defaults.text).toUpperCase();
      const preset = matchStylePreset(prompt);
      const start = intent.defaults.start ?? Math.min(0.4, total);
      const duration = Math.min(intent.defaults.duration, Math.max(1, total));
      return {
        Kind: 'plan',
        Thinking: [
          survey,
          { Title: intent.title, Body: `Placing a ${intent.kind} graphic at ${start.toFixed(1)}s for ${duration.toFixed(1)}s — position, type and palette chosen for a 9:16 ad frame${preset ? `, in the ${preset.label} style` : ''}.` },
          { Title: 'Keeping it editable', Body: 'It lands as a structured layer on the graphics track: text, position, scale, palette and timing all stay editable.' },
        ],
        Summary: `Added a ${intent.label.toLowerCase()} — “${text}” — as an editable graphics layer.`,
        Operations: [
          {
            Label: `Add ${intent.label.toLowerCase()} “${text}”`,
            Type: 'add-track',
            Track: {
              TrackId: nextId('track-graphic'),
              Kind: 'graphics',
              Visible: true,
              Muted: false,
              Clips: [
                {
                  ClipId: nextId('clip-graphic'),
                  Label: intent.label,
                  Start: start,
                  Duration: duration,
                  HasAudio: false,
                  Text: text,
                  Graphic: { kind: intent.kind, ...(intent.defaults.graphic ?? {}), ...(preset?.style ?? {}) },
                },
              ],
            },
          },
        ],
      };
    }
  }

  /* 4e) 动态图形卖点 */
  if (has(prompt, 'motion graphic', 'selling point', 'product feature', 'graphics', '卖点', '动效')) {
    // 冒号后面的内容当成用户自己写的卖点："add motion graphics: waterproof, 2-year warranty"
    const written = parseSellingPoints((args.prompt ?? '').split(/[:：]/).slice(1).join(':'));
    const graphicsClips = buildGraphicsClips(
      Math.max(1, total),
      written.length > 0 ? written.length : 4,
      written
    );
    return {
      Kind: 'plan',
      Thinking: [
        survey,
        written.length > 0
          ? `Using the ${written.length} selling point${written.length > 1 ? 's' : ''} from your message.`
          : `Pulling ${graphicsClips.length} product selling points from the brief.`,
        `Spacing them across the ${total.toFixed(1)}s cut so each gets a clear beat on screen.`,
      ],
      Summary: `Added motion graphics promoting ${graphicsClips.length} selling points — headline, rule and progress marker over the footage.`,
      Operations: [
        {
          Label: `Add motion graphics (${graphicsClips.length} selling points)`,
          Type: 'add-track',
          Track: {
            TrackId: nextId('track-graphics'),
            Kind: 'graphics',
            Visible: true,
            Muted: false,
            Clips: graphicsClips,
          },
        },
      ],
    };
  }

  /* 4) 字幕轨 */
  if (has(prompt, 'caption', 'subtitle', 'text overlay', 'on-screen text', '字幕')) {
    const source = videoTracks[0]?.Clips ?? [];
    if (source.length > 0) {
      return {
        Kind: 'plan',
        Thinking: [survey, `Deriving one cue per scene on the video track — ${source.length} in total.`],
        Summary: `Added a caption track with ${source.length} cue${source.length > 1 ? 's' : ''} timed to your video clips.`,
        Operations: [
          {
            Label: `Add caption track (${source.length} cues)`,
            Type: 'add-track',
            Track: {
              TrackId: nextId('track-captions'),
              Kind: 'caption',
              Visible: true,
              Muted: false,
              Clips: source.map((clip, index) => ({
                ClipId: nextId('clip-caption'),
                Label: index === 0 ? 'Caption — hook line' : `Caption — ${clip.Label}`,
                Start: clip.Start,
                Duration: clip.Duration,
                HasAudio: false,
                Text: captionLine(clip.Label),
              })),
            },
          },
        ],
      };
    }
  }

  /* 5) 背景音乐 —— 先问铺满还是只铺开场 */
  if (has(prompt, 'music', 'bgm', 'soundtrack', 'audio bed', 'background track')) {
    const hookOnly = has(prompt, 'hook only', 'under the hook', 'just the hook', 'opening only');
    const wholeCut = has(prompt, 'whole cut', 'entire', 'full cut', 'all the way', 'throughout');
    if (!hookOnly && !wholeCut) {
      return {
        Kind: 'question',
        Thinking: [survey, 'A music bed can run under everything or just lift the opening — that changes its length.'],
        Question: 'How far should the music bed run?',
        Options: ['under the whole cut', 'under the hook only'],
      };
    }
    const firstScene = videoTracks[0]?.Clips[0];
    const bedLength = hookOnly && firstScene ? firstScene.Duration : Math.max(1, total);
    return {
      Kind: 'plan',
      Thinking: [survey, `Laying a bed of ${bedLength.toFixed(1)}s starting at 0.`],
      Summary: `Laid an upbeat music bed under ${hookOnly ? 'the hook' : `the full ${total.toFixed(1)}s cut`}.`,
      Operations: [
        {
          Label: `Add music bed (${bedLength.toFixed(1)}s)`,
          Type: 'add-track',
          Track: {
            TrackId: nextId('track-music'),
            Kind: 'audio',
            Visible: true,
            Muted: false,
            Clips: [
              {
                ClipId: nextId('clip-music'),
                Label: 'AI music bed — upbeat',
                Start: 0,
                Duration: bedLength,
                HasAudio: true,
              },
            ],
          },
        },
      ],
    };
  }

  /* 6) B-roll 插入 */
  if (has(prompt, 'b-roll', 'broll', 'cutaway', 'insert shot', 'establishing')) {
    const track = videoTracks[0];
    if (track) {
      return {
        Kind: 'plan',
        Thinking: [survey, `Appending a 1.6s cutaway at ${endOf([track]).toFixed(1)}s, the end of the video track.`],
        Summary: 'Appended a b-roll cutaway to the end of the video track.',
        Operations: [
          {
            Label: 'Add b-roll cutaway (1.6s)',
            Type: 'add-clip',
            TrackId: track.TrackId,
            Clip: {
              ClipId: nextId('clip-broll'),
              Label: 'B-roll — product cutaway',
              Start: endOf([track]),
              Duration: 1.6,
              HasAudio: false,
            },
          },
        ],
      };
    }
  }

  /* 7) 收紧开场 */
  if (has(prompt, 'hook', 'opening', 'first few seconds', 'punchier', 'intro')) {
    const first = videoTracks[0]?.Clips[0];
    if (first && first.Duration > 1.4) {
      const keep = Math.min(1.2, first.Duration * 0.45);
      const trimmed = first.Duration - keep;
      return {
        Kind: 'plan',
        Thinking: [
          survey,
          `"${first.Label}" runs ${first.Duration.toFixed(1)}s — long for an opening.`,
          `Keeping ${keep.toFixed(1)}s and pulling everything after it up by ${trimmed.toFixed(1)}s.`,
        ],
        Summary: `Tightened the opening — trimmed ${trimmed.toFixed(1)}s of lead-in so the hook lands immediately.`,
        Operations: [
          {
            Label: `Trim "${first.Label}" to ${keep.toFixed(1)}s`,
            Type: 'set-timing',
            ClipId: first.ClipId,
            Start: first.Start,
            Duration: keep,
          },
          ...allClips(tracks)
            .filter((c) => c.Start > first.Start)
            .map<WireOperation>((c) => ({
              Label: `Pull "${c.Label}" ${trimmed.toFixed(1)}s earlier`,
              Type: 'set-timing',
              ClipId: c.ClipId,
              Start: Math.max(0, c.Start - trimmed),
              Duration: c.Duration,
            })),
        ],
      };
    }
  }

  /* 8) 压到目标时长；没给数字就先问要多长 */
  if (durationMatch && total > 0) {
    const target = Number(durationMatch[1]);
    const factor = target / total;
    if (target > 0 && Math.abs(factor - 1) > 0.01) {
      return {
        Kind: 'plan',
        Thinking: [
          survey,
          `Target is ${target}s against ${total.toFixed(1)}s — a ${factor.toFixed(2)}× retime.`,
          'Scaling every clip so the cut keeps its rhythm instead of chopping the tail.',
        ],
        Summary: `Retimed every clip to fit a ${target}s cut — ${
          factor < 1 ? 'tightened' : 'stretched'
        } ${factor.toFixed(2)}× from ${total.toFixed(1)}s.`,
        Operations: allClips(tracks).map<WireOperation>((c) => ({
          Label: `Fit "${c.Label}" to ${(c.Duration * factor).toFixed(2)}s`,
          Type: 'set-timing',
          ClipId: c.ClipId,
          Start: c.Start * factor,
          Duration: c.Duration * factor,
        })),
      };
    }
  }

  if (has(prompt, 'shorter', 'tighten', 'shorten', 'cut it down', 'trim') && !durationMatch) {
    return {
      Kind: 'question',
      Thinking: [survey, 'This asks for a shorter cut but names no target length.'],
      Question: `The cut runs ${total.toFixed(1)}s. What should it come down to?`,
      Options: ['to 15 seconds', 'to 20 seconds', 'to 30 seconds'],
    };
  }

  /* 9) 变速 */
  if (has(prompt, 'speed up', 'faster', 'slow down', 'slower')) {
    const slower = has(prompt, 'slow down', 'slower');
    const factor = slower ? 1.25 : 0.8;
    return {
      Kind: 'plan',
      Thinking: [survey, `Applying a ${factor}× retime across every clip.`],
      Summary: `${slower ? 'Slowed' : 'Sped'} the cut to ${(total * factor).toFixed(1)}s across all tracks.`,
      Operations: allClips(tracks).map<WireOperation>((c) => ({
        Label: `${slower ? 'Slow' : 'Speed'} "${c.Label}" to ${(c.Duration * factor).toFixed(2)}s`,
        Type: 'set-timing',
        ClipId: c.ClipId,
        Start: c.Start * factor,
        Duration: c.Duration * factor,
      })),
    };
  }

  return {
    Kind: 'plan',
    Thinking: [survey, 'No timeline operation maps to this instruction.'],
    Summary:
      "I couldn't map that to a timeline edit. Try things like \"trim to 15 seconds\", \"add captions\", \"lay in a music bed\", \"remove the hook\", or \"make the hook punchier\".",
    Operations: [],
  };
}

export async function getMyLibrary(_args: { limit?: number; offset?: number }): Promise<{ Assets: MyLibraryAsset[] }> {
  await delay(300);
  return {
    Assets: [
      { assetId: 'lib-1', fileName: 'Serum bottle — studio', assetType: 'image', content: placeholderImage('Serum', '#e7efff', '#2f6bff') },
      { assetId: 'lib-2', fileName: 'Serum bottle — wet stone', assetType: 'image', content: placeholderImage('Wet stone', '#d3e0ff', '#1e4fd6') },
      { assetId: 'lib-3', fileName: 'Unboxing b-roll', assetType: 'video', content: placeholderImage('Unboxing', '#2f6bff', '#7c3aed') },
      { assetId: 'lib-4', fileName: 'Street scene b-roll', assetType: 'video', content: placeholderImage('Street', '#7c3aed', '#2f6bff') },
      { assetId: 'lib-5', fileName: 'Brand BGM — upbeat', assetType: 'audio', content: '' },
      { assetId: 'lib-6', fileName: 'UGC presenter — Mia', assetType: 'avatar', content: placeholderImage('Mia', '#e7efff', '#7c3aed') },
    ],
  };
}
