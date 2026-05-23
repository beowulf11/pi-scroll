# Scroll

A Pi package that adds `/scroll`, an on-the-fly ripgrep-backed session history search dialog.

## Goals

- No runtime npm dependencies.
- No persistent preprocessing/indexing for the initial version.
- Search Pi JSONL session files with `rg` on demand.
- Select a result and switch Pi to that session.

## Development

This repo is intended to use `vp` for local tasks:

```bash
vp install
vp test
vp check
```

## Local Pi usage

From this repo:

```bash
pi -e ./extensions/scroll.ts
```

Or install the package by local path:

```bash
pi install ./
```

Then run inside Pi:

```text
/scroll
```

Type to search, use `Up`/`Down` or `Ctrl+P`/`Ctrl+N`/`Ctrl+E`, and press `Enter` to switch to the selected session.

## Configuration

Defaults live in `src/config.ts`. User overrides are loaded from:

```text
~/.pi/agent/scroll.json
```

Project overrides are loaded from:

```text
.pi/scroll.json
```

Example:

```json
{
  "preview": false
}
```

The built-in default is `preview: true`; the preview is only shown when terminal width permits it.

## Runtime requirement

`rg`/ripgrep must be available in `PATH` for now. Missing-ripgrep UI/error handling is tracked in `TODO.md`.
