import pako from '../../../../node_modules/.bun/pako@1.0.11/node_modules/pako/index.js';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const vectors=[];
for (const size of [0,1,2,3,4,7,31,255,256,257,258,259,261,262,1024,16382,16383,16384,32767,32768,32769,65274,65536,131073,300000]) {
 for(const kind of ['random','repeat','ramp','mixed']) {
  let seed=42; const input=new Uint8Array(size);
  for(let i=0;i<size;i++) {
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   input[i]=kind==='random'?seed>>>24:kind==='repeat'?97:kind==='ramp'?i%256:i%1024<800?i%23:seed>>>24;
  }
  const compressed=pako.deflate(input);
  vectors.push({kind,size,length:compressed.length,sha256:createHash('sha256').update(compressed).digest('hex'),...(size<=1024?{hex:Buffer.from(compressed).toString('hex')}:{})});
 }
}
writeFileSync(new URL('./golden.json',import.meta.url),JSON.stringify(vectors,null,2)+'\n');
