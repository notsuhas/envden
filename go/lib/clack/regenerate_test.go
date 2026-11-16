package clack

import (
	"os"
	"os/exec"
	"testing"
)

func TestRegenerateReference(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}

	if err := os.WriteFile("testdata/spinner.mjs", []byte(`import {spinner} from '../../../../apps/cli/node_modules/@clack/prompts/dist/index.mjs';
import {writeFileSync} from 'node:fs';
let raw='',tick;const write=process.stdout.write;const interval=globalThis.setInterval;const clear=globalThis.clearInterval;
process.stdout.write=s=>{raw+=s;return true};globalThis.setInterval=f=>{tick=f;return 1};globalThis.clearInterval=()=>{};
const s=spinner();s.start('Working...');for(let i=0;i<10;i++)tick();s.message('Next');tick();s.stop('Done');
process.stdout.write=write;globalThis.setInterval=interval;globalThis.clearInterval=clear;
writeFileSync(new URL('./spinner.json',import.meta.url),JSON.stringify(raw)+'\n');
`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove("testdata/spinner.mjs") })

	if err := os.WriteFile("testdata/static.mjs", []byte(`import * as clack from '../../../../apps/cli/node_modules/@clack/prompts/dist/index.mjs';
import {writeFileSync} from 'node:fs';
let raw='';const write=process.stdout.write;process.stdout.write=(s)=>{raw+=s;return true};
clack.intro('Welcome');
for(const kind of ['message','info','success','step','warn','error'])clack.log[kind]('First\nSecond\n');
clack.note('Keep this safe\nTwo lines','Recovery');clack.outro('Done');clack.cancel('Cancelled');
process.stdout.write=write;
writeFileSync(new URL('./static.json',import.meta.url),JSON.stringify(raw)+'\n');
`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove("testdata/static.mjs") })

	if err := os.WriteFile("testdata/prompt.mjs", []byte(`import * as clack from '../../../../apps/cli/node_modules/@clack/prompts/dist/index.mjs';
const kind=process.argv[2];
const options={message:'Name?',options:[{value:'a',label:'Alpha'},{value:'b',label:'Beta'}],required:false};
if(kind==='confirm')options.initialValue=false;
await clack[kind](options);
`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove("testdata/prompt.mjs") })

	if err := os.WriteFile("testdata/reference.mjs", []byte(`import {writeFileSync} from 'node:fs';
const fixtures=[];
for(const columns of [40,80]) for(const color of [false,true]) for(const kind of ['text','password','confirm','select','multiselect']) for(const keys of (kind==='text'||kind==='password'?['a\r','ab\u007fc\r','ab\u001b[Dc\r','\u001b[200~abc\u001b[201~\r','hé😊\r','\u0003']:kind==='confirm'?['\r','\u001b[C\r','y','\u0003']:['\r','\u001b[B\r',' \u001b[B \r','\u0003'])) {
 let raw='',sent=false;
 const env={...process.env,FORCE_COLOR:color?'1':'0',TERM:'xterm-256color'};delete env.NO_COLOR;
 const child=Bun.spawn(['node',new URL('./prompt.mjs',import.meta.url).pathname,kind],{env,terminal:{cols:columns,rows:24,data(terminal,data){raw+=new TextDecoder().decode(data);if(!sent&&raw.includes('\u001b[?25l')){sent=true;terminal.write(keys)}}}});
 const code=await child.exited;child.terminal.close();fixtures.push({kind,keys,raw,code,color,columns});
}
writeFileSync(new URL('./golden.json',import.meta.url),JSON.stringify(fixtures,null,2)+'\n');
`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove("testdata/reference.mjs") })

	cmd0 := exec.Command("bun", "testdata/spinner.mjs")
	cmd0.Env = append(os.Environ(), "TZ=UTC")
	if output, err := cmd0.CombinedOutput(); err != nil {
		t.Fatalf("reference: %v\n%s", err, output)
	}

	cmd1 := exec.Command("bun", "testdata/static.mjs")
	cmd1.Env = append(os.Environ(), "TZ=UTC")
	if output, err := cmd1.CombinedOutput(); err != nil {
		t.Fatalf("reference: %v\n%s", err, output)
	}

	cmd3 := exec.Command("bun", "testdata/reference.mjs")
	cmd3.Env = append(os.Environ(), "TZ=UTC")
	if output, err := cmd3.CombinedOutput(); err != nil {
		t.Fatalf("reference: %v\n%s", err, output)
	}
}
