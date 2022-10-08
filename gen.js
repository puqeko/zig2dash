import fs from 'fs-extra';
import inq from 'inquirer';
import {assignIdleWorker, initWorkers, workerStats, __dirname} from './workerutils.js'

const log = console.log;
const err = console.error;

const BASE_URL = "https://ziglang.org/documentation/";
const DOC_NAME = "zig.docset"
const DOC_PATH = DOC_NAME + "/Contents/Resources/Documents/";

const PACK_SIZE = 25;
let packs = [];  // groups of PACK_SIZE for processing
const divide = () => {
  const last = packs.pop();
  const div = [[], []];
  for (let i = 0; i < last.length; i++) div[i%2].push(last[i]);
  packs.push(...div);
};

const seen = new Set();
const libs = [];
let nProcessed = 0;
const incrDisplayCount = (i) => {
  nProcessed += i;
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(`[${nProcessed}]`);
};

const allocate = () => {
  if (libs.length > 0) {
    return {lib: libs.pop()};
  } if (packs.length > 0) {
    const pack = packs.at(0);  // take from front
    packs = packs.slice(1);
    return {pack};
  }
};
const doStd = (baseUrl) => {
  initWorkers(__dirname + "/stdworker.js", {
    nWorkers: 1,
    initData: {baseUrl, DOC_PATH},
    onInit: (o) => {
      const {msgData} = o;
      for (const lib of msgData) {
        if (seen.has(lib.hash)) continue;
        seen.add(lib.hash);
        libs.push(lib);
      }
    },
    onIdle: (o) => {
      const next = allocate();
      if (next) o.assign(next);
      else askRunningWorkers();
      if (!o.isInit) incrDisplayCount(o.msgData);

      let idleCount = 0;
      for (const ws of workerStats()) if (ws.status == "idle") idleCount += 1;
      if (idleCount == workerStats().length) log("\nDone");
    },
    onReply: (o) => {
      const {msgData} = o;
      if (packs.length == 0) packs.push([]);
      let nfull = packs.map((p) => p.length >= PACK_SIZE).reduce((a, b) => a+b);
      if (nfull == packs.length) {
        divide(packs);
        if (nfull > 0) nfull -= 1;
      }
      let i = 0;
      for (const f of msgData) {
        if (seen.has(f.hash)) continue;
        seen.add(f.hash);
        packs[nfull + (i % (packs.length - nfull))].push(f);
        if (packs.at(-1).length >= PACK_SIZE) {
          nfull += 1;
          if (nfull == packs.length) {
            divide(packs);
            if (nfull > 0) nfull -= 1;
          }
        }
        i += 1;
      }

      let idleCount = 0;
      for (const ws of workerStats()) if (ws.status == "idle") idleCount += 1;
      if (idleCount == workerStats().length) log("\nDone");
      while (idleCount > 0) {
        const next = allocate();
        if (next) assignIdleWorker(next);
        else break;
        idleCount--;
      }
    }
  });
}

doStd("https://ziglang.org/documentation/master/std/");

// TODO: try sending batches back instead
// improve ready checker for multi worker

async function doLangRef(url) {
  return;
}

const main = async () => {
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
    await db.query(`CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);`);
    await db.query(`CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);`);
    await fs.copy("template", DOC_NAME);
  }
  const langRefUrl = BASE_URL.href + "/" + (await inq.prompt({
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

  if (todo.includes("Zig Language Reference")) await doLangRef(langRefUrl);
  if (todo.includes("Zig Standard Library")) await doStd(langRefUrl + "std/");
};

// main();