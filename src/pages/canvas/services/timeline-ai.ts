import { planTimelineEdit } from '@/api';

import { getClaudeKey, planWithClaude } from './claude-client';

import type {
  GraphicStyle,
  TimelineClip,
  TimelineEditOp,
  TimelineEditOperation,
  TimelineEditPlan,
  TimelineTrack,
  ThinkingStep,
  TimelineTrackKind,
  VideoFormatRatio
} from '../types';

const TRACK_KINDS: TimelineTrackKind[] = ['video', 'transition', 'audio', 'caption', 'graphics'];
const GRAPHIC_KINDS = ['headline', 'lower-third', 'banner', 'badge', 'logo', 'scribble'] as const;

/** 宽松收窄图形样式：认识的字段留下，kind 必须命中枚举。 */
const toGraphic = (raw: Record<string, unknown> | undefined): GraphicStyle | undefined => {
  if (!raw) {
    return undefined;
  }
  const kind = GRAPHIC_KINDS.find((item) => item === raw.kind);
  if (!kind) {
    return undefined;
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    kind,
    ...(num(raw.y) !== undefined ? { y: num(raw.y) } : {}),
    ...(num(raw.scale) !== undefined ? { scale: num(raw.scale) } : {}),
    ...(str(raw.fg) ? { fg: str(raw.fg) } : {}),
    ...(str(raw.accent) ? { accent: str(raw.accent) } : {}),
    ...(str(raw.bg) ? { bg: str(raw.bg) } : {}),
    ...(str(raw.cta) ? { cta: str(raw.cta) } : {})
  };
};
const FORMAT_RATIOS: VideoFormatRatio[] = ['9:16', '1:1', '16:9', '4:5'];

/** 接口返回的原始操作，字段是平铺的可选值，需要收窄成 TimelineEditOp。 */
interface WireOperation {
  Label?: string;
  Type?: string;
  ClipId?: string;
  TrackId?: string;
  Start?: number;
  Duration?: number;
  At?: number;
  Flag?: string;
  Value?: boolean;
  Ratio?: string;
  Text?: string;
  Style?: Record<string, unknown>;
  Path?: string;
  Patch?: string;
  Blend?: string;
  Clip?: WireClip;
  Track?: WireTrack;
}

interface WireClip {
  ClipId?: string;
  Label?: string;
  Start?: number;
  Duration?: number;
  HasAudio?: boolean;
  Text?: string;
  SourceUrl?: string;
  Graphic?: Record<string, unknown>;
}

interface WireTrack {
  TrackId?: string;
  Kind?: string;
  Visible?: boolean;
  Muted?: boolean;
  Clips?: WireClip[];
}

let planSeq = 0;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const toClip = (wire: WireClip | undefined): TimelineClip | undefined => {
  if (!wire?.ClipId || !isNumber(wire.Start) || !isNumber(wire.Duration)) {
    return undefined;
  }
  return {
    id: wire.ClipId,
    label: wire.Label ?? 'Untitled clip',
    start: Math.max(0, wire.Start),
    duration: Math.max(0.05, wire.Duration),
    hasAudio: Boolean(wire.HasAudio),
    text: typeof wire.Text === 'string' && wire.Text ? wire.Text : undefined,
    ...(typeof wire.SourceUrl === 'string' && wire.SourceUrl
      ? { sourceUrl: wire.SourceUrl, sourceStart: 0, sourceDuration: Math.max(0.05, wire.Duration ?? 1) }
      : {}),
    ...(toGraphic(wire.Graphic) ? { graphic: toGraphic(wire.Graphic) } : {})
  };
};

const toTrack = (wire: WireTrack | undefined): TimelineTrack | undefined => {
  if (!wire?.TrackId) {
    return undefined;
  }
  return {
    id: wire.TrackId,
    kind: TRACK_KINDS.find((kind) => kind === wire.Kind) ?? 'video',
    visible: wire.Visible ?? true,
    muted: wire.Muted ?? false,
    clips: (wire.Clips ?? []).map(toClip).filter((clip): clip is TimelineClip => Boolean(clip))
  };
};

/** 把一条平铺的 wire 操作收窄成带判别式的 TimelineEditOp；字段不全就丢弃。 */
const toOp = (wire: WireOperation): TimelineEditOp | undefined => {
  switch (wire.Type) {
    case 'set-timing':
      return wire.ClipId && isNumber(wire.Start) && isNumber(wire.Duration)
        ? { type: 'set-timing', clipId: wire.ClipId, start: wire.Start, duration: wire.Duration }
        : undefined;

    case 'split':
      return wire.ClipId && isNumber(wire.At) ? { type: 'split', clipId: wire.ClipId, at: wire.At } : undefined;

    case 'delete':
      return wire.ClipId ? { type: 'delete', clipId: wire.ClipId } : undefined;

    case 'add-clip': {
      const clip = toClip(wire.Clip);
      return wire.TrackId && clip ? { type: 'add-clip', trackId: wire.TrackId, clip } : undefined;
    }

    case 'add-track': {
      const track = toTrack(wire.Track);
      return track ? { type: 'add-track', track } : undefined;
    }

    case 'set-track-flag':
      return wire.TrackId && (wire.Flag === 'visible' || wire.Flag === 'muted') && typeof wire.Value === 'boolean'
        ? { type: 'set-track-flag', trackId: wire.TrackId, flag: wire.Flag, value: wire.Value }
        : undefined;

    case 'set-style': {
      if (!wire.ClipId || !wire.Style || typeof wire.Style !== 'object') {
        return undefined;
      }
      // y 作为增量或绝对值都可能出现；直接透传，合并时覆盖
      const patch = wire.Style as Partial<GraphicStyle>;
      return { type: 'set-style', clipId: wire.ClipId, style: patch };
    }

    case 'set-text':
      return wire.ClipId && typeof wire.Text === 'string' && wire.Text
        ? { type: 'set-text', clipId: wire.ClipId, text: wire.Text }
        : undefined;

    case 'set-format': {
      const ratio = FORMAT_RATIOS.find((item) => item === wire.Ratio);
      return ratio ? { type: 'set-format', ratio } : undefined;
    }

    case 'region-edit':
      return typeof wire.Path === 'string' && wire.Path && typeof wire.Patch === 'string' && wire.Patch
        ? {
            type: 'region-edit',
            path: wire.Path,
            patchUrl: wire.Patch,
            blend: wire.Blend === 'color' ? 'color' : 'normal',
            prompt: wire.Label ?? 'Regenerated area'
          }
        : undefined;

    default:
      return undefined;
  }
};

