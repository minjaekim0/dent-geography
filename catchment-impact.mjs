import {topImpacts} from './catchment-impact-model.mjs';
export function impactPanel(impact){
  const section=document.createElement('details');section.className='catchment-impact';section.open=true;
  const summary=document.createElement('summary');summary.textContent='주변 치과 기댓값 변화 TOP 5';section.append(summary);
  const note=document.createElement('p');note.textContent='영향받는 '+impact.rows.length.toLocaleString('ko-KR')+'곳 중 감소량 상위 5곳';section.append(note);
  const format=n=>Math.round(n).toLocaleString('ko-KR'),loss=n=>n>0&&n<1?'1명 미만':format(n)+'명';
  const totalLoss=key=>impact.rows.reduce((s,r)=>s+r[key].loss,0);
  const totals=document.createElement('p');totals.className='catchment-impact-total';totals.textContent='전체 감소 합계 · 거주 '+format(totalLoss('population'))+'명 / 종사 '+format(totalLoss('workers'))+'명';section.append(totals);
  if(impact.newlyCovered.population>0||impact.newlyCovered.workers>0){const covered=document.createElement('small');covered.textContent='새로 연결되는 인구 · 거주 '+format(impact.newlyCovered.population)+'명 / 종사 '+format(impact.newlyCovered.workers)+'명';section.append(covered);}
  if(!impact.rows.length){const empty=document.createElement('p');empty.textContent='수록된 격자 자료에서 기댓값이 감소하는 기존 치과가 없습니다.';section.append(empty);return section;}
  const label=document.createElement('label');label.textContent='TOP 5 기준 ';const sort=document.createElement('select');sort.setAttribute('aria-label','주변 치과 변화 정렬');
  for(const [value,text] of [['population','거주인구 감소량'],['workers','종사인구 감소량']]){const option=document.createElement('option');option.value=value;option.textContent=text;sort.append(option);}label.append(sort);section.append(label);
  const list=document.createElement('ol');list.className='catchment-impact-cards';section.append(list);
  function draw(){
    list.replaceChildren();
    topImpacts(impact.rows,sort.value).forEach((row,i)=>{
      const card=document.createElement('li'),heading=document.createElement('div');heading.className='catchment-impact-heading';
      const rank=document.createElement('b');rank.className='catchment-impact-rank';rank.textContent=i+1;
      const name=document.createElement('strong');name.textContent=row.clinic.name;
      const distance=document.createElement('small');distance.textContent=row.distance<1000?format(row.distance)+'m':(row.distance/1000).toFixed(1)+'km';heading.append(rank,name,distance);card.append(heading);
      const values=document.createElement('div');values.className='catchment-impact-values';
      for(const [key,title] of [['population','거주인구'],['workers','종사인구']]){
        const r=row[key],cell=document.createElement('div');cell.className=key;
        const caption=document.createElement('small');caption.textContent=title;cell.append(caption);
        const numbers=document.createElement('strong');numbers.textContent=r.records?format(r.before)+' → '+format(r.after)+'명':'자료 없음';cell.append(numbers);
        if(r.records){const change=document.createElement('span'),percent=r.before>0?r.loss/r.before*100:0;change.className='catchment-impact-loss';change.textContent='−'+loss(r.loss)+' · '+(percent>0&&percent<.1?'0.1% 미만':percent.toFixed(1)+'%')+' 감소';cell.append(change);}
        values.append(cell);
      }
      card.append(values);list.append(card);
    });
  }
  sort.onchange=draw;draw();return section;
}
