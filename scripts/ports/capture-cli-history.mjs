import * as p from "../../packages/core/src/protocol/index.ts";
import { createGenesis } from "../../apps/cli/src/vault/genesis.ts";
const keys=p.generateDeviceKeys();const identity={keys,record:{...keys,id:p.deviceId(keys),name:"test"}};const material=await createGenesis(identity,new Uint8Array(32),0);
const genesis=p.encode(p.signedCodec(p.EntryCodec),material.genesis);const body=p.encode(p.EntryCodec,material.epoch.body);body[74]=99;const unknown=p.concat(body,p.Sign(keys.objSk,'entry',body));const headerBody=p.concat(Uint8Array.of(2,2),identity.record.id);const header=p.concat(headerBody,p.Sign(keys.objSk,'manifest',headerBody));
await Bun.write(process.cwd()+'/go/cli/client/testdata/history.json',JSON.stringify({genesis:Buffer.from(genesis).toString('base64url'),unknown:Buffer.from(unknown).toString('base64url'),header:Buffer.from(header).toString('base64url')},null,2)+'\n');
