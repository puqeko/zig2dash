import fs from 'fs-extra';
import { Sequelize } from 'sequelize';
import inq from 'inquirer';
import got from 'got';
import jsdom from 'jsdom';
import { parse } from 'parse5';

const log = console.log;
const err = console.error;

const BASE_URL = "https://ziglang.org/documentation/"
const DOC_NAME = "zig.docset"
const DOC_PATH = DOC_NAME + "/Contents/Resources/Documents/";

const db = new Sequelize({
  dialect: 'sqlite',
  logging: false,
  storage: `${DOC_NAME}/Contents/Resources/docSet.dsidx`
});

const _PROMS = [];  // keep paralell promises (start) and await them (awaitAll)
const start = (...args) => _PROMS.push(...args);
const awaitAll = async () => {
  const res = [];
  for (const p of _PROMS) res.push(await p);
  return res;
};


function findTags(node, tag) {
  let res = [];
  if (node.childNodes) {
    for (const n of node.childNodes) {
      if (n.tagName == tag) res.push(n);
      else res = res.concat(findTags(n, tag));
    }
  }
  return res;
}

async function doStd(url) {
  log("Fetching", url);
  const resp = await got(url).catch(() => err("Could not connect to", url));
  if (resp.statusCode != 200) err("Bad responce from", url);
  await fs.mkdir("cache", {recursive: true});
  for (const s of findTags(parse(resp.body), "script")) {
    let src;
    for (const {name, value} of s.attrs) if (name == "src") src = value;
    log("Download", src);
    start(got(url + src)
      .catch(() => err("Could not get", src))
      .then((res) => {
        fs.writeFileSync("cache/" + src, res.body, {overwrite: true})
      }));
  }
  awaitAll();
}

async function doLangRef(url) {
  return;
}


async function main () {
  let shouldInit = true;
  if (fs.existsSync(DOC_NAME)) {
    const res = (await inq.prompt({
      type: "confirm",
      name: "res",
      message: `Will merge with '${DOC_NAME}' or replace it?`,
      choices: ["Merge", "Replace", "Canel"]
    })).res;
    if (res == "Cancel") return;
    if (res == "Replace") await fs.rm(DOC_NAME, {recursive: true});
    shouldInit = res == "Replace";
  }
  if (shouldInit) {
    await db.query(`CREATE TABLE searchIndex(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, path TEXT);`);
    start(db.query(`CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);`));
    start(fs.copy("template", DOC_NAME));
  }
  const langRefUrl = BASE_URL + (await inq.prompt({
    type: "list",
    name: "ver",
    message: `Version?`,
    choices: ["master", "0.9.1"]
  })).ver + "/";
  const todo = (await inq.prompt({
    type: "checkbox",
    name: "res",
    message: `Will process`,
    choices: [
      {name: "Zig Language Reference", checked: true},
      {name: "Zig Standard Library", checked: true}]
  })).res;
  awaitAll();

  if (todo.includes("Zig Language Reference"))
    await doLangRef(langRefUrl);

  if (todo.includes("Zig Standard Library"))
    await doStd(langRefUrl + "std/");
}

main();