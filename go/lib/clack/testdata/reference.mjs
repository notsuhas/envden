import {writeFileSync} from 'node:fs';
const fixtures=[];
for(const columns of [40,80]) for(const color of [false,true]) for(const kind of ['text','password','confirm','select','multiselect']) for(const keys of (kind==='text'||kind==='password'?['a\r','ab\u007fc\r','ab\u001b[Dc\r','\u001b[200~abc\u001b[201~\r','hé😊\r','\u0003']:kind==='confirm'?['\r','\u001b[C\r','y','\u0003']:['\r','\u001b[B\r',' \u001b[B \r','\u0003'])) {
 let raw='',sent=false;
 const env={...process.env,FORCE_COLOR:color?'1':'0',TERM:'xterm-256color'};delete env.NO_COLOR;
 const child=Bun.spawn(['node',new URL('./prompt.mjs',import.meta.url).pathname,kind],{env,terminal:{cols:columns,rows:24,data(terminal,data){raw+=new TextDecoder().decode(data);if(!sent&&raw.includes('\u001b[?25l')){sent=true;terminal.write(keys)}}}});
 const code=await child.exited;child.terminal.close();fixtures.push({kind,keys,raw,code,color,columns});
}
writeFileSync(new URL('./golden.json',import.meta.url),JSON.stringify(fixtures,null,2)+'\n');
