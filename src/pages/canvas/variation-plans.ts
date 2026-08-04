import { VARIATION_SET_WIDTH } from './const';
import { buildNode, createId } from './graph-ops';
import type { CanvasNode, VariationPlan, VariationSpec } from './types';

/**
 * 变体探索的静态剧本。
 * 心智模型：一份产品源 → 一条创意策略 → 一组可控变体。
 * 这里放 planner 的可选维度、三条创意方向、以及按方向生成变体卡的构造器；
 * 全部本地数据，接真实策略接口后替换，节点侧不用动。
 */

/* ------------------------------------------------------------------ */
/* Planner：brief 里显式声明「什么该变」                                  */
/* ------------------------------------------------------------------ */

export const PLAN_OBJECTIVES = ['Conversion', 'Awareness', 'Engagement'];
export const PLAN_AUDIENCES = ['Gen Z', 'Parents', 'Fitness enthusiasts'];
export const PLAN_PLATFORMS = ['TikTok', 'Reels', 'Shorts'];
/** 创意方向候选（多选）；「Add new」输入的自定义方向会追加进选中集。 */
export const PLAN_DIRECTIONS = ['Lifestyle', 'Product demo', 'Testimonial', 'Trend-led', 'UGC review', 'Unboxing'];

export const MAX_VARIATIONS = 3;

export const DEFAULT_VARIATION_PLAN: VariationPlan = {
  objective: 'Conversion',
  audience: 'Gen Z',
  offer: '20% off summer sale',
  platform: 'TikTok',
  directions: ['Lifestyle', 'Product demo', 'Testimonial'],
  count: 3
};

/* ------------------------------------------------------------------ */
/* Keep constant / Vary：变体集上最重要的一组控制                          */
/* ------------------------------------------------------------------ */

/** 默认保持不变的维度：产品、品牌、促销、片尾卡是这组变体的「常量」。 */
export const DEFAULT_KEEP_CONSTANT = ['Product', 'Brand identity', 'Promotion', 'End card'];
/** 可以拿来探索的维度全集；不在 vary 里的都视为保持不变。 */
export const ALL_VARY_DIMENSIONS = [
  'Hook',
  'Background',
  'CTA',
  'Selling points',
  'Talent',
  'Copy',
  'Storyline',
  'Music',
  'Duration'
];

/* ------------------------------------------------------------------ */
/* 三条创意方向（Tom 的六个 TikTok 概念先分成三条路）                       */
/* ------------------------------------------------------------------ */

export interface StrategyPreset {
  id: string;
  title: string;
  rationale: string;
  /** 这条方向默认允许变化的维度。 */
  vary: string[];
  /** 标题前的彩色圆点。 */
  accentClass: string;
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: 'trend-led',
    title: 'Trend-led styling',
    rationale:
      'Rides the fast outfit-transition trend already performing in the category. Familiar format, new product — lowest risk way to buy attention.',
    vary: ['Hook', 'Music', 'Talent'],
    accentClass: 'bg-rose-400'
  },
  {
    id: 'benefit-demo',
    title: 'Product benefit demo',
    rationale:
      'Shows the breathable fabric and kangaroo pocket doing their job. Best for conversion: proof beats vibes when the offer is already strong.',
    vary: ['Hook', 'Storyline', 'Copy'],
    accentClass: 'bg-sky-400'
  },
  {
    id: 'summer-lifestyle',
    title: 'Summer lifestyle story',
    rationale:
      'Places the tee inside a day-in-the-life summer story. Widest reach, builds the association the retargeting ads will cash in later.',
    vary: ['Hook', 'Background', 'Storyline'],
    accentClass: 'bg-amber-400'
  }
];

/* ------------------------------------------------------------------ */
/* 变体卡内容：每条变体都带名字、改动、受众、hook 和信心分                    */
/* ------------------------------------------------------------------ */

/** 变体缩略图轮换用的现成素材。 */
const THUMBS = [
  '/ad-hook.png',
  '/ad-body.png',
  '/ad-cta.png',
  '/sb-frame-1.png',
  '/sb-frame-2.png',
  '/sb-frame-3.png',
  '/sb-frame-4.png',
  '/sb-frame-5.png',
  '/sb-frame-6.png'
];

interface VariationSeed {
  name: string;
  whatChanged: string;
  hook: string;
  confidence: number;
  rationale: string;
  /** 缺省用 plan.audience；深分支的受众探索会覆盖。 */
  audience?: string;
  /** 专属缩略图；缺省从 THUMBS 里轮换。 */
  thumbnail?: string;
}

/**
 * 三个初始概念的专属缩略图（用户提供的三张概念图）。
 * 把对应文件放进 public/ 即可生效：
 * concept-trend-led.png（街头滑板）/ concept-benefit-demo.png（球场）/ concept-lifestyle.png（天台聚会）。
 */
const CONCEPT_THUMBS = {
  'trend-led': '/concept-trend-led.png',
  'benefit-demo': '/concept-benefit-demo.png',
  'summer-lifestyle': '/concept-lifestyle.png'
} as const;

