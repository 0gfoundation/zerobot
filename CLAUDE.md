# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [AGENTS.md](./AGENTS.md) for project architecture, build commands, and technical details. That file is the shared source of truth — keep both files in sync when making changes, without duplicating content between them.

## Claude-Specific Instructions

- When modifying smart contract interfaces, the ABIs live in **`sdk/src/chain/abis.ts`** (auto-generated — header says so; regenerate, don't edit by hand) and the TypeScript wrappers in `sdk/src/chain/client.ts` must be updated to match (drift here was a real bug — see `80d8a67`). The dashboard does not maintain its own ABIs anymore; it consumes contracts via `ChainClient` through `apps/dashboard/src/lib/chain.ts`. Struct returns must use `tuple` with `components` in the ABI — do not flatten into separate output parameters.
- The SDK has four public entry points (`.`, `./robot`, `./operator`, `./mock` — see AGENTS.md "SDK Public Entry Points"). The root barrel `sdk/src/index.ts` must stay browser-bundle-safe: never re-export the `robot`/`operator`/`mock` barrels or anything that statically imports a `node:` builtin, even transitively. Import `Commander` and command schemas from `./command` directly. When adding a public module, add its entry to the `exports` map in `sdk/package.json`.
- The SDK is ethers-internal but accepts viem `WalletClient` at the `ChainConfig` boundary (see `sdk/src/chain/adapter.ts`). Keep viem a type-only import (`import type { WalletClient } from "viem"`) and read its properties structurally — viem must stay an optional peer dependency, never a runtime dep. Any new code that touches a viem type should follow the same pattern.
- The dashboard follows patterns from the `0g-nexus` project at `/Users/will/Repos/0g-nexus`. When adding wallet interaction, UI components, or stores, reference that project for consistent patterns (class-based Svelte 5 stores, Wagmi Core v3 usage, Tailwind CSS 4 theme tokens).
- Use `pointerdown` (not `click` or `mousedown`) for click-outside-to-close handlers — it works on both desktop and touch devices.
