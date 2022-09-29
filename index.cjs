// Make a docset for the Zig Standard Lib accroding to https://kapeli.com/docsets
const { JSDOM } = require("jsdom");
const fs = require("fs");
const { Sequelize } = require('sequelize');
const htmlMinify = require('html-minifier');

const BASE_URL = "https://ziglang.org/documentation/master/std";
const DOCSET_NAME = "zig.docset"
const DOCSET_PATH = DOCSET_NAME + "/Contents/Resources/Documents/";
const DRY_RUN = false;

const htmlMinOpts = {
  includeAutoGeneratedTags: true,
  removeAttributeQuotes: true,
  // removeComments: true,  // don't remove Online Redirection comment tags
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  sortClassName: true,
  useShortDoctype: true,
  collapseWhitespace: true
};

// take a hash and convert to name
// eg #root;Array.thing  =>  std.Array.thing
function toName(key, root) {
  if (!root) throw "Specify root arg";
  if (!key) return root;
  let s = key;
  if (s.startsWith("#")) s = s.slice(1);
  if (s.endsWith(";")) s = s.slice(0, -1);
  s = s.replace(";", ".");
  if (s.startsWith("root")) s = s.replace("root", root);
  return s;
}

function toPath(name) {
  let n = name.split(".");
  let s = n.slice(0, -1).join('/');
  if (s) s += '/';
  return s + name + ".html";  // n.slice(-2).join(".")
}

function getFullUrl(a) {
  let href = a.href;
  if (!a.origin || a.origin == "null") {
    href = BASE_URL;
    // TODO find out what this weird behaviour with a.pathname and a.hash is about
    // They are giving empty string when they should not?
    if (!(a.pathname + a.search + a.hash).trim())
      href = [href, a.href].join("/");
    else {
      if (a.pathname != "blank") href += a.pathname;
      href += a.search + a.hash;
    }
  }
  return (new URL(href, BASE_URL)).href;
}

async function index(seq, name, type, filepath) {
  console.log(type, name, filepath);
  const CMD = "INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ";
  await seq.query(CMD + `('${name}', '${type}', '${filepath}');`);  // add to table
}

