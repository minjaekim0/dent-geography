export function visibleClinics(locations, bounds, source = 'all') {
  return locations.filter(p => (source === 'all' || p.source === source) &&
    Number.isFinite(p.lng) && Number.isFinite(p.lat) &&
    p.lng >= bounds[0] && p.lng <= bounds[2] && p.lat >= bounds[1] && p.lat <= bounds[3]);
}
export function placeLink(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname === 'place.map.kakao.com' && /^\/\d+$/.test(url.pathname)
      ? 'https://place.map.kakao.com' + url.pathname : null;
  } catch { return null; }
}

export function decodeClinicIndex(payload) {
  if (payload.formatVersion !== 1) throw new Error('치과 위치 자료 형식을 확인해 주세요.');
  return {...payload, locations: payload.locations.map(r => ({
    id:r[0], name:r[1], lng:r[2], lat:r[3], source:r[4] === 1 ? 'kakao' : 'hira_unverified', detailChunk:r[5]
  }))};
}

export function createClinicIndex(locations, cellSize = .05) {
  const cells = new Map();
  for (const point of locations) {
    if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) continue;
    const key = Math.floor(point.lng / cellSize) + ':' + Math.floor(point.lat / cellSize);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(point);
  }
  return {query(bounds, source = 'all') {
    const result = [];
    const x1=Math.floor(bounds[0]/cellSize),x2=Math.floor(bounds[2]/cellSize);
    const y1=Math.floor(bounds[1]/cellSize),y2=Math.floor(bounds[3]/cellSize);
    // A world viewport may contain many empty cells; scan occupied cells there.
    const accept = points => { for (const p of points) if ((source === 'all' || source === p.source) && p.lng >= bounds[0] && p.lng <= bounds[2] && p.lat >= bounds[1] && p.lat <= bounds[3]) result.push(p); };
    if ((x2-x1+1)*(y2-y1+1) > cells.size) {
      for (const [key,points] of cells) {
        const [x,y]=key.split(':').map(Number);
        if(x>=x1&&x<=x2&&y>=y1&&y<=y2)accept(points);
      }
    } else {
      for(let x=x1;x<=x2;x++)for(let y=y1;y<=y2;y++)accept(cells.get(x+':'+y)||[]);
    }
    return result;
  }};
}

export function clinicDisplayPlan(index, bounds, source = 'all', width = 900, height = 520, maxOverlays = 240, individual = false) {
  const points = index.query(bounds, source);
  const single = p => ({key:'p:'+p.id, lng:p.lng, lat:p.lat, count:1, members:[p], kakaoCount:p.source==='kakao'?1:0});
  if (individual || points.length <= maxOverlays) {
    const exact = new Map();
    for (const p of points) {
      const key = p.lng + ':' + p.lat;
      if (!exact.has(key)) exact.set(key, []);
      exact.get(key).push(p);
    }
    return {points, entries:[...exact.values()].map(members => members.length === 1 ? single(members[0]) : {
      key:(individual?'d:':'c:')+members[0].lng+':'+members[0].lat, lng:members[0].lng, lat:members[0].lat,
      displayAsDot:individual,
      count:members.length, kakaoCount:members.filter(p=>p.source==='kakao').length,
      bounds:[members[0].lng,members[0].lat,members[0].lng,members[0].lat], members
    })};
  }
  const step = span => 2 ** Math.ceil(Math.log2(Math.max(span, 1e-8)));
  let dx=step((bounds[2]-bounds[0])/Math.max(1,Math.floor(width/65)));
  let dy=step((bounds[3]-bounds[1])/Math.max(1,Math.floor(height/65)));
  let groups;
  do {
    groups = new Map();
    for (const p of points) {
      const key='g:'+dx+':'+dy+':'+Math.floor(p.lng/dx)+':'+Math.floor(p.lat/dy);
      if(!groups.has(key))groups.set(key,{key,lng:0,lat:0,count:0,kakaoCount:0,bounds:[Infinity,Infinity,-Infinity,-Infinity],members:[]});
      const g=groups.get(key);g.lng+=p.lng;g.lat+=p.lat;g.count++;g.kakaoCount+=p.source==='kakao';g.members.push(p);
      g.bounds[0]=Math.min(g.bounds[0],p.lng);g.bounds[1]=Math.min(g.bounds[1],p.lat);
      g.bounds[2]=Math.max(g.bounds[2],p.lng);g.bounds[3]=Math.max(g.bounds[3],p.lat);
    }
    if(groups.size>maxOverlays){dx*=2;dy*=2;}
  } while(groups.size>maxOverlays);
  return {points,entries:[...groups.values()].map(g=>g.count===1?single(g.members[0]):({...g,lng:g.lng/g.count,lat:g.lat/g.count}))};
}
