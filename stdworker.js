// import { parentPort, parentData } from 'worker_threads';
import fs from 'fs-extra';
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';

const log = console.log;

const parentData = {  // temp
  url: "https://ziglang.org/documentation/master/std/",
  DOC_PATH: "zig.docset/Contents/Resources/Documents/"
};

const _PROMS = [];  // keep paralell promises (start) and await them (awaitAll) Warning: globally scoped
const start = (...args) => _PROMS.push(...args);
const awaitAll = async () => {for (const p of _PROMS) await p;};

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

async function process(dom, mainEl, titleEl, navEl, linkEl, version, msgData) {
  const {thisHash, rootName} = msgData;
  dom.window.location.hash = thisHash;  // re-render page at thisHash
  await new Promise((resolve) => dom.window.requestAnimaitonFrame(resolve));
  const name = toName(thisHash);
  titleEl.innerHTML = name.split(".").at(-1);
  const filepath = toPath(name);
  const dotsToRoot = "../".repeat(filepath.split("/").length - 1);
  linkEl.setAttribute("href", dotsToRoot + "style.css");

  const allDocLinks = new Set(mainEl.querySelectorAll("a"));
  for (const a of navEl.querySelectorAll("a")) allDocLinks.add(a);
  const next = [];
  for (const type in sects) {
    const {el, anchor} = sects[type];
    if (el.className.split(/\s+/).includes("hidden")) anchor.className = "hidden";
    else anchor.className = "dashAnchor";
    for (const a of el.querySelectorAll("a")) {
      let okay = a.href.trim() != "" && a.hash.length > 0 && (
        (a.origin == '' && a.pathname == '') ||
        (a.origin == "null" && a.pathname == "blank")
        || a.origin + a.pathname == parentData.url);
      if (okay) {
        next.push({type, hash: a.hash});
        a.href = dotsToRoot + toPath(toName(a.hash, rootName));
      } else a.href = getFullUrl(a);
    }
  }
  parentPort.postMessage({follow: next});

  // for (const a of allLinks) {
  //   if (allDocLinks.has(a)) continue;
  //   // do stuff for invalid link
  // }
  // TODO: can we do this upfront?
  // - replace path links up top
  // - replace parts that change??
  // - use 'main' in place of doc for main container
}

let isLoadingResourcesDisabled = false;  // set to stop script and link tags loading
class DisablableResourceLoader extends ResourceLoader {
  fetch (url, options) {
    if (isLoadingResourcesDisabled) return null;
    return super.fetch(url, options);
  }
}

async function main () {
  const dom = await JSDOM.fromURL(parentData.url, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),  // todo output to file
    resources: new DisablableResourceLoader()
  });
  log("Waiting for page load...");
  await new Promise((resolve, _) => dom.window.addEventListener('load', (_) => resolve()));
  let version = dom.window.zigAnalysis.params.zigVersion;
  if (!/^\d+\.\d+\.\d+$/.test(version)) version += " (master)";
  console.log(`Loaded version: ${version}`);

  const doc = dom.window.document;
  let libs = [];
  let pkgsUl = doc.querySelector(".packages");
  if (!pkgsUl) throw Error("could not find package list");
  for (const pkgLi of pkgsUl.children) {
    const a = pkgLi.querySelector('a');
    libs.push({type: "Library", hash: a.hash, name: a.textConten});
  }
  
  // strip document to save space
  // doc.querySelector(".banner").remove();  // might be good to show 'beta' banner
  doc.querySelector(".sidebar")?.remove();
  doc.querySelector(".flex-filler")?.remove();
  doc.querySelector("#status").remove();
  doc.querySelector("link").remove();  // icon
  for (const inp of doc.querySelectorAll("input")) inp.remove();
  const styleEl = doc.querySelector("style");
  const spath = `${parentData.DOC_PATH}/style.css`;
  if (!await fs.pathExists(spath))  // means won't be updated with "Merge" option
    await fs.outputFile(spath, styleEl.innerHTML);
  styleEl.remove();
  const linkEl = doc.createElement("link");
  linkEl.setAttribute("href", "style.css");  // update for each page later
  linkEl.setAttribute("rel", "stylesheet");
  isLoadingResourcesDisabled = true;  // don't load newly inserted link tag
  doc.querySelector("head").appendChild(linkEl);
  for (const a of doc.querySelectorAll("a")) a.setAttribute("href", getFullUrl(a));

  const mainEl = doc.querySelector(".docs");
  const titleEl = doc.querySelector("title");
  const navEl = doc.getElementById("#listNav");
  const sects = {
    "Type": "#sectTypes",
    "Namespace": "#sectNamespaces",
    "Global": "#sectGlobalVars",
    "Function": "#sectFns",
    "Value": "#sectValues",
    "Error": "#sectErrSets",
  };
  for (const type of sects) {
    const el = doc.getElementById(sects[type]);
    const h2 = el.getElementsByTagName('h2')[0];
    const anchor = doc.createElement("a");
    anchor.setAttribute("name", `//apple_ref/cpp/Section/${encodeURIComponent(h2.textContent)}`);
    anchor.className = "dashAnchor";
    el.insertBefore(anchor, h2);
    sects[type] = {el, anchor};
  }

  parentPort.on("message", process.bind(dom, mainEl, titleEl, navEl, linkEl, sects, version));
  parentPort.postMessage({follow: libs});
}

main();