# Symphony Canvas — standalone UI demo

This repo holds the **Symphony Canvas** feature (see [`README.md`](./README.md)) plus a
small harness that runs the canvas UI as a **standalone web app** so it can be deployed
and clicked through without the private `creative-cue` monorepo.

The feature source under [`src/pages/canvas/`](./src/pages/canvas) is **unchanged**. Every
internal dependency it expects is supplied by a local stub, wired up through Vite aliases
and a Tailwind token config — nothing in the feature code was edited to make the demo run.

## What's real vs. mocked

| Area | In the demo |
|---|---|
| Canvas surface — pan / zoom, drag, marquee select, wiring, panels, timeline editor | **Real** feature code, fully interactive |
| Node cards, ports, hover toolbars, selection toolbar, palette, asset library, agent panel | **Real** feature code |
| Design tokens (`neutral-*`, `primary-*`, …) | Reconstructed as a Tailwind theme in [`tailwind.config.cjs`](./tailwind.config.cjs) |
| Timeline AI editing — prompt → plan → diff preview → per-step apply → undo | **Real** feature code; the planning model behind it is mocked |
| Platform APIs (`generateScript`, t2v/i2v generation, voiceover, library) | **Mocked** — return shaped sample data after a short delay |
| Icons (`@fe-infra/keystone-icons-react`), router (`@edenx/runtime/router`) | Local stubs |

Running a Hook/Body/CTA/Text node produces sample script copy; running an Image/Video/
Avatar node resolves to a placeholder tile; the Agent panel builds a real Hook → Body → CTA
chain on the canvas. Nodes with no platform endpoint (Split A/V, Split Tracks, Timeline,
Batch) surface `No backend wired for this node yet`, exactly as in the real app.

## AI editing in the timeline

Open a video node's **Edit** button to get the full-screen timeline editor. The timeline is
built from that node's actual video and broken into editable elements rather than one
opaque block:

- a **video track** cut into scenes (Hook / Body / Proof / CTA), one per ~7s of source
- a **transition track** with a cross dissolve or whip pan straddling each seam
- a **music track** carrying a bed under the whole cut

Every scene keeps its own in-point into the source, so dragging, splitting or deleting any
one of them changes only that stretch of picture.

Clips carry a source mapping (`sourceStart` / `sourceDuration`) alongside their timeline
position, which is what makes the editing real: splitting divides the in-points so each
half plays its own frames, deleting the head makes the tail start from its own footage,
and retiming changes playback rate rather than content. Playback resolves the playhead to
the active clip and seeks the video to the mapped source time, so gaps play nothing and
hidden tracks don't drive the preview. Clips without a `sourceUrl` — captions, music beds —
never hijack the picture.

Split, duplicate and delete in the toolbar run through the same operations the agent uses.

## The AI editor

The right-hand panel is a conversational editing agent, not a one-shot prompt box. A turn
runs the way a Claude turn does:

1. **Ask** — "trim to 15 seconds", "make it shorter", "add captions", "lay in a music bed",
   "remove the hook", "make the hook punchier", "split", "mute the music".
2. **Think** — the reasoning trace streams in step by step and cites the real timeline
   ("Reading the timeline — 3 tracks (video, transition, audio), 4 clips, 30.1s total"),
   then collapses to `Thought for N steps` once it lands. Click to expand it again.
3. **Ask back, when it should** — a vague instruction gets a question instead of a guess.
   "Make it shorter" asks what length to hit; "remove that clip" asks which one, listing
   the clips by name. Answering appends your choice to the original request and re-runs it,
   so the answer genuinely changes the result rather than replaying a canned branch.
4. **Propose** — the plan arrives as individually checkable steps, previewed on the
   timeline: added clips draw green-dashed, retimed clips blue-dashed, and deleted clips
   stay put as red-dashed struck-through ghosts so you see what you'd lose. Unchecking a
   step re-renders the preview without it, so you can take half a plan.
5. **Apply, and keep the old copy** — applying commits only the checked steps and stamps a
   version (`Applied · v1`). Every applied turn keeps the timeline as it was beforehand, so
   **Revert to before** on any earlier turn restores that copy — history, not a single-slot
   undo.

Nothing mutates the timeline until you press Apply. The whole conversation stays in the
panel, so later turns read against the edits you already made. When an instruction doesn't
map to a timeline edit, the agent says so and suggests phrasings instead of inventing one.

The split is deliberate: [`timeline-ops.ts`](./src/pages/canvas/timeline-ops.ts) holds the
pure, unit-tested reducer over tracks/clips; [`services/timeline-ai.ts`](./src/pages/canvas/services/timeline-ai.ts)
validates and narrows the model's wire response into typed operations; only the planner
itself is mocked (keyword intent-matching in the `@/api` stub). Swapping in a real endpoint
means replacing that one function — the ops, diff, and UI are unchanged.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # -> dist/
npm run preview  # serve the production build
```

## How the stubs are wired

- [`vite.config.ts`](./vite.config.ts) aliases each internal specifier
  (`@/api`, `@/api/typings`, `@/api/bff-gen/*`, `@fe-infra/keystone-icons-react`,
  `@edenx/runtime/router`) to a file under [`src/_stubs/`](./src/_stubs).
- [`src/main.tsx`](./src/main.tsx) renders the real `CanvasPage` full-screen.
- To deploy inside the real product instead, ignore this harness and apply
  [`canvas-feature.patch`](./canvas-feature.patch) — see [`APPLY.md`](./APPLY.md).
