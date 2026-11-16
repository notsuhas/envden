package commander

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"reflect"
	"testing"
)

func TestRegenerateDispatchReference(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}
	script := `import {Command} from '../../../../apps/cli/node_modules/commander/index.js';
import {writeFileSync} from 'node:fs';
const cases=[['rm','help'],['--unknown','help','rm'],['help','rm'],['--dry-run','rm','--yes','.env'],['rm','--dry-run','--yes','.env'],['group','--dry-run','rm','.env'],['--yes','rm','.env'],['rm','--yes','.env'],['rm','.env','--root'],['--dry-run','rm','--help'],['rm','--dry-run','--help'],['rm','.env','--dry-run'],['run','echo','--unknown'],['run','--unknown','echo'],['--unknown','run','echo'],['loose','--unknown','x'],['--unknown','loose','x'],['group','rm','--yes','.env']];
const rows=cases.map(args=>{let stderr='',stdout='',acted=false,hooked=false,code=0,values;
const p=new Command('demo').option('--root').exitOverride().configureOutput({writeErr:s=>stderr+=s,writeOut:s=>stdout+=s});
p.hook('preAction',()=>hooked=true);
const action=(...a)=>{acted=true;values=a.at(-1).args};
p.command('rm').argument('[file]').option('--yes').action(action);
p.command('group').command('rm').argument('[file]').option('--yes').action(action);
p.enablePositionalOptions();
p.command('run').argument('[args...]').passThroughOptions().action(action);
p.command('loose').argument('[args...]').allowUnknownOption().action(action);
if(!args.includes('run'))p.enablePositionalOptions(false);
try{p.parse(args,{from:'user'})}catch(e){code=e.exitCode??1}
return {args,stderr,stdout,acted,hooked,code,values};});
writeFileSync(new URL('./dispatch.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');`
	path := "testdata/dispatch.mjs"
	if err := os.WriteFile(path, []byte(script), 0600); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = os.Remove(path) }()
	if out, err := exec.Command("bun", path).CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
}

func TestSubcommandDispatch(t *testing.T) {
	data, err := os.ReadFile("testdata/dispatch.json")
	if err != nil {
		t.Fatal(err)
	}
	var rows []struct {
		Args           []string
		Stderr, Stdout string
		Acted, Hooked  bool
		Code           int
		Values         []string
	}
	if err = json.Unmarshal(data, &rows); err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		t.Run(fmtArgs(row.Args), func(t *testing.T) {
			var stderr, stdout bytes.Buffer
			acted, hooked := false, false
			var values []string
			p := New("demo").Option("--root", "")
			p.Stderr = &stderr
			p.Stdout = &stdout
			p.Hook("preAction", func(*Command, *Command) error { hooked = true; return nil })
			action := func(i *Invocation) error { acted = true; values = i.Args; return nil }
			p.AddCommand(New("rm").Argument("[file]", "").Option("--yes", "").Action(action))
			p.AddCommand(New("group").AddCommand(New("rm").Argument("[file]", "").Option("--yes", "").Action(action)))
			run := New("run").Argument("[args...]", "").Action(action)
			run.PassThrough = true
			p.AddCommand(run)
			loose := New("loose").Argument("[args...]", "").Action(action)
			loose.UnknownOptions = true
			p.AddCommand(loose)
			_, err := p.Parse(row.Args)
			code := 0
			var exit *ExitError
			if errors.As(err, &exit) {
				code = exit.ExitCode
			} else if err != nil {
				t.Fatal(err)
			}
			if code != row.Code || stderr.String() != row.Stderr || stdout.String() != row.Stdout || acted != row.Acted || hooked != row.Hooked || (acted && !reflect.DeepEqual(values, row.Values)) {
				t.Errorf("code=%d stderr=%q acted=%v hooked=%v want %+v", code, stderr.String(), acted, hooked, row)
			}
		})
	}
}

func fmtArgs(args []string) string { data, _ := json.Marshal(args); return string(data) }
