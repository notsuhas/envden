import { Database } from "bun:sqlite";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
const directories=new WeakMap();
const reservations=new WeakMap();
export function budget(reserve){
 const active=new Set();
 const wrapped=(bytes,kind="member",identity)=>{
  const release=reserve(bytes,kind,identity);
  const entry={bytes,kind,vault:identity?.vaultId?Buffer.from(identity.vaultId).toString("base64"):null,device:identity?.device?Buffer.from(identity.device).toString("base64"):null};
  if(bytes)active.add(entry);
  return ()=>{active.delete(entry);release();};
 };
 reservations.set(wrapped,active);return wrapped;
}
let sequence=0;
export function remember(storage,dir){directories.set(storage,dir)}
function snapshot(dir) {
 const db=new Database(join(dir,"envden.sqlite"),{readonly:true});
 const data=db.serialize();db.close();
 return gzipSync(data);
}
function files(dir,base=dir) {
 const result={};
 for(const name of readdirSync(dir)){
  if(name.startsWith("envden.sqlite"))continue;
  const path=join(dir,name);
  if(statSync(path).isDirectory())Object.assign(result,files(path,base));
  else result[relative(base,path)]=readFileSync(path).toString("base64");
 }
 return result;
}
function tables(dir) {
 const db=new Database(join(dir,"envden.sqlite"),{readonly:true});
 const result={};
 for(const {name} of db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
  result[name]=db.query('SELECT * FROM "'+name+'"').all().map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Uint8Array?{blob:Buffer.from(value).toString("base64")}:typeof value==="bigint"?Number(value):value])));
 }
 db.close();return result;
}
export function wrap(app,options,reserveBody,status) {
 const dir=directories.get(options.storage);
 if(!dir)return app;
 const original=app.request.bind(app); let statusCalls=0;
 app.request=async(input,init)=>{
  if(init?.body instanceof ReadableStream)return original(input,init);
  const url=typeof input==="string"?new URL(input,"http://localhost").toString():input.url;
  const req=input instanceof Request?input.clone():new Request(url,init);
  const id=String(++sequence).padStart(4,"0");
  const stem=join(process.env.ENVDEN_CAPTURE_DIR??join(process.cwd(),"go/server/testdata/parity"),id);
  const stack=new Error().stack; const mocks=Object.keys(options.storage).filter(key=>options.storage[key]?.mock); const budgets=[...(reservations.get(reserveBody)??[])]; const before=snapshot(dir);const blobs=files(dir);
  const bodyPromise=req.clone().arrayBuffer().then(value=>Buffer.from(value).toString("base64")).catch(()=>null);
  const response=await original(input,init);
  const responseBody=Buffer.from(await response.clone().arrayBuffer()).toString("base64");
  const body=await bodyPromise;
  if(body===null)return response;
  if(req.method==="GET"&&(req.url.endsWith("/")||req.url.endsWith("/v1/status")))statusCalls++;
  const faults={};
  for(const key of mocks){
   const mock=options.storage[key].mock;
   if(mock.results.some(result=>result.type==="throw"))faults[key]="throw";
   else if(key==="fileList"&&mock.results.some(result=>result.value===undefined))faults[key]="missing";
   else if(key==="state"){const missing=mock.calls.flatMap((args,i)=>mock.results[i]?.value===undefined?[args[1]]:[]);faults[key]=missing;}
  }
  const fixture={budgets,faults,stack:stack.replaceAll(process.cwd()+"/",""),mocks,statusCalls,now:options.now(),keys:{secretKey:Buffer.from(options.serverKeys.secretKey).toString("base64"),publicKey:Buffer.from(options.serverKeys.publicKey).toString("base64"),opaqueSetup:options.serverKeys.opaqueSetup},config:options.config,status:status??null,files:blobs,request:{url,method:req.method,headers:Object.fromEntries(req.headers),body},response:{status:response.status,headers:Object.fromEntries(response.headers),body:responseBody},tables:tables(dir)};
  writeFileSync(stem+".sqlite.gz",before);writeFileSync(stem+".json",JSON.stringify(fixture));
  return response;
 };
 return app;
}
