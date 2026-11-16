package commander

import (
	"os"
	"os/exec"
	"testing"
)

func TestRegenerateReference(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}

	if err := os.WriteFile("testdata/options.mjs", []byte(`import {Command} from '../../../../apps/cli/node_modules/commander/index.js';
import {writeFileSync} from 'node:fs';
const args=[['--yes=false'],['--yes=true'],['--yes='],['--no-open=false'],['--no-open='],['--no-open'],['-y=false'],['-y='],['-ymvalue'],['-m=false'],['-m='],['--maybe=false'],['--maybe='],['--maybe'],['--maybe','value'],['--maybe','--yes'],['--yes=false','--maybe','value']];
const rows=args.map(args=>{
 let stderr='',code=0,values,acted=false;
 const p=new Command().name('demo').option('-y, --yes').option('--no-open').option('-m, --maybe [value]').exitOverride().configureOutput({writeErr:s=>stderr+=s}).action(()=>acted=true);
 try {p.parse(args,{from:'user'});values=p.opts()}catch(e){code=e.exitCode}
 return {args,stderr,code,values,acted};
});
writeFileSync(new URL('./options.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove("testdata/options.mjs") })

	if err := os.WriteFile("testdata/reference.mjs", []byte(`import {Command,Option,Argument} from '../../../../apps/cli/node_modules/commander/index.js';
import {writeFileSync} from 'node:fs';
const cases=[['batch','--required','x','--no-open=false'],['batch','--required','x','--no-open='],['run','a','--yes=false'],['run','a','--yes=true'],['run','a','--yes='],['batch','--no-open=false'],['batch','--no-open='],['run','a','--maybe=false'],['run','a','--maybe='],['run','a','--maybe'],['run','a','--maybe','value'],[],['--help'],['--version'],['help'],['help','run'],['run','--help'],['run'],['run','a','b'],['rnu'],['run','a','--loud'],['run','a','--mode'],['run','a','--mode','bad'],['run','a','--left','--right'],['run','a','--mode=fast'],['run','a','--count','-2'],['run','--','--x'],['other','--help'],['other'],['other','wat'],['run','a','--yes','extra'],['run','a','--name','value'],['batch','a','b','--tag','x','y'],['batch','--tag','x'],['batch','--help'],['batch','--no-open','file'],['batch','--hidden','file'],['batch','--required'],['batch','--required','x'],['batch','--required','x','file'],['batch','--required','x','file','--tag','a','b']];
function program(width) {
 const p=new Command().name('demo').description('A command with grouped help and a long description which wraps at the configured terminal width.').version('1.2.3').configureHelp({helpWidth:width}).exitOverride();
 p.commandsGroup('Daily use:');
 p.addCommand(new Command('run').description('Run a task and print a very long description which should wrap across multiple lines when the terminal is narrow enough.').argument('<file>','Input file').option('--yes','Confirm changes').option('--maybe [value]','Optional value').option('--name <name>','Task name').option('--count <n>','Number of tasks').addOption(new Option('--mode <mode>','Mode').choices(['fast','slow']).default('slow')).addOption(new Option('--left','Keep left').conflicts('right')).option('--right','Keep right').action(()=>{}));
 p.commandsGroup('Maintenance:');
 p.addCommand(new Command('other').description('Other commands').addArgument(new Argument('[shell]','Shell').choices(['bash','zsh']).default('bash')).action(()=>{}));
 p.addCommand(new Command('batch').description('Batch tasks').argument('[files...]','Files').option('--tag <tags...>','Tags').option('--no-open','Do not open').requiredOption('--required <value>','Required value').addOption(new Option('--hidden').hideHelp()).action(()=>{}));
 return p;
}
const fixtures=[];
for (const width of [40,80,120]) for (const args of cases) {
 let stdout='',stderr='',code=0;const p=program(width);for(const c of [p,...p.commands]) c.exitOverride().configureOutput({writeOut:s=>stdout+=s,writeErr:s=>stderr+=s});
 try {await p.parseAsync(args,{from:'user'})} catch(e) {code=e.exitCode??1}
 fixtures.push({width,args,stdout,stderr,code});
}
writeFileSync(new URL('./golden.json',import.meta.url),JSON.stringify(fixtures,null,2)+'\n');
`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove("testdata/reference.mjs") })

	cmd0 := exec.Command("bun", "testdata/options.mjs")
	cmd0.Env = append(os.Environ(), "TZ=UTC")
	if output, err := cmd0.CombinedOutput(); err != nil {
		t.Fatalf("reference: %v\n%s", err, output)
	}

	cmd1 := exec.Command("bun", "testdata/reference.mjs")
	cmd1.Env = append(os.Environ(), "TZ=UTC")
	if output, err := cmd1.CombinedOutput(); err != nil {
		t.Fatalf("reference: %v\n%s", err, output)
	}
}
