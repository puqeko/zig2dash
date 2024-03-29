// Make a docset for the Zig Standard Library accroding to https://kapeli.com/docsets

import process from 'process';
import fs from 'fs-extra';
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import { Sequelize } from 'sequelize';
import htmlMinify from 'html-minifier';
import rcs from 'rcs-core'

const log = (...args) => console.log(`[std]`, ...args);
const htmlMinOpts = {
  includeAutoGeneratedTags: true,
  removeAttributeQuotes: true,
  // removeComments: true,  // don't remove Online Redirection comment tags
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  sortClassName: true,
  useShortDoctype: true,
  collapseWhitespace: true,
  conservativeCollapse: true,
  minifyCSS: true
};
const shouldFollow = (baseUrl, a) => {  // is hashlink to baseUrl page
  return a.hash != "" &&
    a.origin == baseUrl.origin &&
    a.pathname == baseUrl.pathname;
};

const toName = (key, rootPkgName) => {
  if (!rootPkgName) throw Error("please pass pkgRootName when using toName");
  if (!key) return rootPkgName;
  let s = key;
  if (s.startsWith("#A")) s = s.slice(2);  // api keys only
  else if (s.startsWith("#")) throw Error("Unsupported key " + key);
  if (s.startsWith(";")) s = s.slice(1);
  if (s.endsWith(":")) s = s.slice(0, -1);
  s = s.replace(":", ".");
  if (s.startsWith("root"))
    s = s.replace("root", rootPkgName);
  return s;
};
const toDir = (name) => {
  let d = name.split(".").slice(0, -1).join("/");
  return d ? (d + "/") : d;
}
const toPath = (name) => toDir(name) + name.split(".").at(-1) + ".html";
const tryMakeRelative = (sourceDir, path, dots) => {  // eg ("a/b/", "a/b/c/d.html") => "c/d.html"
  if (!path.startsWith(sourceDir)) return dots + path;
  return path.slice(sourceDir.length);
};

let dom = undefined;

const seen = new Set();
const libs = [];
let toFollow = [];
const startNextRender = async () => {
  let h = undefined, t = undefined, n = undefined;
  while (toFollow.length > 0) {
    const {type, hash, parentName} = toFollow.pop();
    if (seen.has(hash)) continue;
    seen.add(hash);
    h = hash; t = type; n = parentName;
    break;
  }
  while (!h && toFollow.length == 0 && libs.length > 0) {
    const {type, hash, name} = libs.pop();
    if (seen.has(hash)) continue;
    seen.add(hash);
    h = hash; t = type; n = name;
    break;
  }
  if (!h) return Promise.resolve();
  dom.window.location.hash = h;  // render page at hash
  return new Promise((resolve) => dom.window.requestAnimationFrame(resolve)).then(() => {
    return {thisType: t, thisHash: h, parentName: n};
  });
};

const idxTable = new Map();
async function index(db, name, type, filepath) {
  if (!idxTable.has(type)) idxTable.set(type, 1);
  else idxTable.set(type, idxTable.get(type) + 1);
  const CMD = "INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ";
  const shortName = name.split(".").at(-1);
  let path = filepath;
  path += `<dash_entry_name=${encodeURIComponent(shortName)}>`  // displayed in search results
  path += `<dash_entry_menuDescription=${encodeURIComponent(name)}>`;  // displayed next to search result
  await db.query(CMD + `('${name}', '${type}', '${path}');`);  // add to table
}

const newerThanOrEqual = (ver, ref) => {
  const t = /^\d+\.\d+(\.\d+)?$/;  // accept 0.9 or 0.9.1 format
  if (!t.test(ref)) return true;  // else development build always 'newer'
  let a = ver.split(".").map((a) => parseInt(a));
  let b = ref.split(".").map((b) => parseInt(b));
  if (a.length < 3) a.push(0);
  if (b.length < 3) b.push(0);
  for (let i = 0; i < 3; i++) {
    if (a[i] == b[i]) continue;
    return a[i] > b[i];
  }
  return true;
};

