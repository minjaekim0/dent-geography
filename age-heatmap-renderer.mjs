let metadata;
export function loadAgeMetadata(){
  if(!metadata)metadata=fetch(new URL('data/sgis-age/manifest.json',import.meta.url)).then(response=>{
    if(!response.ok)throw Error('연령 인구 자료를 불러오지 못했습니다.');return response.json();
  }).catch(error=>{metadata=null;throw error;});
  return metadata;
}
/** Lazily created; total-population maps never start this worker or fetch age data. */
export class AgeHeatRenderer {
  constructor(){this.serial=0;this.pending=new Map();}
  cancel(){
    const id=++this.serial;
    for(const {reject} of this.pending.values())reject(Object.assign(Error('선택 변경'),{name:'AbortError'}));
    this.pending.clear();this.worker?.postMessage({type:'cancel',id});
  }
  render(request){
    this.cancel();
    if(!this.worker){
      this.worker=new Worker(new URL('age-heatmap-worker.mjs?v=rose-1',import.meta.url),{type:'module'});
      this.worker.onmessage=({data})=>{
        const pending=this.pending.get(data.id);
        if(!pending){data.bitmap?.close();return;}
        this.pending.delete(data.id);if(data.error)pending.reject(Error(data.error));else pending.resolve(data);
      };
      this.worker.onerror=()=>{
        for(const {reject} of this.pending.values())reject(Error('연령 지도 계산에 실패했습니다. 다시 선택해 주세요.'));
        this.pending.clear();this.worker.terminate();this.worker=null;
      };
    }
    const id=this.serial;
    return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({...request,id});});
  }
}
