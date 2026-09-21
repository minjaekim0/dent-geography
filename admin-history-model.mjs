// The registry contains reviewed one-to-one administrative identities, not a
// spatial allocation matrix. Raw observations and source boundaries stay intact.
export const compactName=name=>String(name??'').replace(/[\s,.·ㆍ]/g,'');
export function createAdminHistory(registry){
  const edges=new Map(),nameEdges=new Map();
  const add=(map,from,to)=>{
    if(from===to||!from||!to)return;
    if(map.has(from)&&map.get(from)!==to)throw Error(`Ambiguous administrative identity: ${from}`);
    map.set(from,to);
  };
  for(const event of registry.events){
    for(const p of event.pairs){
      add(edges,p.before,p.after);
      add(nameEdges,compactName(p.beforeName),compactName(p.afterName));
    }
    for(const p of event.names||[])add(nameEdges,compactName(p[0]),compactName(p[1]));
  }
  function follow(map,key){
    const seen=new Set();
    while(map.has(key)){if(seen.has(key))throw Error(`Cyclic administrative identity: ${key}`);seen.add(key);key=map.get(key);}
    return key;
  }
  const code=key=>follow(edges,String(key));
  const nameKey=name=>follow(nameEdges,compactName(name));
  const aliases=new Map();
  for(const raw of new Set([...edges.keys(),...edges.values()])){
    const key=code(raw);if(!aliases.has(key))aliases.set(key,[]);aliases.get(key).push(raw);
  }
  // Source-period province membership is preserved even when a county changes province.
  const province=sourceCode=>code(String(sourceCode).slice(0,2)+'00000000').slice(0,2);
  const history=key=>registry.events.filter(e=>e.pairs.some(p=>code(p.before)===code(key)));
  function normalizeSnapshot(snapshot){
    const records={};
    for(const [raw,record] of Object.entries(snapshot.records)){
      const key=code(raw);
      if(records[key])throw Error(`Duplicate administrative observations: ${snapshot.period} ${key}`);
      records[key]={...record,sourceCode:raw};
    }
    return {...snapshot,records};
  }
  function comparisonIssue(key,start,end){
    if(!start||!end)return null;
    const a=start.slice(0,7),b=end.slice(0,7);
    if(a<'2023-07'&&b>='2023-07'&&['2700000000','4700000000'].includes(code(key)))
      return '군위군 편입으로 시도 집계 구역이 달라졌습니다. 경계 보정 없이 증감을 계산하지 않습니다.';
    if(a<'2026-07'&&b>='2026-07'&&key==='2826000000')
      return '검단구 분리로 서구 집계 구역이 달라졌습니다. 경계 보정 없이 증감을 계산하지 않습니다.';
    return null;
  }
  return {registry,code,nameKey,province,history,normalizeSnapshot,comparisonIssue,
    aliases:key=>aliases.get(code(key))||[String(key)],
    seriesGroups:new Set(registry.seriesGroups)};
}

// Same-name cities with changed census codes are not automatically continuous.
export function censusComparable(before,after,history){
  if(!before||!after)return false;
  if(before.sourceCode===after.sourceCode)return true;
  return compactName(before.fullName)!==compactName(after.fullName)&&history.nameKey(before.fullName)===history.nameKey(after.fullName);
}

export function createRegionLabeler(history){
  const names=new Map();
  for(const e of history.registry.events){
    for(const p of e.pairs)names.set(history.nameKey(p.afterName),p.afterName);
    for(const p of e.names||[])names.set(history.nameKey(p[1]),p[1]);
  }
  const provinces={서울:'서울특별시',부산:'부산광역시',대구:'대구광역시',인천:'인천광역시',광주:'광주광역시',대전:'대전광역시',울산:'울산광역시',세종:'세종특별자치시',경기:'경기도',강원:'강원도',충북:'충청북도',충남:'충청남도',전북:'전라북도',전남:'전라남도',경북:'경상북도',경남:'경상남도',제주:'제주특별자치도'};
  return name=>{
    const qualified=name.replace(/^([^ ]+) /,(match,p)=>provinces[p]?provinces[p]+' ':match);
    const current=names.get(history.nameKey(qualified));
    return current&&compactName(current)!==compactName(qualified)?`${current} (원자료: ${name})`:name;
  };
}