let nEmpty = 0;
// trigged by the parent, process the next hash link we are assigned and send back
// any hash links that we shouldFollow
const render = async (baseUrl, docPath, db, els, sects, ignoreTypes, version, next) => {
  const {thisType, thisHash, parentName} = next;
  const rootName = parentName.split('.').at(0);
  const {mainEl, titleEl, linkEl, scriptEl} = els;
  const name = toName(thisHash, rootName);
  titleEl.innerHTML = name.split(".").at(-1);
  const dirpath = toDir(name);
  const dotsToRoot = "../".repeat(dirpath.split("/").length - 1);
  linkEl.setAttribute("href", dotsToRoot + "style.css");
  scriptEl.setAttribute("src", dotsToRoot + "script.js");
  
  // const filestr = dom.serialize();
  const allDocLinks = new Set(mainEl.querySelectorAll("a"));
  const excluded = new WeakSet();
  for (const a of dom.window.document.getElementById("listNav").querySelectorAll("a")) {
    excluded.add(a);  // would have already followed
    if (shouldFollow(baseUrl, a)) a.href = tryMakeRelative(dirpath, toPath(toName(a.hash, rootName)), dotsToRoot);
    else if (a.getAttribute("href")) a.setAttribute("href", a.href);  // make sure no relative web urls
  }
  
  for (const type in sects) {
    const {el, anchorEl} = sects[type];
    const isHidden = el.className.split(/\s+/).includes("hidden");
    if (anchorEl) {
      if (isHidden) anchorEl.className = "hidden";  // so dash doesn't register the anchor
      else anchorEl.className = "dashAnchor";
    }
    for (const a of el.querySelectorAll("a")) {
      excluded.add(a);
      if (isHidden || a == anchorEl) continue;
      if (shouldFollow(baseUrl, a)) {
        const cname = toName(a.hash, rootName);
        // don't index fields
        if (cname.startsWith(name) && !ignoreTypes.includes(type))
          toFollow.unshift({type, hash: a.hash, parentName: name});
        a.href = tryMakeRelative(dirpath, toPath(cname), dotsToRoot);
      } else if (a.getAttribute("href"))
        a.setAttribute("href", a.href);  // make sure no relative web urls
    }
  }
  for (const a of allDocLinks) if (a.getAttribute("href") && !excluded.has(a))
    a.setAttribute("href", a.href);  // no relative web urls
  const copy = new JSDOM(dom.serialize());
  const rendering = startNextRender();  // dom is hot until this is awaited, don't touch it

  // function anchors
  let fnHidden = sects["Function"].el.className.split(/\s+/).includes("hidden");
  if (!fnHidden) {
    const listfnEl = copy.window.document.getElementById("listFns");
    if (!listfnEl) err("coud not find #listFns element");
    for (const lf of listfnEl.children) {
      let fnameEl;
      if (newerThanOrEqual(version, "0.11")) fnameEl = lf.querySelector(".fnSignature a .zig_identifier");
      else fnameEl = lf.querySelector(".tok-fn");
      if (!fnameEl) {
        err("could not find function signature");
        continue;
      }
      const anchorEl = copy.window.document.createElement("a");
      anchorEl.setAttribute("name", `//apple_ref/cpp/Function/${encodeURIComponent(fnameEl.textContent)}`);
      anchorEl.className = "dashAnchor";
      if (newerThanOrEqual(version, "0.10")) lf.insertBefore(anchorEl, lf.firstElementChild);
      else fnameEl.parentElement.insertBefore(anchorEl, fnameEl.parentElement.firstChild);
    }
  }

  // online redirect marker
  const orEl = copy.window.document.createComment(` Online page at ${baseUrl.href + thisHash} `);
  const htmlEl = copy.window.document.querySelector("html");
  htmlEl.insertBefore(orEl, htmlEl.children[0]);

  for (const el of copy.window.document.querySelectorAll(".hidden")) el.remove();
  for (const s of copy.window.document.querySelectorAll("script")) s.remove();
  copy.window.document.head.appendChild(scriptEl);

  const docsEl = copy.window.document.querySelector(".docs");
  if (docsEl.children.length == 0) {
    nEmpty += 1;
    const parentPath = tryMakeRelative(dirpath, toPath(parentName), dotsToRoot);
    const parentPage = `Try the <a href='${parentPath}'>${parentName}</a> page or try `;
    const webPage = `<a href='${baseUrl.href + thisHash}'>the website</a>.`;
    docsEl.innerHTML = `Not avaliable yet. ` + parentPage + webPage;
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write("Check 404: " + baseUrl.href + thisHash + '\n');
  }

  const filepath = toPath(name);
  const indexing = index(db, name, thisType, filepath);
  const filestr = htmlMinify.minify(rcs.replace.html(copy.serialize()), htmlMinOpts);
  const writing = fs.outputFile(docPath + filepath, filestr);
  await Promise.all([writing, indexing]);
  return rendering;
};

