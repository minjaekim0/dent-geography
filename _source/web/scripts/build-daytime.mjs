// KOSIS official bulk CSVs stay intact in ZIP archives. No interpolated years or allocations.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {csvRows} from './build-population.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const tables={2005:'DT_1T0502',2010:'DT_1PA1021',2015:'DT_1PA1520',2020:'DT_1PA2020'};
const compact=s=>s.replace(/\s+/g,'').replace(/\([^)]*\)/g,'');
const result={source:'KOSIS 인구총조사 통근·통학 기반 공식 주간인구',years:Object.keys(tables).map(Number),periods:{},notes:'상주인구 + 통근·통학 유입 − 유출. 5년 간격 관측값만 제공. 시도와 시군구 전체 명칭으로 연결하며 과거 경계는 미보정. 추정 배분·보간 없음.'};
for(const [year,table]of Object.entries(tables)){
  const path=resolve(root,`data/incoming/population/daytime/${year}.zip`);
  const bytes=execFileSync('unzip',['-p',path],{maxBuffer:20*1024*1024});
  const csv=new TextDecoder('euc-kr',{fatal:true}).decode(bytes);
  const rows=csvRows(csv).filter(r=>r.length>6),header=rows.shift();
  const columns=header.map(compact),at=name=>columns.indexOf(name);
  const number=s=>s==null||s.trim()===''?null:/^\d+(\.0+)?$/.test(s.trim())?Number(s):(()=>{throw Error(`Invalid count ${s}`)})();
  const period={year:Number(year),table,url:`https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=${table}`,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),records:{},ages:new Set(),sexes:new Set(),rows:0,identityDifferences:0,maxIdentityDifference:0};
  let province='',city='',cityCode='';
  for(const row of rows){
    if(Number(row[at('시점')])!==Number(year))throw Error('Wrong census year');
    const code=row[at('C행정구역별')].replace(/^'/,''),sex=row[at('C성별')].replace(/^'/,''),age=row[at('연령별')].trim();
    const name=row[at('행정구역별')].trim();
    if(!period.records[code]){
      if(code.length===2){province=code==='00'?'':name;city='';cityCode='';}
      else if(name.endsWith('시')){city=name;cityCode=code;}
      const parentCity=name.endsWith('구')&&city&&code.slice(0,4)===cityCode.slice(0,4)?city:'';
      period.records[code]={name,fullName:code.length===2?name:[province,parentCity,name].filter(Boolean).join(' '),values:{}};
    }
    const record=period.records[code];
    if(record.name!==name)throw Error('Conflicting region name');
    const key=`${sex}:${age}`;
    if(record.values[key])throw Error('Duplicate source observation');
    const resident=number(row[at('상주인구')]),daytime=number(row[at('주간인구')]),inflow=number(row[at('유입인구-계')]),outflow=number(row[at('유출인구-계')]);
    if([resident,daytime,inflow,outflow].every(Number.isFinite)&&resident+inflow-outflow!==daytime){period.identityDifferences++;period.maxIdentityDifference=Math.max(period.maxIdentityDifference,Math.abs(resident+inflow-outflow-daytime));}
    record.values[key]={resident,daytime,inflow,outflow};period.ages.add(age);period.sexes.add(sex);period.rows++;
  }
  period.ages=[...period.ages];period.sexes=[...period.sexes];
  if(!period.records['00']?.values['0:합계']||Object.keys(period.records).length<200)throw Error('Incomplete nationwide census');
  result.periods[year]=period;
  console.log(year,period.rows,Object.keys(period.records).length,period.ages,period.records['00'].values['0:합계']);
}
writeFileSync(resolve(root,'web/dist/data/daytime-history.json'),JSON.stringify(result));
