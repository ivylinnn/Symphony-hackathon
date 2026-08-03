import {
  KsIconAiAssistant,
  KsIconAiGeneration,
  KsIconCampaignList,
  KsIconImageCollection,
  KsIconPeople,
  KsIconShowTimeline,
  KsIconSound,
  KsIconTextFile
} from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';

import type { TimelineClip, TimelineTrack, TimelineTrackKind } from '../types';

/** 左侧工具栏的条目；agent 排在最上面，是默认停留的那一项。 */
export type EditorTool =
  | 'agent'
  | 'caption'
  | 'avatars'
  | 'script'
  | 'audio'
  | 'stickers'
  | 'effects'
  | 'transitions';

export const EDITOR_TOOLS: Array<{
  id: EditorTool;
  label: string;
  Icon: (props: { size?: number }) => JSX.Element;
}> = [
  { id: 'agent', label: 'Editing agent', Icon: KsIconAiAssistant },
  { id: 'caption', label: 'Caption', Icon: KsIconTextFile },
  { id: 'avatars', label: 'Avatars', Icon: KsIconPeople },
  { id: 'script', label: 'Script', Icon: KsIconCampaignList },
  { id: 'audio', label: 'Audio', Icon: KsIconSound },
  { id: 'stickers', label: 'Stickers', Icon: KsIconImageCollection },
  { id: 'effects', label: 'Effects', Icon: KsIconAiGeneration },
  { id: 'transitions', label: 'Transitions', Icon: KsIconShowTimeline }
];

/** 最左侧的图标导航。 */
export function ToolRail({
  active,
  onSelect
}: {
  active: EditorTool;
  onSelect: (tool: EditorTool) => void;
}) {
  return (
    <nav
      data-tool-rail
      className="flex w-[84px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-solid border-neutral-fillLow bg-neutral-surface px-2 py-3"
    >
      {EDITOR_TOOLS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-pressed={active === id}
          onClick={() => onSelect(id)}
          className={clsx(
            'flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition-colors',
            active === id
              ? 'bg-neutral-surface2 text-neutral-highOnSurface'
              : 'text-neutral-mediumOnSurface hover:bg-neutral-surface1'
          )}
        >
          <Icon size={19} />
          <span className="text-center text-[10px] leading-[13px]">{label}</span>
        </button>
      ))}
    </nav>
  );
}

