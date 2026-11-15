import * as clack from '../../../../apps/cli/node_modules/@clack/prompts/dist/index.mjs';
const kind=process.argv[2];
const options={message:'Name?',options:[{value:'a',label:'Alpha'},{value:'b',label:'Beta'}],required:false};
if(kind==='confirm')options.initialValue=false;
await clack[kind](options);
