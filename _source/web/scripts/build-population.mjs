// Read-only official CSV ingestion. Raw downloads stay outside the published site.
import {readFileSync, writeFileSync, mkdirSync, existsSync, renameSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const raw=resolve(root,'data/incoming/population/age'), out=resolve(root,'web/dist/data/population');
export const SOURCE='https://jumin.mois.go.kr/ageStatMonth.do';
export function csvRows(text) {
  const rows=[]; let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw Error('Unterminated CSV field');
  if(field||row.length){row.push(field);rows.push(row);}
  return rows;
}
export function parsePopulation(bytes,period) {
  const text=new TextDecoder('euc-kr').decode(bytes).replace(/^\uFEFF/,'');
  const [header,...rows]=csvRows(text);
  if(header?.[0]!=='행정구역')throw Error(`Unexpected CSV: ${text.slice(0,100)}`);
  const prefix=`${period.slice(0,4)}년${period.slice(5)}월_`;
  const indexes=['계','남','여'].map(sex=>({total:header.indexOf(`${prefix}${sex}_총인구수`),ages:Array.from({length:101},(_,age)=>header.indexOf(`${prefix}${sex}_${age}세${age===100?' 이상':''}`))}));
  // Some exports omit the space before 이상.
  indexes.forEach((index,s)=>{if(index.ages[100]<0)index.ages[100]=header.indexOf(`${prefix}${['계','남','여'][s]}_100세이상`);});
  if(indexes.some(i=>i.total<0||i.ages.some(c=>c<0)))throw Error(`Missing single-age columns for ${period}`);
  const number=value=>{const clean=value?.replaceAll(',','').trim();if(!/^\d+$/.test(clean??''))throw Error(`Invalid population: ${value}`);return Number(clean);};
  const records={};
  for(const row of rows){
    const match=row[0].match(/^(.*?)\s*\((\d{10})\)\s*$/);
    if(!match)throw Error(`Missing administrative code: ${row[0]}`);
    const [,name,code]=match;
    if(records[code])throw Error(`Duplicate code: ${code}`);
    const totals=indexes.map(i=>number(row[i.total]));
    const ages=indexes.map(i=>i.ages.map(c=>number(row[c])));
    for(let s=0;s<3;s++)if(ages[s].reduce((a,b)=>a+b,0)!==totals[s])throw Error(`Age sum mismatch: ${code}/${s}`);
    if(totals[1]+totals[2]!==totals[0]||ages[0].some((n,a)=>n!==ages[1][a]+ages[2][a]))throw Error(`Sex sum mismatch: ${code}`);
    records[code]={name:name.trim().replace(/\s+/g,' '),totals,ages};
  }
  return {period,records};
}

async function main(){
  mkdirSync(raw,{recursive:true});mkdirSync(out,{recursive:true});
  const latestArg=process.argv.find(v=>v.startsWith('--latest='));
  const latest=latestArg?.split('=')[1];
  if(!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(latest??'')||Number(latest.slice(0,4))<2008)throw Error('Specify latest published month: --latest=YYYY-MM (2008 onward)');
  const periods=[...Array.from({length:Number(latest.slice(0,4))-2008},(_,i)=>`${2008+i}-12`),latest];
  const geometries=JSON.parse(readFileSync(resolve(root,'web/dist/data/eupmyeondong-boundaries.json'),'utf8'));
  const geometryCodes=new Set(geometries.features.map(f=>String(f.properties.code)));
  const manifest={schemaVersion:1,source:{title:'행정안전부 행정동별 연령별 주민등록인구',url:SOURCE,registration:'전체 (거주자·거주불명자·재외국민), 외국인 제외',ageUnit:1,topAge:'100세 이상',sexOrder:['계','남','여']},boundary:{file:'data/eupmyeondong-boundaries.json',sha256:createHash('sha256').update(readFileSync(resolve(root,'web/dist/data/eupmyeondong-boundaries.json'))).digest('hex'),mode:'fixed-code-reference',historicalHarmonized:false,note:'기존 보유 경계에 동일 행정기관코드의 과거 통계를 연결한 참고 지도. 당시 경계 재현·분동/합동 보정 아님. 코드가 같아도 경계가 달라질 수 있음.'},periods:[]};
  const series={};
  for(const period of periods){
    for(const [suffix,level] of [['',3],['-national',1]]) {
    const file=resolve(raw,`${period}${suffix}.csv`);
    if(!existsSync(file)){
      const [year,month]=period.split('-');
      const params=new URLSearchParams({sltOrgType:'1',sltOrgLvl1:'A',sltOrgLvl2:'',gender:'gender',sum:'sum',sltUndefType:'',searchYearStart:year,searchMonthStart:month,searchYearEnd:year,searchMonthEnd:month,sltOrderType:'1',sltOrderValue:'ASC',sltArgTypes:'1',sltArgTypeA:'0',sltArgTypeB:'100',category:'month'});
      console.log(`Downloading ${period} ...`);
      const temporary=file+'.download';
      execFileSync('curl',['--fail','-LsS','--retry','2','--max-time','120',`https://jumin.mois.go.kr/downloadCsvAge.do?searchYearMonth=month&xlsStats=${level}`,'--data',String(params),'-o',temporary],{stdio:'inherit'});
      parsePopulation(readFileSync(temporary),period); // Never cache an HTML error page as a CSV.
      renameSync(temporary,file);
    }
    }
    const file=resolve(raw,`${period}.csv`);
    const bytes=readFileSync(file),data=parsePopulation(bytes,period);
    const nationalBytes=readFileSync(resolve(raw,`${period}-national.csv`));
    const controls=parsePopulation(nationalBytes,period).records;
    for(const [code,control] of Object.entries(controls)){
      if(data.records[code]&&JSON.stringify(data.records[code].ages)!==JSON.stringify(control.ages))throw Error(`Province control mismatch: ${period}/${code}`);
      data.records[code]=control;
    }
    if(!controls['0000000000'])throw Error('Missing national control');
    const localCodes=Object.keys(data.records).filter(c=>!c.endsWith('00000'));
    const matched=localCodes.filter(c=>geometryCodes.has(c));
    const localTotal=localCodes.reduce((a,c)=>a+data.records[c].totals[0],0);
    // Preserve national official total independently; do not double count aggregate rows.
    const provinceTotal=Object.entries(controls).filter(([c])=>c!=='0000000000'&&c.endsWith('00000000')).reduce((s,[,r])=>s+r.totals[0],0);
    if(provinceTotal!==controls['0000000000'].totals[0])throw Error(`Province/national reconciliation failed: ${period}`);
    const localGap=controls['0000000000'].totals[0]-localTotal;
    for(const [code,record] of Object.entries(data.records)){
      const group=code.endsWith('00000000')?code.slice(0,2):code.slice(0,5);
      series[group]??={};series[group][code]??={};series[group][code][period]=record;
    }
    writeFileSync(resolve(out,`${period}.json`),JSON.stringify(data));
    manifest.periods.push({period,file:`data/population/${period}.json`,yearEnd:period.endsWith('-12'),localCount:localCodes.length,mappedCount:matched.length,nationalTotal:controls['0000000000'].totals[0],localTotal,localGap,national:controls['0000000000'],sourceSha256:createHash('sha256').update(bytes).digest('hex'),nationalSourceSha256:createHash('sha256').update(nationalBytes).digest('hex')});
    console.log(`${period}: ${localCodes.length} local rows, ${matched.length} map-code matches; national ${controls['0000000000'].totals[0].toLocaleString()}, local gap ${localGap}; age/sex totals reconciled`);
  }
  for(const[group,records]of Object.entries(series))writeFileSync(resolve(out,`series-${group}.json`),JSON.stringify(records));
  writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
