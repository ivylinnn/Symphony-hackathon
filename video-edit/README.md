# hackathon_video — 15s vertical cut

Product cut of the hoodie skate footage (`hackathon_video.mp4`, 30s, 1080×1920@30),
edited down to 15s with one editing technique per 3-second beat.

Output: [`hackathon_video_15s.mp4`](./hackathon_video_15s.mp4) — 1080×1920, 30fps, exactly 15.000s, AAC audio.

## Technique map

| Time | Technique | What was done |
|---|---|---|
| 0–3s | **Visual hook** | Hero kickflip (glowing board), slowed to 0.8× via 60fps motion interpolation. Push-in zoom 1.08→1.24 with a snap-zoom punch + white flash the instant the board ignites. `BUILT TO MOVE` spring-pops in. SFX: pitch riser into a sub-bass impact. |
| 3–6s | **Jump cut** | 4 hard cuts from the fence line, durations shrink 0.95→0.80→0.65→0.60s and each cut punches in further (1.09→1.42×) with reframing — pacing accelerates. |
| 6–9s | **Angle change** | Tight side-on at the graffiti wall (slow push-in) → wide from-behind riding into the sun (slow pull-out). Opposite camera moves sell it as multi-angle coverage. |
| 9–12s | **Animated text** | The selling points pop in sequentially — `BREATHABLE FABRIC / LAYERS OVER ANYTHING / KANGAROO POCKET / RELAXED FIT` — each with a damped-spring scale + slide-in, over a bottom scrim, with a growing orange accent bar and a UI tick per line. |
| 12–15s | **Speed ramp** | Second trick, 120fps motion-interpolated, driven through a smooth tanh time-warp: 2.2× → 0.25× at the peak of the trick → 2.2×. Contrast/saturation lift and a push-in follow the slow section; audio is ramped in matching steps. `ACTIVE + EVERYDAY` closer. Whoosh + landing impact SFX. |

Notes:
- All SFX are synthesised (`aevalsrc`) — no external samples.
- Audio is loudness-normalised to −14 LUFS (social-platform target), true peak −1 dB.
- The source's `AI-generated` provenance label is cropped away by the zooms, so it is
  re-applied once, bottom-left, across the full cut.
- Accent color `#FF6B1A` is picked from the glowing board / golden-hour palette.

## Reproduce

```
python3 build.py   # needs ffmpeg 6.1+; writes hackathon_video_15s.mp4
```

`build.py` expects the source upload path at the top of the file; point `SRC` at
`hackathon_video.mp4` to re-render. Intermediates (motion-interpolated clips, per-segment
video/audio, SFX) land in `work/` and are cached between runs.

Two ffmpeg 6.1 quirks the script works around:
- `crop`/`drawbox` can't animate per frame → animated zooms use `scale … eval=frame` + fixed
  center crop, and the growing bar is a color source scaled per frame.
- More than one expression-`fontsize` `drawtext` per filtergraph segfaults → the four feature
  lines are burned in one pass each.
