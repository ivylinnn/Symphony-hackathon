# Symphony Canvas — Flora-style node canvas

Branch: `Canvas+editor` (cut from `origin/master` @ `2b875d2dec`)
App: `apps/web/creative-cue`
Route: `/creative/creativestudio/canvas`

## What's in this zip

Paths mirror the repo, rooted at `apps/web/creative-cue/`.

| Path | Notes |
|---|---|
| `src/pages/canvas/**` | The whole feature (new) |
| `src/entries/home/routes/__auth/canvas/page.tsx` | Route entry (new) |
| `modified/**` | Full current copies of the 2 files that were edited in place |
| `canvas-feature.patch` | **Everything in one patch**, verified to apply onto clean `origin/master` |

The two modified files add the side-nav entry only:
- `src/components/SideNavigation/index.tsx` — "Canvas" item, placed above Agent
- `src/hooks/miniappMenu/useDefaultMenuItem.tsx` — `MenuIds.Canvas`

See `APPLY.md` for the pickup instructions. Short version:

```
git checkout -b Canvas+editor origin/master && git apply canvas-feature.patch
```

## Layout

```
src/pages/canvas/
├── index.tsx                     canvas surface: pan/zoom, drag, wiring, panels
├── types.ts                      node/edge/port/viewport model
├── const.ts                      NODE_KIND_CONFIG (per-kind ports, body, height), seed graph
├── utils.ts                      coordinate math, port geometry, bezier, fitView
├── graph-ops.ts                  pure node/edge builders
├── hooks/
│   ├── use-canvas-viewport.ts    wheel/pinch zoom, pan
│   ├── use-canvas-graph.ts       graph CRUD
│   ├── use-canvas-connections.ts edge creation (exact port / best-match)
│   ├── use-canvas-bulk-ops.ts    marquee selection: bulk delete / duplicate
│   └── use-node-execution.ts     run a node, generating→done/idle
├── services/
│   ├── agent.ts                  agent prompt → Hook/Body/CTA script sections
│   ├── node-runner.ts            node kind → platform capability dispatch
│   ├── generation.ts             t2v / i2v / i2i create + poll
│   └── products.ts               product context for generateScript
└── components/
    ├── NodeCard.tsx              card, ports, editable prompt, run button
    ├── NodeHoverToolbar.tsx      Auto / Tools / lock / duplicate / … on hover
    ├── NodePalette.tsx           searchable node panel (+ button and card ⊕)
    ├── AssetLibraryPanel.tsx     add from library
    ├── CanvasSidebar.tsx         left vertical pill toolbar
    ├── EdgeLayer.tsx             bezier connections
    ├── SelectionToolbar.tsx      top toolbar shown while nodes are selected
    ├── AgentPanel.tsx            right chat panel, collapses to FAB
    ├── TimelineEditor.tsx        full-screen multi-track video editor
    └── nodeIcons.tsx             per-kind and per-port-type icons
```

## Canvas interaction

| Input | Action |
|---|---|
| drag on empty canvas | marquee select (intersecting nodes) |
| space + drag / middle drag | pan |
| trackpad two-finger | pan |
| ctrl/⌘ + wheel | zoom at pointer |
| shift + drag / shift + click | add to selection |
| ⌘/ctrl + A | select all |
| Esc | clear selection |
| Backspace / Delete | delete selection |
| drag from an output port | draw a connection; release on a card, a port, or empty canvas |
| double-click a Timeline node | open the timeline editor |

Selecting anything reveals a top toolbar: `N selected · Save as template · Duplicate · Select all · Export · Lock · Delete`.

## Node categories

- **Ads-native** — Hook, Body, CTA
- **Creative** — Text, Image, Video, Audio, Avatar, Import
- **Edit** — Split A/V, Split Tracks, Timeline, Batch

## Backend wiring

Wired to existing platform capabilities:

| Node | API |
|---|---|
| Hook / Body / CTA / Text | `generateScript` — needs real product context, pulled via `listProducts`; picks the section matching `ScriptType` |
| Video | upstream asset → `i2v.createGenerationTask`, otherwise `t2v.createGenerationTask`; polls `checkGenTask` |
| Image | `i2v.genI2IImage` (platform image gen requires a reference image) |
| Avatar | i2v with a portrait reference |
| Audio | `generateVoiceover` (TTS) |
| Library panel | `getMyLibrary`, falls back to sample data |
| Agent panel | `generateScript` → materialises a connected Hook → Body → CTA chain onto the canvas |

Models are inlined as constants in `services/generation.ts` (seedance `5000003`/`4000003`, nanoBanana `gemini`) rather than importing `I2VModelType` from `@ad-creative/creative-cue-biz`, whose `dist` isn't built and would introduce TS6305.

**Not wired:** Split A/V, Split Tracks, Timeline, Batch — no corresponding platform endpoint exists. These surface `No backend wired for this node yet` rather than faking success.

`Save as template`, `Export` and `Lock` in the selection toolbar are also placeholders — there is no template/export endpoint in `endpoints.ts`. They currently log to the console rather than pretending to succeed.

## Status

- 31 tests passing (`index.test.tsx` 24, `services/node-runner.test.ts` 7)
- ESLint 0 errors (remaining warnings are `no-magic-numbers`, which this repo sets to warn)
- `tsc --noEmit` clean for `src/pages/canvas`

Run tests:

```
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/edenx test src/pages/canvas
```

## Not verified

The generation endpoints have **not** been executed against a live account. Request shapes, polling and completion predicates follow the existing i2v miniapp implementation, but no real generation round-trip has been observed. `generateScript` in particular requires at least one saved product on the account.

## Repo-specific gotchas found while building this

These cost real debugging time and are easy to hit again:

1. **This Tailwind build has no `shadow-*` scale.** Use arbitrary values (`shadow-[0_1px_3px_rgba(...)]`).
2. **Preflight is off**, so `border` alone yields `border-style: none` and collapses to 0 width. Always pair with `border-solid`.
3. **`neutral-borderLow` / `borderMed` / `border` resolve to transparent.** Use `neutral-fillLow` for visible borders.
4. **`neutral-fill` is mid-grey (135,137,139)**, not dark. For an inverted dark surface use `neutral-fillHigh` (38,38,39).
5. **An SVG sized 0×0 does not paint its overflow in Chrome** — this silently deleted every connection line while tests stayed green. `EdgeLayer` uses `h-px w-px` + `overflow-visible`.
6. **A `<span>` is `display: inline`**, so width/height are ignored — port dots collapsed to 0×0 until given `block`.
7. **`symphony/tailwind-must-use-token`** lint rule bans literal colour values.
8. Component tests use `createRoot` + `react-dom/test-utils` `act`. `@testing-library/react` pulls its own React copy and fails with a dual-instance `useRef` error.
