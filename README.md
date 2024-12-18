# Zig 2 Dash

> [!NOTE]
> Defunct as of Zig 0.12.0. Use `zig std` to instantiate docs offline. See the [release notes](https://ziglang.org/download/0.12.0/release-notes.html#Installed-Standard-Library-Documentation).

----

Create a static .docset of Zig language documentation for use in [Dash](https://kapeli.com/dash) as per [this guide](https://kapeli.com/docsets#dashDocset).

Produces .tgz for upload as a [Dash User Contribution](https://github.com/Kapeli/Dash-User-Contributions) but could also be used anywhere that accepts a `.docset`.

To include:
- [Zig Standard Library](https://ziglang.org/documentation/master/std/)
- [Zig Language Reference](https://ziglang.org/documentation/master/)

Zig currently presents its Standard Library docs via a dynamic webapp which is unusable in static API browsers like Dash. Writing a generator that uses the json dump included with the webapp requires an understanding of Zig Intermediate Representation I don't have and, given the project is under heavy development, any such script would likely break frequently. It does not seem like the development team are interested in an option to output static html docs in the near future. However, when the format of json dump becomes more stable it may be more suitible for interfacing with directly.

Temporary work around: load the webapp from ziglang.org via [jsdom](https://github.com/jsdom/jsdom), traverse each hashlink, wait for the next animation frame, then export the generated html as a page, replacing links as needed. Allows for changes to zig [autodoc](https://github.com/ziglang/zig/wiki/How-to-contribute-to-Autodoc) (which is experimental) without knowing about ZIR. It's slow but seems to do the job.

# Setup

With [Node](https://nodejs.org).

To install dependencies:

```bash
npm i
```

To run:

```bash
node index.js
```

Takes about 40 mins to run defaults on my machine.
