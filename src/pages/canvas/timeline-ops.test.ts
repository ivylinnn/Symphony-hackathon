import { applyOperations, buildPreview, summarizePreview, timelineDuration } from './timeline-ops';
import type { TimelineEditOperation, TimelineTrack } from './types';

const tracks = (): TimelineTrack[] => [
  {
    id: 'track-1',
    kind: 'video',
    visible: true,
    muted: false,
    clips: [
      { id: 'clip-1', label: 'Hook', start: 0, duration: 3, hasAudio: true },
      { id: 'clip-2', label: 'B-roll', start: 3, duration: 2, hasAudio: false }
    ]
  },
  {
    id: 'track-2',
    kind: 'audio',
    visible: true,
    muted: false,
    clips: [{ id: 'clip-3', label: 'BGM', start: 0, duration: 5, hasAudio: true }]
  }
];

const op = (id: string, operation: TimelineEditOperation['op']): TimelineEditOperation => ({
  id,
  label: id,
  op: operation
});

describe('timelineDuration', () => {
  it('returns the latest clip end across tracks', () => {
    expect(timelineDuration(tracks())).toBe(5);
  });

  it('returns 0 for an empty timeline', () => {
    expect(timelineDuration([])).toBe(0);
  });
});

describe('applyOperations', () => {
  it('does not mutate the input tracks', () => {
    const before = tracks();
    applyOperations(before, [op('a', { type: 'delete', clipId: 'clip-1' })]);
    expect(before[0].clips).toHaveLength(2);
  });

  it('deletes a clip by id', () => {
    const after = applyOperations(tracks(), [op('a', { type: 'delete', clipId: 'clip-2' })]);
    expect(after[0].clips.map((clip) => clip.id)).toEqual(['clip-1']);
  });

  it('retimes a clip and keeps clips ordered by start', () => {
    const after = applyOperations(tracks(), [
      op('a', { type: 'set-timing', clipId: 'clip-1', start: 4, duration: 1 })
    ]);
    expect(after[0].clips.map((clip) => clip.id)).toEqual(['clip-2', 'clip-1']);
  });

  it('clamps a negative start and a zero duration', () => {
    const after = applyOperations(tracks(), [
      op('a', { type: 'set-timing', clipId: 'clip-1', start: -5, duration: 0 })
    ]);
    const clip = after[0].clips.find((item) => item.id === 'clip-1');
    expect(clip?.start).toBe(0);
    expect(clip?.duration).toBeGreaterThan(0);
  });

  it('splits a clip at an absolute time into two halves', () => {
    const after = applyOperations(tracks(), [op('a', { type: 'split', clipId: 'clip-1', at: 1 })]);
    const [first, second] = after[0].clips;
    expect(first).toMatchObject({ id: 'clip-1', start: 0, duration: 1 });
    expect(second).toMatchObject({ id: 'clip-1-b', start: 1, duration: 2 });
  });

  it('leaves a clip alone when the split point falls outside it', () => {
    const after = applyOperations(tracks(), [op('a', { type: 'split', clipId: 'clip-1', at: 9 })]);
    expect(after[0].clips).toHaveLength(2);
  });

  it('adds a clip to the named track', () => {
    const after = applyOperations(tracks(), [
      op('a', {
        type: 'add-clip',
        trackId: 'track-1',
        clip: { id: 'clip-9', label: 'New', start: 5, duration: 1, hasAudio: false }
      })
    ]);
    expect(after[0].clips.map((clip) => clip.id)).toEqual(['clip-1', 'clip-2', 'clip-9']);
  });

  it('is idempotent when adding a track that already exists', () => {
    const track: TimelineTrack = { id: 'track-1', kind: 'video', visible: true, muted: false, clips: [] };
    const after = applyOperations(tracks(), [op('a', { type: 'add-track', track })]);
    expect(after).toHaveLength(2);
  });

  it('toggles a track flag', () => {
    const after = applyOperations(tracks(), [
      op('a', { type: 'set-track-flag', trackId: 'track-2', flag: 'muted', value: true })
    ]);
    expect(after[1].muted).toBe(true);
  });

  it('ignores operations that point at a missing clip', () => {
    const after = applyOperations(tracks(), [op('a', { type: 'delete', clipId: 'nope' })]);
    expect(after).toEqual(tracks());
  });

  it('applies operations in order', () => {
    const after = applyOperations(tracks(), [
      op('a', { type: 'split', clipId: 'clip-1', at: 1 }),
      op('b', { type: 'delete', clipId: 'clip-1-b' })
    ]);
    expect(after[0].clips.map((clip) => clip.id)).toEqual(['clip-1', 'clip-2']);
  });
});

describe('buildPreview', () => {
  it('marks untouched clips as unchanged', () => {
    const before = tracks();
    const preview = buildPreview(before, before);
    expect(preview.flatMap((row) => row.clips).every((entry) => entry.status === 'unchanged')).toBe(true);
  });

  it('marks retimed clips as changed', () => {
    const before = tracks();
    const after = applyOperations(before, [
      op('a', { type: 'set-timing', clipId: 'clip-1', start: 0, duration: 1 })
    ]);
    const entry = buildPreview(before, after)[0].clips.find((item) => item.clip.id === 'clip-1');
    expect(entry?.status).toBe('changed');
  });

  it('keeps deleted clips as removed ghosts at their original position', () => {
    const before = tracks();
    const after = applyOperations(before, [op('a', { type: 'delete', clipId: 'clip-2' })]);
    const entry = buildPreview(before, after)[0].clips.find((item) => item.clip.id === 'clip-2');
    expect(entry?.status).toBe('removed');
    expect(entry?.clip.start).toBe(3);
  });

  it('flags a brand new track and its clips as added', () => {
    const before = tracks();
    const track: TimelineTrack = {
      id: 'track-captions',
      kind: 'video',
      visible: true,
      muted: false,
      clips: [{ id: 'cap-1', label: 'Caption', start: 0, duration: 3, hasAudio: false }]
    };
    const after = applyOperations(before, [op('a', { type: 'add-track', track })]);
    const row = buildPreview(before, after)[2];
    expect(row.isNewTrack).toBe(true);
    expect(row.clips[0].status).toBe('added');
  });
});

describe('summarizePreview', () => {
  it('counts additions, removals, retimes and new tracks', () => {
    const before = tracks();
    const after = applyOperations(before, [
      op('a', { type: 'delete', clipId: 'clip-2' }),
      op('b', { type: 'set-timing', clipId: 'clip-1', start: 0, duration: 1 }),
      op('c', {
        type: 'add-clip',
        trackId: 'track-1',
        clip: { id: 'clip-9', label: 'New', start: 4, duration: 1, hasAudio: false }
      })
    ]);
    expect(summarizePreview(buildPreview(before, after))).toEqual({
      added: 1,
      removed: 1,
      changed: 1,
      newTracks: 0
    });
  });
});
