// Make a docset for the Zig Language Reference accroding to https://kapeli.com/docsets

import fs from 'fs-extra';
import { Sequelize } from 'sequelize';
import { JSDOM } from "jsdom";
import htmlMinify from 'html-minifier';

const log = (...args) => console.log(`[guide]`, ...args);

const GUIDE_FILENAME = "Zig\ Language\ Reference.html";

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

function toc(doc, el, type, name) {
  const markEl = doc.createElement("a");
  markEl.name = `//apple_ref/cpp/${type}/${encodeURIComponent(name)}`;
  markEl.className = "dashAnchor";
  el.parentElement.insertBefore(markEl, el);
}

const idxTable = new Map();
async function index(seq, name, type, filepath, desc) {
  if (!idxTable.has(type)) idxTable.set(type, 1);
  else idxTable.set(type, idxTable.get(type) + 1);
  const CMD = "INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ";
  let path = filepath;
  if (desc) path += `<dash_entry_menuDescription=${encodeURIComponent(desc)}>`;  // displayed next to search result
  await seq.query(CMD + `('${name}', '${type}', '${path}');`);  // add to table
}

export const generate = async (baseUrl, docPrefix, version) => {
  const docPath = docPrefix + "/Contents/Resources/Documents/";
  baseUrl = new URL(baseUrl);  // ensure URL, will be const as this is a single page webapp
  if (baseUrl.href.at(-1) != "/") err("baseUrl must end in '/'");
  log(baseUrl.href);

  const dom = await JSDOM.fromURL(baseUrl.href, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true
  });
  log(`Waiting for page load...`);
  await new Promise((resolve) => dom.window.addEventListener('load', resolve));

  const seq = new Sequelize({
    dialect: 'sqlite',
    logging: false,
    storage: `${docPrefix}/Contents/Resources/docSet.dsidx`
  });

  const doc = dom.window.document;
  await index(seq, doc.querySelector("h1").textContent, "Guide", GUIDE_FILENAME);  // add to db

  // strip document: remove search bar and inputs
  doc.querySelector("#navigation")?.remove();
  // doc.querySelector("header").remove();
  doc.querySelector("link")?.remove();  // icon
  for (const a of doc.querySelectorAll("a.hdr")) a.remove();  // § links not needed in Dash

  // extract stylesheet to file to save space
  const styleEl = doc.querySelector("style");
  styleEl.textContent = styleEl.textContent +
  `#contents-wrapper, header {
    margin-left: 0;
  }
  header h1 {
    margin-top: 1em;
  }
  `;  // clean up the title a bit

  const titleEl = doc.querySelector("title");
  titleEl.innerHTML = `Zig Language Reference (${version})`;

  const mainHeadEl = doc.querySelector("h1");
  mainHeadEl.innerHTML = mainHeadEl.textContent + ` (${version})`

  const mainEl = doc.querySelector("#contents");

  // Add markers and index headers
  const previousHeads = [null, null, null, null, null, null];
  for (const h of mainEl.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const headText = h.textContent.trim();
    h.textContent = headText;  // removes child link
    const itag = parseInt(h.tagName[1]) - 1;  // index into previousHeads based on tagname
    let parentHead;
    if (itag > 0) parentHead = previousHeads[itag-1]?.textContent.trim();  // look up one heading higher
    const filepath = GUIDE_FILENAME + "#" + h.id;
    if (headText.startsWith("@")) {  // builtin
      await index(seq, headText, "Builtin", filepath, parentHead);
      toc(doc, h, "Builtin", headText);
    } else if (headText.toLowerCase() == headText) {  // probably language keyword eg for, while, return
      await index(seq, headText, "Keyword", filepath, parentHead);
      toc(doc, h, "Keyword", headText);
    } else {  // guides
      await index(seq, headText, "Guide", filepath, parentHead);
      toc(doc, h, "Guide", headText);
    }
    previousHeads[itag] = h;
  }

  // Specially add primitive types
  let primTblEl;
  for (const t of mainEl.querySelectorAll("table caption"))
    if (t.textContent == "Primitive Types") primTblEl = t.parentElement;
  if (!primTblEl) log("WARNING: 'Primitive Types' table not found");
  else {
    const label = "#Primitive-Types";
    const filepath = GUIDE_FILENAME + label;  // Assuming this won't change
    const h = doc.querySelector(label);
    console.assert(h !== undefined);
    for (const th of primTblEl.querySelectorAll("tbody th")) {
      index(seq, th.textContent, "Type", filepath, "Primitive Types");
      toc(doc, h, "Type", th.textContent);
    }
  }

  log("Replacing links to std lib");
  const stdBaseUrlStr = baseUrl.href + "std/";
  const masterBaseUrlStr = "https://ziglang.org/documentation/master/std/"
  for (const a of doc.querySelectorAll("a")) if (a.href == stdBaseUrlStr || a.href == masterBaseUrlStr) a.href = "std.html";

  // online redirect marker
  const orEl = doc.createComment(` Online page at ${baseUrl.href} `);
  const htmlEl = doc.querySelector("html");
  htmlEl.insertBefore(orEl, htmlEl.children[0]);

  // const filestr = dom.serialize();
  const filestr = htmlMinify.minify(dom.serialize(), htmlMinOpts);
  await fs.outputFile(docPath + GUIDE_FILENAME, filestr);
  
  const types = [];
  const counts = [];
  for (const k of idxTable.keys()) {
    types.push(k.slice(0, 7));
    let s = idxTable.get(k).toString();
    if (s.length == 1) s += ' ';  // fix table alignment
    counts.push(s);
  }
  log(types.join("\t"));
  log(counts.join("\t"));
  log("Finished!")
}
