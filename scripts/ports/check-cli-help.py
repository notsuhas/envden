import json,subprocess,pathlib,difflib
root=pathlib.Path(__file__).resolve().parents[2]
cases=json.loads((root/'go/cli/program/testdata/help.json').read_text())
failed=0
for case in cases:
 args=case['args']
 a=subprocess.run([str(root/'apps/cli/dist/envden'),*args],capture_output=True)
 b=subprocess.run([str(root/'go/envden'),*args],capture_output=True)
 if (a.stdout,a.stderr,a.returncode)!=(b.stdout,b.stderr,b.returncode):
  failed+=1;print('FAIL',' '.join(args))
  print(''.join(difflib.unified_diff(a.stdout.decode().splitlines(True),b.stdout.decode().splitlines(True))))
  print('stderr',a.stderr,b.stderr,'codes',a.returncode,b.returncode)
print(len(cases),'checks;',failed,'failed')
raise SystemExit(bool(failed))
