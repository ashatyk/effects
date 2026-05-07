# Effects

GPU image-effects platform for marketplaces. A three-tier monorepo: **author once, configure per listing, render anywhere.**

```
[ Editor ] ──PublishedPipeline.json──▶ [ Supplier ] ──SupplierConfig.json──▶ [ Player ]
   Tier 1                                  Tier 2                              Tier 3
```

- **Tier 1 — Editor** (`apps/editor`): visual node graph for designers. Wire processors on a React Flow canvas; live preview at 60 FPS via PixiJS/WebGL2. Publish surface generates a curated supplier-facing manifest.
- **Tier 2 — Supplier app** (`apps/supplier`): file-picker form. Suppliers upload images, draw segments (SAM), tweak exposed parameters, and export per-listing config JSON. Live preview runs the same engine as the editor.
- **Tier 3 — Web player** (`packages/player` + `apps/player` demo): framework-agnostic runtime. `EffectPlayer.create({ pipeline, config, canvas })` mounts an effect into any canvas — zero-copy direct render, hit-tested tap zones, ~80 MB steady-state memory. Native iOS / Android runtimes will reimplement the same public surface.

## Repo layout

```
packages/
├── runtime/    @effects/runtime    # DataflowEngine + processors + effects + publish + SAM
├── player/     @effects/player     # EffectPlayer + applyOverrides + SupplierConfig
└── ui/         @effects/ui         # MUI widgets + dark theme

apps/
├── editor/     @effects/editor         # Tier-1 visual editor
├── supplier/   @effects/supplier       # Tier-2 supplier form
└── player/     @effects/player-demo    # Tier-3 web player demo
```

## Quick start

```bash
npm install
npm run dev:editor      # http://localhost:5173
npm run dev:supplier    # http://localhost:5174
npm run dev:player      # http://localhost:5175
```

Each app's Vite config aliases `@effects/*` directly to workspace TS source — no separate package build step.

## Stack

React 19, Vite 8, TypeScript 5.9, PixiJS 8 (WebGL2), MUI 9, @xyflow/react 12, Dexie 4, SAM (Segment Anything) via web worker.

## Documentation

Full architecture and per-subsystem references live in [`.cursor/rules/`](./.cursor/rules/) — all loaded as Cursor `alwaysApply` rules. Start with:

- [`product-vision.mdc`](./.cursor/rules/product-vision.mdc) — three-tier vision, architectural invariants.
- [`project-overview.mdc`](./.cursor/rules/project-overview.mdc) — directory structure, tech stack, lifecycle.
- [`node-engine.mdc`](./.cursor/rules/node-engine.mdc) — `DataflowEngine`, `BaseProcessor`, GPU helpers.
- [`processors-catalogue.mdc`](./.cursor/rules/processors-catalogue.mdc) — per-processor reference (29 nodes).
- [`effects-catalogue.mdc`](./.cursor/rules/effects-catalogue.mdc) — per-effect reference (8 manifests).
- [`publish-plane.mdc`](./.cursor/rules/publish-plane.mdc), [`supplier-app.mdc`](./.cursor/rules/supplier-app.mdc), [`player.mdc`](./.cursor/rules/player.mdc) — Tier-2/Tier-3 contracts.
