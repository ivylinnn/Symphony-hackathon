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
built from that node's actual video — one clip spanning the real media, at its real
duration — so every edit below changes what plays, not just what's drawn.

Clips carry a source mapping (`sourceStart` / `sourceDuration`) alongside their timeline
position, which is what makes the editing real: splitting divides the in-points so each
half plays its own frames, deleting the head makes the tail start from its own footage,
and retiming changes playback rate rather than content. Playback resolves the playhead to
the active clip and seeks the video to the mapped source time, so gaps play nothing and
hidden tracks don't drive the preview. Clips without a `sourceUrl` — captions, music beds —
never hijack the picture.

Split, duplicate and delete in the toolbar run through the same operations the AI uses.
The prompt panel takes a plain-language instruction and returns a **plan** rather than an
immediate mutation — the Flora-style propose → review → apply loop:

1. **Prompt** — "trim to 15 seconds", "add captions", "lay in a music bed", "remove the
   street b-roll", "make the hook punchier", "split", "mute the music".
2. **Preview** — the plan is applied to a throwaway copy and diffed against the current
   timeline. Added clips draw green-dashed, retimed clips blue-dashed, and deleted clips
   stay on the track as red-dashed struck-through ghosts so you see what you're losing.
3. **Review** — each step is an individually checkable line. Unchecking one re-renders the
   preview without it, so you can take half a plan.
4. **Apply / Undo** — applying commits only the checked steps and snapshots the previous
   timeline, so **Undo AI edit** restores it in one click.

Nothing mutates the timeline until you press Apply. When the instruction doesn't map to a
timeline edit, the agent says so and suggests phrasings instead of inventing an edit.

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