/**
 * 每条创意方向引用的成片。
 * 目前用仓库里的现有素材占位；要换成方向专属的视频，
 * 上传文件后改这里的路径（或按同名覆盖文件）即可。
 */
export const DIRECTION_VIDEOS: Record<string, string> = {
  'trend-led': '/tracksuit-trend.mp4',
  'benefit-demo': '/video-with-selling-points.mp4',
  'summer-lifestyle': '/hoodie-ad.mp4'
};

/** 每条创意方向下的变体种子；生成时按 plan 填充受众和促销。 */
const SEEDS_BY_STRATEGY: Record<string, VariationSeed[]> = {
  'trend-led': [
    {
      name: 'Trend-led hook',
      thumbnail: CONCEPT_THUMBS['trend-led'],
      whatChanged: 'Opens on the outfit transition beat; discount lands in the first line.',
      hook: 'Wait for it… {offer} on everything you just saw.',
      confidence: 86,
      rationale: 'Transition openers hold 1.8× the 3s view rate in this category.'
    },
    {
      name: 'Sound-on remix',
      whatChanged: 'Same cut, trending audio swapped in; captions carry the offer.',
      hook: 'POV: your summer fit just went on sale.',
      confidence: 74,
      rationale: 'Trending audio boosts reach but ages fast — ship this one first.'
    },
    {
      name: 'Creator duet',
      whatChanged: 'Talent swapped to a creator reacting to the transition.',
      hook: 'I did NOT expect the pocket. Also — {offer}.',
      confidence: 68,
      rationale: 'Creator face adds trust; costs a day of turnaround.'
    }
  ],
  'benefit-demo': [
    {
      name: 'Pocket-first demo',
      thumbnail: CONCEPT_THUMBS['benefit-demo'],
      whatChanged: 'Leads with the kangaroo pocket demo instead of the outfit.',
      hook: 'This pocket fits your phone, keys AND the {offer}.',
      confidence: 82,
      rationale: 'The pocket is the most-commented feature on past ads.'
    },
    {
      name: 'Breathability test',
      whatChanged: 'Hook replaced with the fabric airflow close-up.',
      hook: 'Watch it breathe. Your summer tee shouldn’t sweat with you.',
      confidence: 77,
      rationale: 'Demo proof suits conversion objective; slower open, stronger close.'
    },
    {
      name: 'Before / after switch',
      whatChanged: 'Storyline reframed as heavy hoodie → short-sleeve swap.',
      hook: 'Retire the heavy hoodie. Same comfort, half the heat.',
      confidence: 71,
      rationale: 'Contrast framing tests well with audiences past their first visit.'
    }
  ],
  'summer-lifestyle': [
    {
      name: 'Street style with skateboard',
      thumbnail: '/skateboard.png',
      whatChanged: 'Styled as a golden-hour street-skate moment; slower push-in pacing.',
      hook: 'The tee that keeps up with every kickflip ({offer}).',
      confidence: 79,
      rationale: 'Street-style settings lift saves/shares — good for awareness.'
    },
    {
      name: 'City day-in-the-life',
      thumbnail: '/street-errand.png',
      whatChanged: 'Background swapped to city errands; faster cuts.',
      hook: 'One tee. Nine hours. Zero outfit changes.',
      confidence: 73,
      rationale: 'Urban context matches the Gen Z audience segment.'
    },
    {
      name: 'Festival fit check',
      thumbnail: '/festival-fit-check.png',
      whatChanged: 'Storyline reframed around a festival fit check moment.',
      hook: 'Festival checklist: tickets, sunscreen, this tee ({offer}).',
      confidence: 65,
      rationale: 'Seasonal spike play — high ceiling, short shelf life.'
    }
  ]
};

/** 快速探索（不走方向）：六个刻意不同的概念，每个来自不同的探索维度。 */
const QUICK_EXPLORE_SEEDS: VariationSeed[] = [
  SEEDS_BY_STRATEGY['trend-led'][0],
  SEEDS_BY_STRATEGY['benefit-demo'][0],
  SEEDS_BY_STRATEGY['summer-lifestyle'][0],
  {
    name: 'Audience flip: parents',
    whatChanged: 'Audience shifted to parents; copy leads with easy care.',
    hook: 'Machine-washable. Kid-proof. And {offer}.',
    audience: 'Parents',
    confidence: 70,
    rationale: 'Untapped segment in current media mix.'
  },
  {
    name: 'Testimonial cut',
    whatChanged: 'Creative direction switched to a straight-to-camera testimonial.',
    hook: 'I bought one. Then three. Here’s why.',
    confidence: 72,
    rationale: 'Testimonials are the control format for this account.'
  },
  {
    name: '6-second cutdown',
    whatChanged: 'Duration cut to 6s; offer is the only message.',
    hook: '{offer}. That’s it. That’s the ad.',
    confidence: 69,
    rationale: 'Short cutdowns win the frequency game on TikTok.'
  }
];

