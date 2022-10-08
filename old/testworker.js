import { parentPort, workerData, isMainThread } from "worker_threads";

const process = (data) => {
  parentPort.postMessage({tag: 'data', data: "jobData1"});
  setTimeout(() => {
    parentPort.postMessage({tag: 'data', data: "jobData2"});
    parentPort.postMessage({tag: 'finished', data: "finishedJobData"});
  }, 2000);
};

parentPort.on("message", (msg) => {
  if (msg.tag == 'job') process(msg.data);
  else throw Error(`unexpected tag '${msg.tag}'`);
});

const init = (data) => {
  parentPort.postMessage({tag: 'data', data: "initData"});
  setTimeout(() => {
    parentPort.postMessage({tag: 'finished', data: "finishedData"});
  }, 2000);
};

init(workerData?.initData);