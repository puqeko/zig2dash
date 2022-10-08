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
// receives results during a job  onMsg
// assigns next job to be processed  onIdle

const assign = (workerState, data) => {
  return new Promise((resolve, reject) => {
    workerState.info.status = "working";
    workerState.info.jobCallback = resolve;
    workerState.info.jobErrorCallback = reject;
    workerState.info.jobData = data;
    workerState.worker.postMessage({tag: 'job', data});
  });
};

const pool = [];
const receiver = (id, opts, msg) => {
  const workerState = pool[id];
  const info = workerState.info
  const boundAssign = assign.bind(assign, workerState);
  switch (msg.tag) {
    case "finished":
      info.status = "idle";
      if (info.jobCallback) info.jobCallback({assign: boundAssign, msgData: msg?.data, jobData: info.jobData});
      info.jobCallback = undefined;
      info.jobErrorCallback = undefined;
      info.jobData = undefined;
      if (opts && opts.onIdle && info.status == "idle") opts.onIdle({assign: boundAssign});
      break;
    case "data":
      if (opts && opts.onMsg) opts.onMsg({assign: boundAssign, msgData: msg.data, jobData: info.jobData});
      break;
    default:
      throw Error(`unexpected message tag '${msg.tag}' from worker ${id}`);
  }
};

export const hasIdleWorker = () => {
  for (const {info} of pool) if (info.status == "idle") return true;
  return false;
};
export const hasRunningWorker = () => {
  for (const {info} of pool) if (info.status == "working") return true;
  return false;
};
export const assignIdleWorker = (data) => {
  for (const workerState of pool) if (workerState.info.status == "idle") return assign(workerState, data);
  return Promise.reject("no idle workers");
};
export const stopWorkers = () => {
  for (const workerState of pool) workerState.worker.terminate();
}
export const initWorkers = (workerpath, n, opts) => {
  const nWorkers = n || os.cpus().length - 1;
  log(`Starting ${nWorkers} workers...`);
  for (let id = 0; id < nWorkers; id++) {
    const worker = new Worker(workerpath, {workerData: {id, initData: opts?.initData}});
    worker.on("message", receiver.bind(receiver, id, opts));
    const info = {status: "working", jobCallback: opts?.onInit, jobData: opts?.initData};  // "working" | "idle"
    pool.push({worker, info});
  }
};

// eg
// initWorkers(__dirname + "/testworker.js", 1, {
//   onInit: (job) => log(job.msgData),
//   onIdle: (job) => job.assign("test data").then((job) => log("done test", job.msgData)),
//   onMsg: (job) => log(job.msgData)
// });