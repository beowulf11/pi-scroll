# Release process

This package is published in two places:

1. npm, so Pi users can install it with `pi install npm:pi-scroll`.
2. GitHub, so the source, tag, and npm tarball are available from the repository release.

## Prerequisites

- Logged into npm: `npm whoami`
- Logged into GitHub CLI: `gh auth status`
- A GitHub remote configured, usually:

```bash
git remote add origin git@github.com:beowulf11/pi-scroll.git
```

## Preflight

Run all local checks:

```bash
vp check
vp test
npm pack --dry-run
```

Confirm `package.json` is publish-ready:

- `name` is `pi-scroll`
- `private` is `false`
- `keywords` includes `pi-package`
- `pi.extensions` points at `./extensions`
- `pi.image` points at the versioned screenshot URL on unpkg
- `assets/screenshot.png` exists and is included in the dry-run package

If the package version changes, update both:

```json
"version": "x.y.z",
"pi": {
  "image": "https://unpkg.com/pi-scroll@x.y.z/assets/screenshot.png"
}
```

## Publish to npm

```bash
npm publish
```

Then smoke-test the published package:

```bash
pi -e npm:pi-scroll
```

Inside Pi, run:

```text
/scroll
```

## GitHub release

Create the exact tarball that npm would publish:

```bash
npm pack
```

Commit the release version if needed, tag it, and push:

```bash
git tag v$(node -p "require('./package.json').version")
git push origin main --tags
```

Create a GitHub release and attach the npm tarball:

```bash
VERSION=$(node -p "require('./package.json').version")
gh release create "v$VERSION" "pi-scroll-$VERSION.tgz" \
  --title "pi-scroll v$VERSION" \
  --notes "Pi Scroll adds /scroll, a fast keyboard-driven Pi session history search dialog with rich previews."
```

Clean up the local tarball after the release is uploaded:

```bash
rm "pi-scroll-$VERSION.tgz"
```
