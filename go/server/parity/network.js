import { createApp } from "../../../apps/server/src/app.ts";
import { createAdapters } from "../../../apps/server/src/adapters.ts";
import { readFileSync } from "node:fs";
const config=JSON.parse(readFileSync(process.argv[2],"utf8"));
const {storage}=createAdapters(config.dir,config.now);
const app=createApp({storage,now:()=>config.now,serverKeys:{secretKey:Buffer.from(config.keys.secretKey,"base64"),publicKey:Buffer.from(config.keys.publicKey,"base64"),opaqueSetup:config.keys.opaqueSetup},config:config.config});
const server=Bun.serve({port:0,hostname:"127.0.0.1",maxRequestBodySize:33554432,fetch:app.fetch});
console.log(server.port);
process.on("SIGTERM",()=>{server.stop(true);storage.close();process.exit(0)});
