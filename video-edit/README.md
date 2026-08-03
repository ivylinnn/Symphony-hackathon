# hackathon_video — selling-point cut

The original 30s hoodie skate footage (`hackathon_video.mp4`, 1080×1920@30) with the
product's core selling points added as kinetic typography. **The video timeline and the
background music are untouched** — no cuts, no speed changes, no zooms; the audio stream
is copied bit-for-bit from the source (verified byte-identical).

Outputs (1080×1920, 30fps):
- [`hackathon_video_selling_points.mp4`](./hackathon_video_selling_points.mp4) — 30s, text beats only
- [`hackathon_video_selling_points_endcard.mp4`](./hackathon_video_selling_points_endcard.mp4) — 33s, same cut plus a 3s AURAK end card with a **PURCHASE NOW →** CTA

## Text beats

| Time | Copy | Animation | Timed to |
|---|---|---|---|
| 0.7–2.9 | `MORE THAN A HOODIE` | fade up | opening push-off |
| 4.3–6.0 | `01` · `BREATHABLE FABRIC` | damped spring-pop + underline draw-in | the glowing-board kickflip |
| 6.6–9.3 | `02` · `VERSATILE LAYERING` | words slide in from opposite sides | fence-line ride |
| 10.3–13.2 | `03` · `FUNCTIONAL` / `KANGAROO` / `POCKET` | 3-line stagger + growing accent bar | low-angle street cruise |
| 17.4–19.7 | `04` · `RELAXED, COMFORTABLE FIT` | slow fade + gentle drift | lazy side-on glide |
| 22.4–25.5 | `05 · IDEAL FOR` / `ACTIVE + EVERYDAY WEAR` | spring-pop + underline | upright dome cruise |
| 26.9–29.6 | `YOUR EVERYDAY HOODIE` | fade up/out | riding into the sunset |
| 30.1–33.1 | AURAK end card — `Crafted for Motion` · `PURCHASE NOW →` · `AURAK.COM` | fade from black, staggered reveal, slow push-in, breathing gold CTA | still of the final sunset-alley frame, graded dark to the brand reference |

The two flip tricks (13.5–17s and 19.8–21.7s) are deliberately left clean so the
footage breathes between text beats.

Design: Big Shoulders Bold, accent `#FF6B1A` sampled from the glowing board /
golden-hour palette, numbered kickers, subtle border + shadow for legibility
(no scrims — the image is never darkened).

## Reproduce

```
python3 build.py     # needs ffmpeg 6.1+; writes hackathon_video_selling_points.mp4
python3 endcard.py   # renders the 3s end card and appends it via stream copy
```

Point `SRC` at the top of `build.py` to `hackathon_video.mp4`. Two render passes
(ffmpeg 6.1 segfaults if a filtergraph contains more than one expression-driven
`fontsize` drawtext, so the two spring-pop lines get one pass each; all fixed-size
text rides along). Audio is muxed with `-c:a copy`.
