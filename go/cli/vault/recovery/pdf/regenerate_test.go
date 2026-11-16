package pdf

import (
	"os"
	"os/exec"
	"testing"
)

func TestRegenerateReference(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}

	if err := os.WriteFile("testdata/reference.mjs", []byte(`import { renderKit } from '../../../../../../apps/cli/src/vault/recovery/pdf/layout.ts';
import { kitDocument } from '../../../../../../apps/cli/src/vault/recovery/pdf/model.ts';
import { writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
const NativeDate=Date;
const now=1700000000123;
globalThis.Date=class extends NativeDate { constructor(...args) { super(...(args.length?args:[now])); } };
const kits=[
 {vaultId:'A'.repeat(52),secretKey:'EK1-AAAA-AAAA-AAAA-AAAA-AAAA',server:'http://local',device:'test',date:0},
 {vaultId:'B'.repeat(52),secretKey:'EK1-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789',server:'https://envden.example.com:8443',device:'München 🐈 東京',date:now},
 {vaultId:'Z'.repeat(52),secretKey:'EK1-0000-1111-2222-3333-4444',server:'https://long.example.com/'+ 'path/'.repeat(10),device:'workstation '+ 'name '.repeat(12),date:now},
];
const result=[];
for(const kit of kits) {
 const document=kitDocument(kit,new Date(kit.date),kit.device);
 const pdf=Buffer.from(await renderKit(document));
 const start=pdf.indexOf('stream\n')+7,end=pdf.indexOf('\nendstream');
 result.push({kit,document,metadataTime:now,pdf:pdf.toString('base64'),content:inflateSync(pdf.subarray(start,end)).toString('base64'),compressed:pdf.subarray(start,end).toString('base64')});
}
const json=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--stdout')) process.stdout.write(json);
else writeFileSync(new URL('./reference.json',import.meta.url),json);
`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove("testdata/reference.mjs") })

	cmd0 := exec.Command("bun", "testdata/reference.mjs")
	cmd0.Env = append(os.Environ(), "TZ=UTC")
	if output, err := cmd0.CombinedOutput(); err != nil {
		t.Fatalf("reference: %v\n%s", err, output)
	}
}
