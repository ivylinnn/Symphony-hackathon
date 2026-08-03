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
}

export interface WireTrack {
  TrackId: string;
  Kind: 'video' | 'transition' | 'audio' | 'caption';
  Clips: WireClip[];
}

export interface WireOperation {
  Label: string;
  Type: 'set-timing' | 'split' | 'delete' | 'add-clip' | 'add-track' | 'set-track-flag';
  ClipId?: string;
  TrackId?: string;
  Start?: number;
  Duration?: number;
  At?: number;
  Flag?: 'visible' | 'muted';
  Value?: boolean;
  Clip?: WireClip;
  Track?: WireTrack & { Visible?: boolean; Muted?: boolean };
}

/**
 * The agent either proposes a plan or stops to ask one clarifying question.
 * `Thinking` is the reasoning trace the panel reveals while it works.
 */
export interface WireAgentReply {
  Kind: 'plan' | 'question';
  Thinking: string[];
  Summary?: string;
  Operations?: WireOperation[];
  Question?: string;
  /**
   * Each option is a phrase that gets appended to the original prompt and re-sent,
   * so answering genuinely resolves the request instead of replaying a canned branch.
   */
  Options?: string[];
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

/** 读一遍时间线，作为思考轨迹的第一句，让它引用真实结构而不是套话。 */
const surveyLine = (tracks: WireTrack[]) => {
  const clips = allClips(tracks).length;
  const kinds = tracks.map((t) => t.Kind);
  return `Reading the timeline — ${tracks.length} track${tracks.length > 1 ? 's' : ''} (${kinds.join(', ')}), ${clips} clip${
    clips > 1 ? 's' : ''
  }, ${endOf(tracks).toFixed(1)}s total.`;
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
}): Promise<WireAgentReply> {
  await delay(900);

  const prompt = (args.prompt ?? '').toLowerCase().trim();
  const tracks = args.tracks ?? [];
  const videoTracks = tracks.filter((t) => t.Kind === 'video');
  const audioTracks = tracks.filter((t) => t.Kind === 'audio');
  const total = endOf(tracks);
  const survey = surveyLine(tracks);
  const durationMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(?:s\b|sec|second)/);

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

  /* 4) 字幕轨 */
  if (has(prompt, 'caption', 'subtitle', 'text overlay', 'on-screen text')) {
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