async function onFinishedFirstLoad(dom, seq, _) {
  // sections to process
  const secids = {
    "Type": "#sectTypes",
    "Namespace": "#sectNamespaces",
    "Global": "#sectGlobalVars",
    "Function": "#sectFns",
    "Value": "#sectValues",
    "Error": "#sectErrSets",
  };

  const root = dom.window.zigAnalysis.rootPkgName;
  let cur = `#${dom.window.zigAnalysis.params.rootName}`;
  let next = [];
  let seen = new Map();
  let done = new Set();
  seen.set(cur, "Library");

  // create copy of dom, parse results, output to file, populate db
  // follow links, add to stack, process next on stack until empty
  async function onRender(_) {
    const name = toName(cur, root);
    const filepath = toPath(name);

    let ip = undefined;
    if (!DRY_RUN)
      ip = index(seq, name.split(".").at(-1), seen.get(cur), filepath);  // insert into db
    let mp = undefined;
    if (!DRY_RUN && filepath.includes("/"))  // create empty dir if it doesn't exist
       mp = fs.promises.mkdir(DOCSET_PATH + filepath.slice(0, filepath.lastIndexOf("/")), {recursive: true});

    const temp = new JSDOM(dom.window.document.documentElement.outerHTML);  // copy dom context as non runable
    const tdoc = temp.window.document;

    // remove hidden sections
    for (const hid of temp.window.document.querySelectorAll(".hidden")) hid.remove();

    const allLinks = new Set(tdoc.querySelectorAll("a"));
    const linkSets = {};
    for (const type in secids)
      linkSets[type] = new Set(tdoc.querySelectorAll(`${secids[type]} a`));

    const dotsToRoot = "../".repeat(filepath.split("/").length - 1);
    for (const a of allLinks) {
      // webapp uses #root;Type.func format to navigate
      // only index links to this page
      let is_suitable = a.href.trim() != "" && a.hash.length > 0 && (
        (a.origin == '' && a.pathname == '') ||
        (a.origin == "null" && a.pathname == "blank")
        // TODO make compare that ignores trailing '/' and check out with other werid url behaviour
        || a.origin + a.pathname == BASE_URL + "/"
      );
      let is_indexed = is_suitable && seen.has(a.hash);
      if (is_suitable && !is_indexed) {
        for (const type in linkSets) {
          if (linkSets[type].has(a)) {
            next.push(a.hash);  // to be indexed
            seen.set(a.hash, type);
            is_indexed = true;
            break;
          }
        }
      }
      if (is_indexed) a.href = dotsToRoot + toPath(toName(a.hash, root));  // convert to relative docset path
      else a.href = getFullUrl(a);  // ensure full web address linked since local file will not exist
    }

    // start rendering next page, okay since we made copy of this dom context
    done.add(cur);
    let thisCur = cur;
    while (next.length > 0) {
      cur = next.pop();
      if (!done.has(cur)) {
        dom.window.location.hash = cur;
        dom.window.requestAnimationFrame(onRender);  // wait for redraw
        break;
      }
    }
    
    // link stylesheet at root
    const linkEl = tdoc.createElement("link");
    linkEl.href = dotsToRoot + "style.css";
    linkEl.rel = "stylesheet";
    tdoc.querySelector("head").appendChild(linkEl);

    // online redirect marker
    const orEl = tdoc.createComment(` Online page at ${BASE_URL + thisCur} `);
    const htmlEl = tdoc.querySelector("html");
    htmlEl.insertBefore(orEl, htmlEl.children[0]);

    // mark sections
    for (const h2 of tdoc.querySelectorAll("section.docs h2")) {
      const markEl = tdoc.createElement("a");
      markEl.name = `//apple_ref/cpp/Section/${encodeURIComponent(h2.textContent)}`;
      markEl.className = "dashAnchor";
      h2.parentElement.insertBefore(markEl, h2);
    }

    // mark function signatures
    const lfn = tdoc.querySelector("#listFns");
    if (lfn) for (const lf of lfn.children) {
      const fnameEl = lf.querySelector(".fnSignature .tok-fn");
      const markEl = tdoc.createElement("a");
      markEl.name = `//apple_ref/cpp/Function/${encodeURIComponent(fnameEl.textContent)}`;
      markEl.className = "dashAnchor";
      lf.insertBefore(markEl, lf.firstElementChild);
    }

    const titleEL = tdoc.querySelector("title");
    titleEL.innerHTML = name.split(".").at(-1);

    if (!DRY_RUN) {
      // const filestr = temp.serialize();
      const filestr = htmlMinify.minify(temp.serialize(), htmlMinOpts);
      if (mp !== undefined) await mp;  // mkdir
      await fs.promises.writeFile(DOCSET_PATH + filepath, filestr);
      if (ip !== undefined) await ip;  // db entry
    } else console.log(toName(thisCur, root), seen.get(thisCur), filepath);
  }

  await onRender();
}

async function main () {
  const seq = new Sequelize({
    dialect: 'sqlite',
    logging: false,
    storage: `${DOCSET_NAME}/Contents/Resources/docSet.dsidx`
  });

  if (!DRY_RUN) {
    fs.rmSync(DOCSET_NAME, {recursive: true, force: true});
    await seq.query(`CREATE TABLE searchIndex(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, path TEXT, parent INTEGER);`);
    await seq.query(`CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path, parent);`);

    fs.copyFileSync("template/icon.png", `${DOCSET_NAME}/icon.png`);
    fs.copyFileSync("template/icon@2x.png", `${DOCSET_NAME}/icon@2x.png`);

    fs.mkdirSync(`${DOCSET_NAME}/Contents/`, {recursive: true});
    fs.copyFileSync("template/info.plist", `${DOCSET_NAME}/Contents/info.plist`);
  }

  console.log(`Featching ${BASE_URL}`);
  const dom = await JSDOM.fromURL(BASE_URL, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true
  });
  console.log(`Waiting for page load...`);
  dom.window.addEventListener('load', async (event) => {
    let version = dom.window.zigAnalysis.params.zigVersion;
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      version += " (master)";
    }
    console.log(`Loaded ${version}`);

    // strip document: remove search bar and inputs
    const doc = dom.window.document;
    doc.querySelector("#searchPlaceholder").remove();
    doc.querySelector("label").remove();
    doc.querySelector(".sidebar").remove();
    doc.querySelector(".flex-filler").remove();
    doc.querySelector(".banner").remove();
    doc.querySelector("#status").remove();
    doc.querySelector("link").remove();  // icon
    for (const inp of doc.querySelectorAll("input")) {
      inp.remove();
    }

    // extract stylesheet to file to save space
    const styleEl = doc.querySelector("style");
    if (!DRY_RUN) {
      fs.mkdirSync(DOCSET_PATH, {recursive: true});
      fs.writeFileSync(`${DOCSET_PATH}/style.css`, styleEl.innerHTML);
    }
    styleEl.remove();

    onFinishedFirstLoad(dom, seq, event);
  });
}

main();