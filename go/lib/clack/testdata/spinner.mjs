import {spinner} from '../../../../apps/cli/node_modules/@clack/prompts/dist/index.mjs';
import {writeFileSync} from 'node:fs';
let raw='',tick;const write=process.stdout.write;const interval=globalThis.setInterval;const clear=globalThis.clearInterval;
process.stdout.write=s=>{raw+=s;return true};globalThis.setInterval=f=>{tick=f;return 1};globalThis.clearInterval=()=>{};
const s=spinner();s.start('Working...');for(let i=0;i<10;i++)tick();s.message('Next');tick();s.stop('Done');
process.stdout.write=write;globalThis.setInterval=interval;globalThis.clearInterval=clear;
writeFileSync(new URL('./spinner.json',import.meta.url),JSON.stringify(raw)+'\n');
