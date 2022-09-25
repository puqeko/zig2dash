# zig2dash

Zig presents std lib docs via webapp. A json dump is exported during compilation. The page loads this dump then traverses the data while navigating the docs. This is terrible for Dash, which requires a docset (indexed set of html pages). Linking to web app would cause too much delay showing each page.

The json dump requries knowledge of Zig Intermediate Representation. Would require re-writing main.js to produce static output which is non trivial.

Solution: load the webapp via jsdom, traverse each hash and export the generated html as a page, replacing links as needed. Allows for changes to zig autodoc (which is experimental) without knowing about ZIR.

Notes:
- `websrc` directory contains files (index, main, data) pulled from https://ziglang.org/documentation/master/std/.

# Setup

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.js
```

This project was created using `bun init` in bun v0.1.13. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
