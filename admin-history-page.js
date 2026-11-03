const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{
  const response=await fetch('data/admin-history.json?v=incheon-full-3');if(!response.ok)throw Error(response.status);
  const data=await response.json(),query=document.querySelector('#history-query');
  function render(){
    const q=query.value.trim();let total=0;
    document.querySelector('#history-events').innerHTML=data.events.map(e=>{
      const rows=e.pairs.filter(p=>!q||[p.before,p.after,p.beforeName,p.afterName,e.title].some(v=>v.includes(q)));
      const names=(e.names||[]).filter(p=>!q||p.some(v=>v.includes(q)));
      const splits=(e.splits||[]).filter(p=>!q||[p.before,p.beforeName,...p.after.flatMap(a=>[a.code,a.name])].some(v=>v.includes(q)));
      const held=(e.unlinkedBoundaryChanges||[]).filter(p=>!q||[p.before,p.after,p.beforeName,p.afterName].some(v=>v.includes(q)));
      const extra=splits.map(p=>`<tr><td>${esc(p.beforeName)}<br><small>${p.before}</small></td><td>${p.after.map(a=>`${esc(a.name)} <small>${a.code}</small>`).join('<br>')}<br><small>분할 · 옛 구 전체 통계는 새 구에 임의 배정하지 않음</small></td></tr>`).join('')+held.map(p=>`<tr><td>${esc(p.beforeName)}<br><small>${p.before}</small></td><td>${esc(p.afterName)} <small>${p.after}</small><br><small>경계 차이 확인 · 통계 연결 보류</small></td></tr>`).join('');
      total+=rows.length+names.length+splits.length+held.length;if(!rows.length&&!names.length&&!extra)return '';
      return `<details ${q?'open':''}><summary>${esc(e.effective)} · ${esc(e.title)} (${rows.length+names.length+splits.length+held.length}건)</summary><p><a href="${esc(e.source)}" target="_blank" rel="noopener">공식 변경 근거</a></p><div style="overflow:auto"><table><thead><tr><th>변경 전</th><th>변경 후</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.beforeName)}<br><small>${p.before}</small></td><td>${esc(p.afterName)}<br><small>${p.after}</small></td></tr>`).join('')}${names.map(p=>`<tr><td>${esc(p[0])}</td><td>${esc(p[1])} (시군구 명칭 연결)</td></tr>`).join('')}${extra}</tbody></table></div></details>`;
    }).join('');
    document.querySelector('#history-status').textContent=`${total.toLocaleString()}건 · 검토일 ${data.reviewedAt}`;
  }
  query.oninput=render;render();
}catch(error){document.querySelector('#history-status').textContent='변경 내역을 불러오지 못했습니다. 새로고침해 주세요.';}