const formatCue = (seconds: number) => {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${mm}:${ss}`;
};

function PanelHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="shrink-0 px-3 pb-2 pt-3">
      <p className="text-[12px] font-semibold text-neutral-highOnSurface">{title}</p>
      <p className="mt-0.5 text-[11px] leading-[15px] text-neutral-lowOnSurface">{hint}</p>
    </div>
  );
}

/** 一行可点的元素：跳到它的时间点，顺带选中。 */
function CueRow({
  clip,
  meta,
  onPick
}: {
  clip: TimelineClip;
  meta?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      title="Jump to this point"
      onClick={onPick}
      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-surface1"
    >
      <span className="shrink-0 pt-px text-[11px] tabular-nums text-neutral-lowOnSurface">
        {formatCue(clip.start)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] leading-[16px] text-neutral-highOnSurface">
          {clip.text ?? clip.label}
        </span>
        {meta ? <span className="block text-[10px] text-neutral-lowOnSurface">{meta}</span> : null}
      </span>
    </button>
  );
}

function AskButton({ label, onAsk }: { label: string; onAsk: () => void }) {
  return (
    <button
      type="button"
      onClick={onAsk}
      className="w-full rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface1 px-2.5 py-1.5 text-[11px] font-medium text-neutral-mediumOnSurface transition-colors hover:border-primary-fill/40 hover:bg-primary-surface2 hover:text-primary-onSurface"
    >
      {label}
    </button>
  );
}

function EmptyPanel({ title, hint, actions }: { title: string; hint: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <PanelHeader title={title} hint={hint} />
      {actions ? <div className="flex flex-col gap-1.5 px-3">{actions}</div> : null}
    </div>
  );
}

interface ToolPanelProps {
  tool: Exclude<EditorTool, 'agent'>;
  tracks: TimelineTrack[];
  onSeek: (seconds: number) => void;
  onSelectClip: (clipId: string) => void;
  onToggleTrackFlag: (trackId: string, flag: 'visible' | 'muted') => void;
  /** 面板里的动作统一转成一句诉求交给 agent，保持单一编辑入口。 */
  onAsk: (prompt: string) => void;
}

/**
 * 工具栏各项对应的面板。
 * 能由时间线数据支撑的（字幕、分镜、音频、特效、转场）都列真实内容并可跳转；
 * demo 里没有对应原语的（Avatars / Stickers）如实说明，不摆假 UI。
 */
export function ToolPanel({ tool, tracks, onSeek, onSelectClip, onToggleTrackFlag, onAsk }: ToolPanelProps) {
  const clipsOfKind = (kind: TimelineTrackKind) =>
    tracks
      .filter((track) => track.kind === kind)
      .flatMap((track) => track.clips)
      .sort((a, b) => a.start - b.start);

  const pick = (clip: TimelineClip) => {
    onSeek(clip.start);
    onSelectClip(clip.id);
  };

  if (tool === 'caption') {
    const cues = clipsOfKind('caption').filter((clip) => clip.text);
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader
          title="Caption"
          hint={cues.length ? 'Click a line to jump there. Double-click it on the timeline to edit.' : 'No captions yet.'}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-1">
          {cues.map((clip) => (
            <CueRow key={clip.id} clip={clip} onPick={() => pick(clip)} />
          ))}
        </div>
        <div className="shrink-0 px-3 pb-3 pt-2">
          <AskButton label={cues.length ? 'Rewrite the captions' : 'Generate captions'} onAsk={() => onAsk('add captions')} />
        </div>
      </div>
    );
  }

  if (tool === 'script') {
    const scenes = clipsOfKind('video');
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="Script" hint="The scene structure driving the cut." />
        <div className="min-h-0 flex-1 overflow-y-auto px-1">
          {scenes.map((clip) => (
            <CueRow
              key={clip.id}
              clip={{ ...clip, text: clip.label }}
              meta={`${clip.duration.toFixed(1)}s`}
              onPick={() => pick(clip)}
            />
          ))}
        </div>
        <div className="shrink-0 px-3 pb-3 pt-2">
          <AskButton label="Tighten the hook" onAsk={() => onAsk('make the hook punchier')} />
        </div>
      </div>
    );
  }

  if (tool === 'audio') {
    const audioTracks = tracks.filter((track) => track.kind === 'audio');
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="Audio" hint={audioTracks.length ? 'Music, dubs and voiceover on this cut.' : 'No audio tracks yet.'} />
        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {audioTracks.map((track) => (
            <div key={track.id} className="mb-1.5 rounded-lg border border-solid border-neutral-fillLow p-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-highOnSurface">
                  {track.clips[0]?.label ?? 'Audio'}
                </span>
                <button
                  type="button"
                  title={track.muted ? 'Unmute' : 'Mute'}
                  onClick={() => onToggleTrackFlag(track.id, 'muted')}
                  className={clsx(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                    track.muted
                      ? 'bg-neutral-surface2 text-neutral-lowOnSurface'
                      : 'bg-success-fill/15 text-success-onSurface'
                  )}
                >
                  {track.muted ? 'Muted' : 'On'}
                </button>
              </div>
              <p className="mt-0.5 text-[10px] tabular-nums text-neutral-lowOnSurface">
                {track.clips.length} clip{track.clips.length === 1 ? '' : 's'}
              </p>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 px-3 pb-3 pt-2">
          <AskButton label="Lay in a music bed" onAsk={() => onAsk('lay in a music bed')} />
          <AskButton label="Add an AI voiceover" onAsk={() => onAsk('add an AI voiceover')} />
          <AskButton label="Dub into another language" onAsk={() => onAsk('dub the video into another language')} />
        </div>
      </div>
    );
  }

  if (tool === 'effects') {
    const cues = clipsOfKind('graphics');
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader
          title="Effects"
          hint={cues.length ? 'Motion graphics promoting your selling points.' : 'No motion graphics yet.'}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-1">
          {cues.map((clip) => (
            <CueRow key={clip.id} clip={clip} meta={clip.label} onPick={() => pick(clip)} />
          ))}
        </div>
        <div className="shrink-0 px-3 pb-3 pt-2">
          <AskButton
            label={cues.length ? 'Add more selling points' : 'Add motion graphics'}
            onAsk={() => onAsk('add motion graphics for the product selling points')}
          />
        </div>
      </div>
    );
  }

  if (tool === 'transitions') {
    const cues = clipsOfKind('transition');
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader
          title="Transitions"
          hint={cues.length ? 'One at each seam between scenes.' : 'No transitions on this cut.'}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-1">
          {cues.map((clip) => (
            <CueRow
              key={clip.id}
              clip={{ ...clip, text: clip.label }}
              meta={`${clip.duration.toFixed(1)}s`}
              onPick={() => pick(clip)}
            />
          ))}
        </div>
      </div>
    );
  }

  if (tool === 'avatars') {
    return (
      <EmptyPanel
        title="Avatars"
        hint="No avatar primitive is wired in this demo — the canvas node handles presenters instead. The closest edit here is swapping the opening."
        actions={<AskButton label="Swap the hook for a new variant" onAsk={() => onAsk('swap the hook for a new variant')} />}
      />
    );
  }

  return (
    <EmptyPanel
      title="Stickers"
      hint="Stickers have no timeline primitive in this demo. Motion graphics cover on-screen callouts for now."
      actions={<AskButton label="Add motion graphics instead" onAsk={() => onAsk('add motion graphics for the product selling points')} />}
    />
  );
}