/** Agent 要么给一份计划，要么停下来问一个澄清问题。 */
export type AgentReply =
  | { kind: 'plan'; thinking: ThinkingStep[]; plan: TimelineEditPlan; suggestions: string[] }
  | { kind: 'question'; thinking: ThinkingStep[]; question: string; options: string[] };

/** 接口的 Thinking 既可能是纯句子，也可能是带标题的对象，统一收成 ThinkingStep。 */
const toThinkingStep = (entry: unknown): ThinkingStep | undefined => {
  if (typeof entry === 'string' && entry.trim()) {
    return { body: entry };
  }
  if (entry && typeof entry === 'object') {
    const record = entry as { Title?: unknown; Body?: unknown };
    if (typeof record.Body === 'string' && record.Body.trim()) {
      return { title: typeof record.Title === 'string' ? record.Title : undefined, body: record.Body };
    }
  }
  return undefined;
};

/**
 * 让模型基于当前时间线和一句自然语言指令作答。
 * 计划只是「提议」，调用方负责预览和逐条应用 —— 这里不改任何状态。
 */
export const planEdit = async (
  prompt: string,
  tracks: TimelineTrack[],
  playhead: number,
  /** 开场问卷答案；有值时后端直接给一份复合首刀计划。 */
  intake?: Record<string, string | string[]>,
  /** 用户在画面上圈出的区域（归一化路径）；有值时按局部编辑处理。 */
  region?: { path: string },
  /** 时间线上选中的元素；有值时指令优先定向到它。 */
  target?: { id: string; label: string; kind: TimelineTrackKind }
): Promise<AgentReply> => {
  const wireArgs = {
    prompt,
    playhead,
    ...(intake ? { intake } : {}),
    ...(region ? { region: { Path: region.path } } : {}),
    ...(target ? { target: { ClipId: target.id, Label: target.label, Kind: target.kind } } : {}),
    tracks: tracks.map((track) => ({
      TrackId: track.id,
      Kind: track.kind,
      Clips: track.clips.map((clip) => ({
        ClipId: clip.id,
        Label: clip.label,
        Start: clip.start,
        Duration: clip.duration,
        HasAudio: clip.hasAudio,
        ...(clip.text ? { Text: clip.text } : {})
      }))
    }))
  };

  /*
   * 有 key 就把 prompt 交给用户自己的 Claude；圈选重生成除外 —— 那条链路
   * 要产出贴片图，Messages API 不做图，仍走本地生成器。
   * Claude 挂了（断网、key 失效…）回落到本地 planner，并在思考轨迹里说明。
   */
  const claudeKey = getClaudeKey();
  let resp: Awaited<ReturnType<typeof planTimelineEdit>>;
  if (claudeKey && !region) {
    try {
      resp = (await planWithClaude(wireArgs, claudeKey)) as typeof resp;
    } catch (error) {
      resp = await planTimelineEdit(wireArgs);
      resp.Thinking = [
        {
          Title: 'Claude unavailable',
          Body: `${error instanceof Error ? error.message : 'Request failed'} — fell back to the local planner.`
        },
        ...(resp.Thinking ?? [])
      ];
    }
  } else {
    resp = await planTimelineEdit(wireArgs);
  }

  planSeq += 1;
  const thinking = (resp?.Thinking ?? [])
    .map(toThinkingStep)
    .filter((step): step is ThinkingStep => Boolean(step));

  if (resp?.Kind === 'question' && resp.Question) {
    return {
      kind: 'question',
      thinking,
      question: resp.Question,
      options: (resp.Options ?? []).filter((option): option is string => typeof option === 'string')
    };
  }

  const operations: TimelineEditOperation[] = (resp?.Operations ?? [])
    .map((wire: WireOperation, index: number) => {
      const op = toOp(wire);
      return op ? { id: `plan-${planSeq}-op-${index}`, label: wire.Label ?? 'Edit', op } : undefined;
    })
    .filter((operation): operation is TimelineEditOperation => Boolean(operation));

  return {
    kind: 'plan',
    thinking,
    suggestions: (resp?.Suggestions ?? []).filter((item): item is string => typeof item === 'string'),
    plan: {
      id: `plan-${planSeq}`,
      prompt,
      summary: resp?.Summary ?? 'No summary returned.',
      operations
    }
  };
};
