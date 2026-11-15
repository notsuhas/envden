import {format,formatDistanceStrict,milliseconds,intervalToDuration,formatDuration} from '../../../../apps/server/node_modules/date-fns/index.js';
import {TZDate} from '../../../../apps/server/node_modules/@date-fns/tz/index.js';
import {writeFileSync} from 'node:fs';
const formats=[];
for(const zone of ['UTC','Asia/Kolkata','America/New_York','Pacific/Chatham']) for(const ms of [0,1705327200000,1710054000000,1730613600000]) for(const pattern of ['yyyy-MM-dd HH:mm zzz','yyyy-MM-dd HH:mm','PP p']) formats.push({ms,zone,pattern,text:format(new TZDate(ms,zone),pattern)});
const distances=[];
for(const ms of [0,499,500,59000,59999,60000,3599999,3600000,86399999,86400000,29*86400000,30*86400000,364*86400000,365*86400000,366*86400000]) for(const sign of [-1,1]) distances.push({ms:ms*sign,text:formatDistanceStrict(ms*sign,0,{addSuffix:true})});
const durations=[0,59,60,3600,86400,31*86400,366*86400,400*86400].map(seconds=>({seconds,text:formatDuration(intervalToDuration({start:0,end:seconds*1000}),{format:['days','hours','minutes']})}));
writeFileSync(new URL('./golden.json',import.meta.url),JSON.stringify({formats,distances,durations},null,2)+'\n');
