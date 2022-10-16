# Zig 2 Dash

Create a static .docset of Zig language documentation for use in [Dash](https://kapeli.com/dash) as per [this guide](https://kapeli.com/docsets#dashDocset).

Produces .tgz for upload as a [Dash User Contribution](https://github.com/Kapeli/Dash-User-Contributions) but could also be used anywhere that accepts a `.docset`.

To include:
- [Zig Standard Library](https://ziglang.org/documentation/master/std/)
- [Zig Language Reference](https://ziglang.org/documentation/master/)

Zig currently presents its Standard Library docs via a dynamic webapp which is unusable in static documentation systems like Dash. Writing a generator that uses the json dump included with the webapp requires an understanding of Zig Intermediate Representation I don't have. Also, given the project is under heavy development any such script would likely break frequently. Hopefully they add an option to output static html docs in the future?

Temporary work around: load the webapp from ziglang.org via [jsdom](https://github.com/jsdom/jsdom), traverse each hashlink, wait for the next animation frame, then export the generated html as a page, replacing links as needed. Allows for changes to zig [autodoc](https://github.com/ziglang/zig/wiki/How-to-contribute-to-Autodoc) (which is experimental) without knowing about ZIR. It's slow but seems to do the job.

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