const fillSeed = (seed: VariationSeed, plan: VariationPlan, index: number, videoUrl?: string): VariationSpec => ({
  id: createId('variation'),
  name: seed.name,
  whatChanged: seed.whatChanged,
  audience: seed.audience ?? plan.audience,
  hook: seed.hook.replace('{offer}', plan.offer),
  confidence: seed.confidence,
  rationale: seed.rationale,
  thumbnail: seed.thumbnail ?? THUMBS[index % THUMBS.length],
  videoUrl,
  status: 'draft'
});

/** 按创意方向生成一组变体卡。 */
export const buildStrategyVariations = (strategyId: string, plan: VariationPlan): VariationSpec[] => {
  const seeds = SEEDS_BY_STRATEGY[strategyId] ?? SEEDS_BY_STRATEGY['trend-led'];
  const videoUrl = DIRECTION_VIDEOS[strategyId];
  return seeds
    .slice(0, Math.max(1, Math.min(plan.count, seeds.length)))
    .map((seed, index) => fillSeed(seed, plan, index, videoUrl));
};

/** 快速探索：直接给 N 个刻意不同的概念，适合早期发散。 */
const QUICK_EXPLORE_VIDEOS = [
  DIRECTION_VIDEOS['trend-led'],
  DIRECTION_VIDEOS['benefit-demo'],
  DIRECTION_VIDEOS['summer-lifestyle']
];

export const buildQuickExploreVariations = (plan: VariationPlan): VariationSpec[] =>
  QUICK_EXPLORE_SEEDS.slice(0, Math.max(1, Math.min(plan.count, QUICK_EXPLORE_SEEDS.length))).map((seed, index) =>
    fillSeed(seed, plan, index, QUICK_EXPLORE_VIDEOS[index])
  );

/** 深分支：拿一条变体当基准，只动 hook 和 CTA 的三个受控版本。 */
export const buildControlledVariations = (base: VariationSpec, plan: VariationPlan): VariationSpec[] => {
  const controlled: Array<Pick<VariationSeed, 'name' | 'whatChanged' | 'hook' | 'confidence' | 'rationale'>> = [
    {
      name: `${base.name} · question hook`,
      whatChanged: 'Only the hook changed: statement reframed as a question.',
      hook: `Still wearing heavy layers in July? ${plan.offer} says stop.`,
      confidence: Math.min(95, base.confidence + 4),
      rationale: 'Question hooks lift comment rate on the base concept.'
    },
    {
      name: `${base.name} · urgency CTA`,
      whatChanged: 'Only the CTA changed: countdown urgency added at the close.',
      hook: base.hook,
      confidence: Math.min(95, base.confidence + 2),
      rationale: 'Urgency close pairs with the existing hook — clean A/B pair.'
    },
    {
      name: `${base.name} · cold open`,
      whatChanged: 'Hook removed entirely — cold open on the product beat.',
      hook: '(no spoken hook — product close-up carries the open)',
      confidence: Math.max(40, base.confidence - 8),
      rationale: 'Control arm: tells us how much the hook is actually worth.'
    }
  ];
  return controlled.map((seed, index) => ({
    id: createId('variation'),
    name: seed.name,
    whatChanged: seed.whatChanged,
    audience: base.audience,
    hook: seed.hook,
    confidence: seed.confidence,
    rationale: seed.rationale,
    thumbnail: THUMBS[(index + 3) % THUMBS.length],
    videoUrl: base.videoUrl,
    status: 'draft'
  }));
};

/* ------------------------------------------------------------------ */
/* 节点构造：strategy / variation-set 落到画布上                          */
/* ------------------------------------------------------------------ */

/** 从 brief 派生三张 strategy 卡（还没生成变体，只是三条可展开的路）。 */
export const buildStrategyNodes = (brief: CanvasNode, plan: VariationPlan): CanvasNode[] =>
  STRATEGY_PRESETS.map((preset, index) => ({
    ...buildNode('strategy', brief.x + brief.width + 140, brief.y + (index - 1) * 440, preset.title),
    // strategy id 藏在 note 里，展开时用它挑变体种子
    note: preset.id,
    rationale: preset.rationale,
    text: plan.audience,
    variationPlan: plan,
    varyDimensions: preset.vary,
    status: 'done' as const
  }));

/** 生成一个（生成中的）变体集节点；变体卡由调用方在延时后 patch 进来。 */
export const buildVariationSetNode = (
  source: CanvasNode,
  title: string,
  plan: VariationPlan,
  vary: string[]
): CanvasNode => ({
  ...buildNode('variation-set', source.x + source.width + 140, source.y, title),
  width: VARIATION_SET_WIDTH,
  variationPlan: plan,
  keepConstant: [...DEFAULT_KEEP_CONSTANT],
  varyDimensions: [...vary],
  variationsExpanded: false,
  status: 'generating' as const
});
