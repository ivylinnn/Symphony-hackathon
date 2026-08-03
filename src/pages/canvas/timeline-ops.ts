import type {
  ClipPreview,
  TimelineClip,
  TimelineEditOperation,
  TimelineTrack,
  TrackPreview
} from './types';

/** 时间线总时长 = 所有片段结束时间的最大值。 */
export const timelineDuration = (tracks: TimelineTrack[]): number =>
  Math.max(0, ...tracks.flatMap((track) => track.clips.map((clip) => clip.start + clip.duration)));

/** 遍历所有轨道找片段，找不到返回 undefined。 */
export const findClip = (tracks: TimelineTrack[], clipId: string): TimelineClip | undefined => {
  for (const track of tracks) {
    const clip = track.clips.find((item) => item.id === clipId);
    if (clip) {
      return clip;
    }
  }
  return undefined;
};

/** 片段所属轨道 id。 */
export const findTrackIdOfClip = (tracks: TimelineTrack[], clipId: string): string | undefined =>
  tracks.find((track) => track.clips.some((clip) => clip.id === clipId))?.id;

/** 片段按 start 排序，保证轨道内顺序稳定。 */
const sortClips = (clips: TimelineClip[]): TimelineClip[] =>
  [...clips].sort((a, b) => a.start - b.start);

const mapClips = (
  tracks: TimelineTrack[],
  transform: (clips: TimelineClip[]) => TimelineClip[]
): TimelineTrack[] => tracks.map((track) => ({ ...track, clips: transform(track.clips) }));

/** 应用单步操作，返回新的轨道数组；操作指向不存在的片段/轨道时原样返回。 */
export const applyOperation = (
  tracks: TimelineTrack[],
  operation: TimelineEditOperation
): TimelineTrack[] => {
  const { op } = operation;

  switch (op.type) {
    case 'set-timing':
      return mapClips(tracks, (clips) =>
        sortClips(
          clips.map((clip) =>
            clip.id === op.clipId
              ? { ...clip, start: Math.max(0, op.start), duration: Math.max(0.05, op.duration) }
              : clip
          )
        )
      );

    case 'split':
      return mapClips(tracks, (clips) =>
        clips.flatMap((clip) => {
          const cutAt = op.at - clip.start;
          // 切点落在片段外就不切，避免produce出 0 长度的片段
          if (clip.id !== op.clipId || cutAt <= 0 || cutAt >= clip.duration) {
            return [clip];
          }
          return [
            { ...clip, duration: cutAt },
            {
              ...clip,
              id: `${clip.id}-b`,
              start: clip.start + cutAt,
              duration: clip.duration - cutAt
            }
          ];
        })
      );

    case 'delete':
      return mapClips(tracks, (clips) => clips.filter((clip) => clip.id !== op.clipId));

    case 'add-clip':
      return tracks.map((track) =>
        track.id === op.trackId ? { ...track, clips: sortClips([...track.clips, op.clip]) } : track
      );

    case 'add-track':
      // 已存在同 id 轨道时跳过，保证重复应用是幂等的
      return tracks.some((track) => track.id === op.track.id) ? tracks : [...tracks, op.track];

    case 'set-track-flag':
      return tracks.map((track) =>
        track.id === op.trackId ? { ...track, [op.flag]: op.value } : track
      );

    default:
      return tracks;
  }
};

/** 顺序应用多步操作。 */
export const applyOperations = (
  tracks: TimelineTrack[],
  operations: TimelineEditOperation[]
): TimelineTrack[] => operations.reduce(applyOperation, tracks);

/**
 * 比对应用前后的轨道，产出预览用的数据。
 * 被删掉的片段会按原位置回填进对应轨道，标成 removed 画成幽灵块。
 */
export const buildPreview = (
  before: TimelineTrack[],
  after: TimelineTrack[]
): TrackPreview[] => {
  const beforeClips = new Map<string, TimelineClip>();
  const beforeTrackOfClip = new Map<string, string>();
  before.forEach((track) => {
    track.clips.forEach((clip) => {
      beforeClips.set(clip.id, clip);
      beforeTrackOfClip.set(clip.id, track.id);
    });
  });

  const afterClipIds = new Set(after.flatMap((track) => track.clips.map((clip) => clip.id)));
  const beforeTrackIds = new Set(before.map((track) => track.id));

  return after.map((track) => {
    const clips: ClipPreview[] = track.clips.map((clip) => {
      const original = beforeClips.get(clip.id);
      if (!original) {
        return { clip, status: 'added' };
      }
      const moved = original.start !== clip.start || original.duration !== clip.duration;
      return { clip, status: moved ? 'changed' : 'unchanged' };
    });

    // 原本在这条轨道、应用后消失的片段，回填成 removed 幽灵块
    const removed: ClipPreview[] = [...beforeClips.values()]
      .filter(
        (clip) => beforeTrackOfClip.get(clip.id) === track.id && !afterClipIds.has(clip.id)
      )
      .map((clip) => ({ clip, status: 'removed' as const }));

    return {
      track,
      isNewTrack: !beforeTrackIds.has(track.id),
      clips: [...clips, ...removed].sort((a, b) => a.clip.start - b.clip.start)
    };
  });
};

/** 预览里各类改动的条数，用于面板上的 "+2 −1" 摘要。 */
export const summarizePreview = (previews: TrackPreview[]) => {
  const counts = { added: 0, removed: 0, changed: 0, newTracks: 0 };
  previews.forEach((preview) => {
    if (preview.isNewTrack) {
      counts.newTracks += 1;
    }
    preview.clips.forEach(({ status }) => {
      if (status === 'added') {
        counts.added += 1;
      } else if (status === 'removed') {
        counts.removed += 1;
      } else if (status === 'changed') {
        counts.changed += 1;
      }
    });
  });
  return counts;
};
