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
| Platform APIs (`generateScript`, t2v/i2v generation, voiceover, library) | **Mocked** — return shaped sample data after a short delay |
| Icons (`@fe-infra/keystone-icons-react`), router (`@edenx/runtime/router`) | Local stubs |

Running a Hook/Body/CTA/Text node produces sample script copy; running an Image/Video/
Avatar node resolves to a placeholder tile; the Agent panel builds a real Hook → Body → CTA
chain on the canvas. Nodes with no platform endpoint (Split A/V, Split Tracks, Timeline,
Batch) surface `No backend wired for this node yet`, exactly as in the real app.

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
