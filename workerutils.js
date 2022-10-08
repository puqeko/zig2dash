import os from 'os';
import { Worker } from "worker_threads";
import { dirname } from 'path';
import { fileURLToPath } from 'url';

export const __dirname = dirname(fileURLToPath(import.meta.url));
const log = console.log;

// Simple worker model
// Workers:
// workers report when a job is completed
// workers report any results during a job
// when workers start they run an init job
// Main:
// receives results during a job  onData
// assigns next job to be processed  onIdle

const pool = [];
const assign = (id, data) => {
  pool[id].info.status = "working";
  pool[id].info.jobData = data;
  pool[id].worker.postMessage({tag: 'job', data});
};
const receiver = (id, opts, msg) => {
  const workerState = pool[id];
  const info = workerState.info;
  const boundAssign = assign.bind(assign, id);
  const isInit = info.status == "initalising";
  switch (msg.tag) {
    case "finished":
      info.status = "idle";
      if (isInit) opts.onInit({msgData: msg.data, initData: opts?.initData});
      else info.nCompleted += 1;
      if (opts && opts.onIdle) opts.onIdle({assign: boundAssign, msgData: msg.data, jobData: info.jobData, isInit});
      break;
    case "data":
      if (opts && opts.onData) opts.onData({msgData: msg.data, jobData: info.jobData, isInit});
      break;
    case "ask":
      if (opts && opts.onAsk) {
        const data = opts.onAsk({msgData: msg.data, jobData: info.jobData, isInit});
        workerState.worker.postMessage({tag: 'reply', data});
      } else throw Error(`worker ${id} sent an ask but there is no onAsk handler specified`);
      break;
    case "reply":
      if (opts && opts.onReply) opts.onReply({msgData: msg.data, jobData: info.jobData, isInit});
      break;
    default:
      throw Error(`unexpected message tag '${msg.tag}' from worker ${id}`);
  }
};

export const askRunningWorkers = () => {
  for (const ws of pool) {
    if (ws.info.status == "working") ws.worker.postMessage({tag: "ask"});
  }
};
export const workerStats = () => {
  const res = [];
  for (const ws of pool) {
    const {status, nCompleted} = ws.info;
    res.push({status, nCompleted});
  }
  return res;
};
export const assignIdleWorker = (data) => {
  for (const workerState of pool) if (workerState.info.status == "idle") return assign(workerState.info.id, data);
  throw Error("no idle workers");
};
export const stopWorkers = () => {
  for (const workerState of pool) workerState.worker.terminate();
}
export const initWorkers = (workerpath, opts) => {
  const nWorkers = opts?.nWorkers || os.cpus().length - 1;
  log(`Starting ${nWorkers} worker${nWorkers > 1 ? 's' : ''}...`);
  for (let id = 0; id < nWorkers; id++) {
    const worker = new Worker(workerpath, {workerData: {id, initData: opts?.initData}});
    worker.on("message", receiver.bind(receiver, id, opts));
    const info = {id, status: "initalising", nCompleted: 0};  // "initalising" | "working" | "idle"
    pool.push({worker, info});
  }
};



// initWorkers(__dirname + "./stdworker.js", {
//   nWorkers: 1,
//   initData: {},
//   onInit: (o) => {

//   },
//   onIdle: (o) => {

//   },
//   onAsk: (o) => {

//   },
//   onData: (o) => {

//   }
// });