import {createAdminHistory,createRegionLabeler} from './admin-history-model.mjs?v=admin-1';
// Display aliases only. Never mutate the dental calculation keys or statistics.
try{
  const response=await fetch('data/admin-history.json?v=admin-1');if(!response.ok)throw Error(response.status);
  window.adminDisplayName=createRegionLabeler(createAdminHistory(await response.json()));
  window.refreshAdministrativeNames?.();
}catch(error){
  // The original source names remain usable if the independent registry fails.
  const link=document.querySelector('a[href="admin-history.html"]');
  if(link)link.title='변경 명칭을 불러오지 못했습니다. 원자료 명칭으로 표시합니다.';
}
