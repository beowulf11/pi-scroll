# Scroll TODO

## Current architecture notes

Scroll is a Pi extension that adds `/scroll`, a Telescope-style session-history search UI.

Current search pipeline:

1. Pick a search root:
   - default: current cwd/session directory, matching Pi's `-r` style project-local behavior
   - `Ctrl+G`: toggle global history under `~/.pi/agent/sessions`
2. Run ripgrep on demand over JSONL session files:
   - currently fixed-string, case-insensitive search
   - returns JSON events via `rg --json`
3. Parse only matching JSONL lines.
4. Filter/score candidates:
   - `chat` mode avoids tool calls/results by default
   - `all` mode includes tool-heavy matches
   - `Ctrl+T`: toggle `chat`/`all`
5. Render:
   - first line: session title / first user input
   - second line: match snippet, panned to keep the actual match visible
   - optional preview pane, toggle with `Ctrl+O`

The design goal is no persistent index/preprocessing for now. Ripgrep is the fast first pass; TypeScript post-processing makes the raw JSONL matches usable.

## Search backend

- [ ] Kill/cancel the previous active `rg` process when regenerating search results for a new query/scope/filter.
  - Today stale results are generation-ignored, but the old process may still burn CPU briefly.
  - Keep the active child process/abort handle in the search controller and terminate it before spawning the next one.
- [ ] Add `Ctrl+E` / expanded-results mode.
  - Current default is one best result per session file.
  - Expanded mode should show all matching entries, not only the best match per session.
  - Useful when you know a session has many relevant hits and want to pick a specific one.
  - Needs config/default: `groupBySession: true | false` or `resultMode: "session" | "matches"`.
- [ ] Add search mode toggle, likely `Ctrl+S`.
  - Modes to consider:
    - fixed string: current default, fastest and safest
    - regex: native ripgrep regex
    - later fuzzy/semantic-ish mode: probably slower and maybe not ripgrep-only
  - UI should show current mode in the Results title/help line.
- [ ] Add ripgrep max-count.
  - Sensible default: `--max-count 10` per file.
  - Purpose: prevent very noisy sessions/tool outputs from flooding candidate processing.
  - Make configurable because expanded mode may want a larger value.
- [ ] Handle missing `rg`/ripgrep explicitly in the dialog with installation guidance.
- [ ] Continue tuning role filters and ranking; tool results are useful but noisy.
- [ ] Add optional debug display for why a result won:
  - role
  - score
  - snippet source: semantic vs raw JSON fallback
  - matched term(s)

## Scope/configuration

- [x] Add search scope toggle: current cwd/project only vs all Pi history (`Ctrl+G`).
- [ ] Add config for history/session directory override.
- [ ] Add option to include/exclude current active session.
- [ ] Add persistent user defaults for scope, filters, preview, and max results.
- [ ] Add user-facing config file loading, e.g. `~/.pi/agent/scroll.json` and `.pi/scroll.json`.

## UI

- [x] Add Telescope-style Results / Find Sessions frame.
- [x] Add optional Preview pane.
- [x] Add `Ctrl+O` to open/close preview.
- [x] Add `Ctrl+T` to toggle `chat`/`all` filters.
- [ ] Make dialog sizing fully configurable.
- [ ] Improve keyboard help as shortcuts grow; possibly compact help/footer.
- [ ] Improve match highlighting and ANSI-safe truncation further.
- [ ] Add better empty states per scope/filter/mode.

## Preview/open behavior

- [ ] Add configurable preview detail: matched entry only vs surrounding context vs session start.
- [ ] Add per-result metadata: date, cwd, role, entry id, session name.
- [ ] Decide whether Enter switches to session only or also navigates to matching entry.
- [ ] Consider opening branch/tree location for selected match.
- [ ] Cancel stale preview loading more explicitly if selected result changes.
  - Current implementation uses a generation check; fine for correctness, but true cancellation would be cleaner for very large sessions.

## Packaging/testing

- [ ] Verify package install via local path: `pi install ./`.
- [x] Add tests for session parsing, ripgrep parsing, input handling, scope path mapping, filtering, and UI rendering.
- [ ] Add fixtures covering user messages, assistant text, tool calls, labels, session names, compactions.
- [ ] Add tests for expanded-results mode once implemented.
- [ ] Add tests for search mode toggle once implemented.
- [ ] Add tests for active ripgrep process cancellation once implemented.
