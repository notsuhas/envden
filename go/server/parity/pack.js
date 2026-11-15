import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
const root=process.cwd();
const dir=process.env.ENVDEN_CAPTURE_DIR??join(root,"go/server/testdata/parity");
const references=readdirSync(dir).filter(name=>name.endsWith(".json")).sort().map(name=>({
 name,
 fixture:JSON.parse(readFileSync(join(dir,name),"utf8")),
 database:readFileSync(join(dir,name.replace(".json",".sqlite.gz"))).toString("base64")
}));
const output=join(root,"go/server/testdata/reference.json.gz");
writeFileSync(output,gzipSync(JSON.stringify(references),{level:9}));
console.log(references.length+" request/database references packed into "+output);