let isLoadingResourcesDisabled = false;  // set to stop script and link tags loading
class DisablableResourceLoader extends ResourceLoader {
  fetch (url, options) {
    if (isLoadingResourcesDisabled) return null;
    return super.fetch(url, options);
  }
}

// get and emulate webapp at workerData.initData.basUrl address then do some prepocessing before
// setting up the process handler and sending back the root packages discovered
export const generate = async (baseUrl, docPrefix) => {
  const docPath = docPrefix + "/Contents/Resources/Documents/";
  baseUrl = new URL(baseUrl);  // ensure URL, will be const as this is a single page webapp
  if (baseUrl.href.at(-1) != "/") err("baseUrl must end in '/'");
  const apiUrl = new URL(baseUrl.href + "#A;");
  log(apiUrl.href);
  dom = await JSDOM.fromURL(apiUrl, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),  // todo output to file
    resources: new DisablableResourceLoader()
  });
  log("Waiting for page load...");
  const doc = dom.window.document;
  for (const a of doc.querySelectorAll("a")) if (a.getAttribute("href"))
    a.setAttribute("href", a.href);  // no relative urls
  await new Promise((resolve) => dom.window.addEventListener('load', resolve));
  let version = dom.window.zigAnalysis.params.zigVersion;
  if (!/^\d+\.\d+\.\d+$/.test(version)) version += " (master)";
  log(`Loaded version: ${version}`);

  let pkgsUl;
  if (newerThanOrEqual(version, "0.11")) pkgsUl = doc.querySelector("#apiMenu .modules");
  else pkgsUl = doc.querySelector("#apiMenu .packages");
  if (!pkgsUl) throw Error("could not find package list");
  for (const pkgLi of pkgsUl.children) {
    const a = pkgLi.querySelector('a');
    libs.push({type: "Library", hash: a.hash, name: a.textContent});
  }
  const foundLibs = [];
  for (const {name} of libs) foundLibs.push(name);
  if (foundLibs.length) log(`Found librar${foundLibs.length == 1 ? "y" : "ies"}`, foundLibs.join(", "));
  else {
    log("No libraries found!");
    return;
  }

  // strip document to save space
  // doc.querySelector(".banner").remove();  // might be good to show 'beta' banner
  for (const a of doc.querySelectorAll(".banner a")) a.remove();  // without links, cleaner
  const banEl = doc.querySelector(".banner");
  if (banEl) {
    log("Banner found");
    banEl.textContent = banEl.textContent.split('.').at(0) + ".";
  } else log ("No banner");
  if (newerThanOrEqual(version, "0.11")) {
    const el = doc.getElementById("searchPlaceholder").parentElement.parentElement.parentElement;
    if (el.className != "wrap") throw new Error("searchPlaceholder Has Changed");
    el.remove();
  } else doc.getElementById("searchPlaceholder")?.remove();
  doc.getElementById("sectSearchResults")?.remove();
  doc.getElementById("sectSearchNoResults")?.remove();
  doc.getElementById("helpModal")?.remove();
  doc.getElementById("prefsModal")?.remove();
  doc.getElementById("status")?.remove();
  doc.getElementById("guidesMenu")?.remove();
  doc.getElementById("guides")?.remove();
  doc.querySelector(".sidebar")?.remove();
  doc.querySelector(".flex-filler")?.remove();
  doc.querySelector("link")?.remove();  // icon
  for (const inp of doc.querySelectorAll("input")) inp.remove();

  // extract style
  const styleEls = doc.querySelectorAll("head style");
  const spath = `${docPath}style.css`;
  let style = "";
  for (const styleEl of styleEls) {
    style += styleEl.innerHTML;
    styleEl.remove();
  }
  style += ".flex-main{overflow-y: auto;}"

  rcs.fillLibraries(style);
  rcs.optimize();
  await fs.outputFile(spath, rcs.replace.css(style));
  log(`Created style.css`);
  rcs.warnings.warn();

  const scriptText = `\
  function toggleExpand(event) {
    const parent = event.target.parentElement;
    parent.toggleAttribute("open");
  
    if (!parent.open && parent.getBoundingClientRect().top < 0) {
      parent.parentElement.parentElement.scrollIntoView(true);
    }
  }`;
  const scpath = `${docPath}script.js`;
  await fs.outputFile(scpath, scriptText);
  log(`Created script.js`);


  // add link to style.css
  const linkEl = doc.createElement("link");
  const scriptEl = doc.createElement("script");
  linkEl.setAttribute("href", "style.css");  // update for each page later
  linkEl.setAttribute("rel", "stylesheet");
  isLoadingResourcesDisabled = true;  // don't load newly inserted link tag
  doc.querySelector("head").appendChild(linkEl);
  doc.querySelector("head").appendChild(scriptEl);
  
  const sects = {  // will traverse links we find in these sections and label them with the associated type
    "Type": "sectTypes",  // these are id values for getElementById labeled with dash types
    "Namespace": "sectNamespaces",  // to be replaced by {element, anchor, anchorElements}
    "Global": "sectGlobalVars",
    "Function": "sectFns",
    "Value": "sectValues",
    "Error": "sectErrSets",
    "Field": "sectFields",
    "Example": "fnExamples",
    "Parameter": "sectParams",
    "TLDR": "tldDocs",
  };
  const ignoreTypes = ["TLDR", "Field", "Example", "Parameter"];  // exclude from index but include in TOC and convert links
  for (const type in sects) {
    const el = doc.getElementById(sects[type]);
    if (type !== "TLDR") {
      const h2 = el.querySelector('h2');
      const anchorEl = doc.createElement("a");
      anchorEl.setAttribute("name", `//apple_ref/cpp/Section/${encodeURIComponent(h2.textContent)}`);
      anchorEl.className = "dashAnchor";
      el.insertBefore(anchorEl, h2);
      sects[type] = {el, anchorEl};
    }
    else {
      sects[type] = {el, anchorEl: undefined};
    }
  }
  const types = [];
  for (const type in sects) if (!ignoreTypes.includes(type)) types.push(type);
  log("Indexing types", types.join(", "));

  const mainEl = doc.querySelector(".docs");
  const titleEl = doc.querySelector("title");
  const els = {mainEl, titleEl, linkEl, scriptEl};

  const db = new Sequelize({
    dialect: 'sqlite',
    logging: false,
    storage: `${docPrefix}/Contents/Resources/docSet.dsidx`
  });

  log("Done \t404? \tName");

  let nProcessed = 0;
  let next = await startNextRender();
  while (next) {
    const pnext = await render(baseUrl, docPath, db, els, sects, ignoreTypes, version, next);
    nProcessed += 1;
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    const ostr = `[std] ${nProcessed} \t${nEmpty} \t${toName(next.thisHash, next.parentName.split('.').at(0))}`
    process.stdout.write(ostr.slice(0, process.stdout.columns || 60));
    next = pnext;
  }
  process.stdout.write('\n');
  log();

  const foundTypes = [];
  const counts = [];
  for (const k of idxTable.keys()) {
    foundTypes.push(k.slice(0, 7));
    let s = idxTable.get(k).toString();
    if (s.length == 1) s += ' ';  // fix table alignment
    counts.push(s);
  }
  log(foundTypes.join("\t"));
  log(counts.join("\t"));
  log("Finished!");
}