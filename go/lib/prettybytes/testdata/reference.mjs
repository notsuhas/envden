import prettyBytes from '../../../../apps/server/node_modules/pretty-bytes/index.js';
import {writeFileSync} from 'node:fs';
const fixtures=[];
for(const binary of [false,true]) for(const value of [0,-0,0.00000001,0.1,1,999,999.9,1000,1023,1024,1805,1850,1024**2-1,1024**2,1e9,-1805,Number.MAX_SAFE_INTEGER,1e24]) fixtures.push({value,binary,text:prettyBytes(value,{binary})});
writeFileSync(new URL('./golden.json',import.meta.url),JSON.stringify(fixtures,null,2)+'\n');
