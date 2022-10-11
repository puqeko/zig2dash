# Zig 2 Dash

Zig presents its Standard Library docs via a dynamic webapp which is unsualbe in static documentation system like Dash. We must generate a static .docset file from it.

Writing a generator that uses the json dump included with the page requires understanding of Zig Intermediate Representation I don't have. Also, given the project is under heavy development any such script would likely break.

Work around: load the webapp from ziglang.org via jsdom, traverse each hashlink, wait for the next animation frame, then export the generated html as a page, replacing links as needed. Allows for changes to zig autodoc (which is experimental) without knowing about ZIR. It's slow but seems to do the job.

# Setup

To install dependencies:
```bash
yarn install
```
or
```bash
npm install
```

To run:
```bash
yarn gen
```
or
```bash
node index.js
```