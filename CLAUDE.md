# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [AGENTS.md](./AGENTS.md) for project architecture, build commands, and technical details. That file is the shared source of truth — keep both files in sync when making changes, without duplicating content between them.

## Claude-Specific Instructions

- When modifying smart contract interfaces, update both `contracts/contracts/interfaces/` and the hand-maintained ABIs in `apps/dashboard/src/lib/contracts/abis.ts`. Struct returns must use `tuple` with `components` in the ABI — do not flatten into separate output parameters.
- The SDK has four public entry points (`.`, `./robot`, `./operator`, `./mock` — see AGENTS.md "SDK Public Entry Points"). The root barrel `sdk/src/index.ts` must stay browser-bundle-safe: never re-export the `robot`/`operator`/`mock` barrels or anything that statically imports a `node:` builtin, even transitively. Import `Commander` and command schemas from `./command` directly. When adding a public module, add its entry to the `exports` map in `sdk/package.json`.
- The dashboard follows patterns from the `0g-nexus` project at `/Users/will/Repos/0g-nexus`. When adding wallet interaction, UI components, or stores, reference that project for consistent patterns (class-based Svelte 5 stores, Wagmi Core v3 usage, Tailwind CSS 4 theme tokens).
- Use `pointerdown` (not `click` or `mousedown`) for click-outside-to-close handlers — it works on both desktop and touch devices.
