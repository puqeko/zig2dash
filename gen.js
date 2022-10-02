import fs from 'fs-extra';
import { Sequelize } from 'sequelize';
import inq from 'inquirer';

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

const _PROMS = [];  // keep paralell promises (start) and await them (awaitAll) Warning: globally scoped
const start = (...args) => _PROMS.push(...args);
const awaitAll = async () => {for (const p of _PROMS) await p;};


async function doStd(url) {
  log("Fetching", url);
  // const dom = start(JSDOM.fromURL(url));
  // start workers
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