import {Command,Option,Argument} from '../../../../apps/cli/node_modules/commander/index.js';
import {writeFileSync} from 'node:fs';
const cases=[[],['--help'],['--version'],['help'],['help','run'],['run','--help'],['run'],['run','a','b'],['rnu'],['run','a','--loud'],['run','a','--mode'],['run','a','--mode','bad'],['run','a','--left','--right'],['run','a','--mode=fast'],['run','a','--count','-2'],['run','--','--x'],['other','--help'],['other'],['other','wat'],['run','a','--yes','extra'],['run','a','--name','value'],['batch','a','b','--tag','x','y'],['batch','--tag','x'],['batch','--help'],['batch','--no-open','file'],['batch','--hidden','file'],['batch','--required'],['batch','--required','x'],['batch','--required','x','file'],['batch','--required','x','file','--tag','a','b']];
function program(width) {
 const p=new Command().name('demo').description('A command with grouped help and a long description which wraps at the configured terminal width.').version('1.2.3').configureHelp({helpWidth:width}).exitOverride();
 p.commandsGroup('Daily use:');
 p.addCommand(new Command('run').description('Run a task and print a very long description which should wrap across multiple lines when the terminal is narrow enough.').argument('<file>','Input file').option('--yes','Confirm changes').option('--name <name>','Task name').option('--count <n>','Number of tasks').addOption(new Option('--mode <mode>','Mode').choices(['fast','slow']).default('slow')).addOption(new Option('--left','Keep left').conflicts('right')).option('--right','Keep right').action(()=>{}));
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
