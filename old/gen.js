import fs from 'fs-extra';
import { Sequelize } from 'sequelize';
import inq from 'inquirer';
import {initWorkers, stopWorkers, hasRunningWorker, hasIdleWorker, __dirname} from './workerutils.js'

const log = console.log;
const err = console.error;

const BASE_URL = "https://ziglang.org/documentation/";
const DOC_NAME = "zig.docset"
const DOC_PATH = DOC_NAME + "/Contents/Resources/Documents/";

const db = new Sequelize({
  dialect: 'sqlite',
  logging: false,
  storage: `${DOC_NAME}/Contents/Resources/docSet.dsidx`
});

const toName = (key, rootPkgName) => {
  if (!rootPkgName) throw Error("please pass pkgRootName when using toName");
  if (!key) return rootPkgName;
  let s = key;
  if (s.startsWith("#")) s = s.slice(1);
  if (s.endsWith(";")) s = s.slice(0, -1);
  s = s.replace(";", ".");
  if (s.startsWith("root"))
    s = s.replace("root", rootPkgName);
  return s;
};

// const workers = [];
// const finished = () => {
//   const promises = [];
//   for (const worker of workers) promises.push(worker.terminate());
//   Promise.all(promises);
//   log("Done!");
// };

// const processed = new Set();
// const pending = [];
// const processing = new Set();
// let prev = BigInt(0);
// const receiveWorkerMessage = async (worker, msgData) => {
//   const {msg} = msgData;
//   if (msg == "complete") {
//     if (msgData.data) {;
//       processing.delete(msgData.data.hash);
//       process.stdout.clearLine();
//       process.stdout.cursorTo(0);
//       process.stdout.write(`[${processed.size}] ` + msgData.data.name);
//     }
//     while (pending.length > 0) {
//       const {hash, rootName} = pending.pop();
//       if (!processed.has(hash)) {
//         processed.add(hash);
//         processing.add(hash);
//         worker.postMessage({thisHash: hash, rootName});
//         return;
//       }
//     }
//     if (processing.size() == 0)
//       finished();
//   } else if (msg == "add") {
//     if (!msgData.data) throw Error("'add' requires a 'data' object of {type, hash}");
//     const {type, hash, rootFrom} = msgData.data;
//     if (processed.has(hash)) return;
//     if (type == "Library") pending.push({hash, rootName: rootFrom});
//     else pending.push({hash, rootName: toName(hash, rootFrom).split('.').at(0)});
//     // todo add to index
//     // todo if some
//   } else throw Error("unexpected message received");
// };

const seen = new Set();
const libs = []
const toFollow = []
let nProcessed = 0;

const pickNext = (assign) => {
  let h = undefined, t = undefined, n = undefined;
  while (toFollow.length > 0) {
    const {type, hash, rootName} = toFollow.pop();
    if (seen.has(hash)) continue;
    seen.add(hash);
    h = hash; t = type; n = rootName;
    break;
  }
  while (toFollow.length == 0 && libs.length > 0) {
    const {type, hash, name} = libs.pop();
    if (seen.has(hash)) continue;
    seen.add(hash);
    h = hash; t = type; n = name;
    break;
  }
  if (h) assign({thisHash: h, rootName: n}).then((resp) => {
    const {msgData} = resp;
    (async () => {
      nProcessed += 1;
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(`[${nProcessed}] ` + msgData);
    })();
  });  // tdod on job.
  else if (!hasRunningWorker()) {
    stopWorkers();
    (async () => {
      log("\nDone");
    })();
  }
};

const doStd = (baseUrl) => {
  initWorkers(__dirname + "/stdworker.js", 3, {
    initData: {baseUrl, DOC_PATH},
    onInit: (resp) => {
      const {msgData} = resp;
      libs.push(...msgData);
    },
    onIdle: (resp) => pickNext(resp.assign),
    onMsg: (resp) => {
      const {assign, msgData} = resp;
      for (const o of msgData) {
        toFollow.push(o);
        if (hasIdleWorker()) pickNext(assign);
      }
    },
    // onJob
    // onAsk
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