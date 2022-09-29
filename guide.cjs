// Make a docset for the Zig Standard Lib accroding to https://kapeli.com/docsets

const { JSDOM } = require("jsdom");
const fs = require("fs");
const { Sequelize } = require('sequelize');
const htmlMinify = require('html-minifier');

const BASE_URL = "https://ziglang.org/documentation/master";
const STD_PATH = "https://ziglang.org/documentation/master/std";
const GUIDE_PATH = "guide.html";
// TODO cross link to std lib
const DOCSET_NAME = "zigstd-guide.docset";
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

function toc(doc, el, type, name) {
  const markEl = doc.createElement("a");
  markEl.name = `//apple_ref/cpp/${type}/${encodeURIComponent(name)}`;
  markEl.className = "dashAnchor";
  el.parentElement.insertBefore(markEl, el);
}

async function index(seq, type, name, filepath, parentId) {
  console.log(info.type, name, filepath);
  const CMD = "INSERT OR IGNORE INTO searchIndex(name, type, path, parent) VALUES ";
  await seq.query(CMD + `('${name}', '${type}', '${filepath}', '${parentId}');`);  // add to table
  const aggregate = "MAX(id)";
  const [results, metadata] = await seq.query(`SELECT ${aggregate} from searchIndex;`);  // get id assigned
  if (!results || !results[0] || !results[0][aggregate]) throw Error("Could not get id back from table");
  return results[0][aggregate];
}

async function main () {
  const seq = new Sequelize({
    dialect: 'sqlite',
    storage: `${DOCSET_NAME}/Contents/Resources/docSet.dsidx`
  });

  if (!DRY_RUN) {
    fs.rmSync(DOCSET_NAME, {recursive: true, force: true});
    await seq.query(`CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);`);
    await seq.query(`CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);`);

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

    const doc = dom.window.document;
    const thisId = index(seq, "Guide", doc.querySelector("h1").textContent, GUIDE_PATH, 0);  // add to db

    // strip document: remove search bar and inputs
    doc.querySelector("#navigation").remove();
    // doc.querySelector("header").remove();
    doc.querySelector("link").remove();  // icon
    for (const a of doc.querySelectorAll("a.hdr")) a.remove();  // § links not needed in Dash

    // extract stylesheet to file to save space
    const styleEl = doc.querySelector("style");
    if (!DRY_RUN) {
      fs.mkdirSync(`${DOCSET_NAME}/Contents/Resources/Documents/`, {recursive: true});
      fs.writeFileSync(`${DOCSET_NAME}/Contents/Resources/Documents/style.css`, styleEl.innerHTML
      + `
      .dashAnchor {
        display: block;
        text-align: inherit;
        padding: 0;
        margin: 0;
        text-decoration: none;
      }
      `);  // added to prevent anchors messing up the page styling
    }
    styleEl.remove();

    const titleEl = tdoc.querySelector("title");
    titleEl.innerHTML = "Zig Language Reference";
    const mainEl = doc.querySelector("#contents");

    // Add markers and index headers
    for (const h of mainEl.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      const headText = h.textContent.trim();
      const filepath = GUIDE_PATH + "#" + h.id;
      if (headText.startsWith("@")) {  // builtin
        index(seq, headText, "Builtin", filepath, thisId);
        toc(doc, h, "Builtin", headText);
      } else if (headText.lower() == headText) {  // probably language keyword eg for, while, return
        index(seq, headText, "Keyword", filepath, thisId);
        toc(doc, h, "Keyword", headText);
      } else {  // guides
        index(seq, headText, "Guide", filepath, thisId);
        toc(doc, h, "Guide", headText);
      }
    }

    // TODO: Specially add primitive types
  });
}

main();