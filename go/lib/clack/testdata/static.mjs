import * as clack from '../../../../apps/cli/node_modules/@clack/prompts/dist/index.mjs';
import {writeFileSync} from 'node:fs';
let raw='';const write=process.stdout.write;process.stdout.write=(s)=>{raw+=s;return true};
clack.intro('Welcome');
for(const kind of ['message','info','success','step','warn','error'])clack.log[kind]('First\nSecond\n');
clack.note('Keep this safe\nTwo lines','Recovery');clack.outro('Done');clack.cancel('Cancelled');
process.stdout.write=write;
writeFileSync(new URL('./static.json',import.meta.url),JSON.stringify(raw)+'\n');
