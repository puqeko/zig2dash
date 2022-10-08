const log = console.log;

const test = async (n) => {
  let i = 0;
  while (i < n) i+= 1;
  log("did");
};

test(10000000);
log("main");