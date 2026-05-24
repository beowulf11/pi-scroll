# Pi Scroll TODO

## Current architecture notes

Pi Scroll is a Pi extension that adds `/scroll`, a Telescope-style session-history search UI.

Current search pipeline:

1. Pick a search root:
   - default: current cwd/session directory, matching Pi's `-r` style project-local behavior
   - `Ctrl+G`: toggle global history under `~/.pi/agent/sessions`
2. Run ripgrep on demand over JSONL session files:
   - fixed-string search by default, regex via `Ctrl+R` / `Ctrl+S`
   - case-insensitive
   - bounded by configurable `--max-count`
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

- [x] Kill/cancel the previous active `rg` process when regenerating search results for a new query/scope/filter.
  - Search now uses an `AbortController`; stale child processes are killed before the next search starts.
- [x] Keep result grouping simple: one best result per session file.
  - We tried an expanded-results `Ctrl+E` mode and removed it because it was confusing in practice.
  - If revisited later, design it as a separate, explicit UI instead of a hidden toggle.
- [x] Add search mode toggle (`Ctrl+R` / `Ctrl+S`).
  - Fixed string is the default, fastest, safest mode.
  - Regex uses native ripgrep regex.
  - UI shows current mode in the Results title/help line.
- [x] Add ripgrep max-count.
  - Default: `--max-count 10` per file.
  - Purpose: prevent very noisy sessions/tool outputs from flooding candidate processing.
  - Configurable via `ripgrepMaxCount`.
- [x] Handle missing `rg`/ripgrep explicitly in the dialog with installation guidance.
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
- [x] Add persistent user defaults for scope, filters, preview, and max results.
- [x] Add user-facing config file loading, e.g. `~/.pi/agent/pi-scroll.json` and `.pi/pi-scroll.json`.
- [ ] Validate config values instead of blindly merging JSON.
  - Today invalid enum values or nonsensical numbers can enter runtime config.

## UI

- [x] Add Telescope-style Results / Find Sessions frame.
- [x] Add optional Preview pane.
- [x] Add `Ctrl+O` to open/close preview.
- [x] Add `Ctrl+T` to toggle `chat`/`all` filters.
- [ ] Make dialog sizing fully configurable.
  - Basic width/height behavior is configurable now, but overlay width/minWidth and some layout thresholds are still hard-coded.
- [x] Improve keyboard help as shortcuts grow; possibly compact help/footer.
- [ ] Improve match highlighting and ANSI-safe truncation further.
- [ ] Add better empty states per scope/filter/mode.

## Preview/open behavior

- [ ] Add configurable preview detail: matched entry only vs surrounding context vs session start.
- [ ] Add per-result metadata: date, entry id, session name.
  - CWD, role, and line number are already shown.
- [ ] Decide whether Enter switches to session only or also navigates to matching entry.
- [ ] Consider opening branch/tree location for selected match.
- [ ] Cancel stale preview loading more explicitly if selected result changes.
  - Current implementation uses a generation check; fine for correctness, but true cancellation would be cleaner for very large sessions.

## Packaging/testing

- [ ] Add `assets/screenshot.png`, uncomment the README image, and verify `pi.image` renders in the package gallery.
- [ ] Verify package install via local path: `pi install ./`.
- [ ] Verify package listing metadata via `pi list` / package gallery expectations.
- [x] Add tests for session parsing, ripgrep parsing, input handling, scope path mapping, filtering, and UI rendering.
- [ ] Add fixtures covering user messages, assistant text, tool calls, labels, session names, compactions.
- [ ] Add/repair tests for search mode toggle.
- [ ] Add tests for active ripgrep process cancellation.
- [ ] Add a package smoke test that confirms `package.json` exposes the Pi manifest and npm tarball contains only runtime files.
