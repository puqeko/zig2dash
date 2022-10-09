
const packs = [];

const msgData = [];
for (let a = 0; a < 1000; a++) msgData.push(a);



let i = 0;
if (packs.length == 0) packs.push([]);
let nfull = packs.map((p) => p.length >= PACK_SIZE).reduce((a, b) => a+b);
if (nfull == packs.length) {
  divide(packs);
  if (nfull > 0) nfull -= 1;
}

for (const f of msgData) {
  // if (seen.has(f.hash)) continue;
  // seen.set(f.hash);
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

for (const p of packs) {
  console.log(p.length);
}