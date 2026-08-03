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
├── content-strategies.ts         TikTok strategy presets + graph instantiation
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
    ├── ContentStrategiesPopover.tsx  empty-canvas strategy picker (6 preset workflows)
    ├── Minimap.tsx               bottom-right overview map, click/drag to navigate
    ├── TimelineEditor.tsx        full-screen multi-track video editor
    └── nodeIcons.tsx             per-kind and per-port-type icons
```

## Demo shell

The standalone demo now boots into a **Symphony Creative Studio home page** (`#/`): dark top
bar, icon side navigation (with a **Canvas** entry placed above Agent), quick-start cards,
recent projects (real video thumbnails), and a Top Ads trends strip sharing data with the
canvas trend node. The Canvas nav item and every card route to the canvas page (`#/canvas`);
the canvas Close button routes back home. Routing is a tiny hash router in `src/main.tsx`;
the home page lives in `src/pages/home/index.tsx`.

## Canvas interaction

| Input | Action |
|---|---|
| drag on empty canvas | marquee select with hand cursor (intersecting nodes; then edit/delete via toolbar) |
| shift + drag | add intersecting nodes to the existing selection |
| space + drag / middle drag | pan (grab → grabbing cursor) |
| trackpad two-finger | pan |
| ctrl/⌘ + wheel | smooth zoom at pointer (time-based exponential easing) |
| shift + click | add to selection |
| ⌘/ctrl + A | select all |
| Esc | clear selection / close strategies popover |
| Backspace / Delete | delete selection |
| drag from an output port | draw a connection; release on a card, a port, or empty canvas |
| double-click a Timeline node | open the timeline editor |
| minimap (bottom-right) | click / drag to move the viewport; blue frame is the visible area |

The canvas opens empty with the **TikTok Content Strategies** popover: six preset workflows
(Inspiration Video Replication, Product Swap, Hook/CTA Replacement, Character Swap, Clothing
Try-On, Seasonal Refresh). Picking one drops a pre-wired, fully editable node graph onto the
canvas and animates the view to fit. The popover reopens whenever the canvas becomes empty,
or via the "TikTok Content Strategies" pill (top-right). Zoom buttons and fit-view animate
with the same easing as the wheel zoom.

**Inspiration Video Replication** spawns a worked example modeled on a real Top Ads trend
(Don Quijote's garlic-paste ad): Product images (real hoodie shots, up to 20 images from the
computer or asset library) feed the Product brief; the brief, Brand kit, and TikTok trend
feed a Storyboard node (scene-by-scene frames with voiceover, scrollable, "+ Add frame"),
which feeds the final Video node playing the real 9:16 hoodie ad (`public/hoodie-ad.mp4`).
The Brand kit also uploads from the local computer or the asset library; the TikTok trend
node opens a Top Ads modal to swap in a different trend. These five "inspiration" node kinds
are also available from the ＋ palette under the Inspiration group.

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
