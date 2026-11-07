export function linearProbabilityAxis(groups=[]){
  const tailShares=groups.map(observations=>{
    let total=0,tail=0;
    for(const [p,n] of observations)if(p>0&&p<=1&&n>0&&Number.isFinite(n)){total+=n;if(p>.25)tail+=n;}
    return total?tail/total:0;
  });
  const maximum=tailShares.some(share=>share>=.01)?1:.25;
  return {
    minimum:0,maximum,tailShares,ticks:maximum===1?[0,.25,.5,.75,1]:[0,.05,.1,.15,.2,.25],
    position:p=>Math.max(0,Math.min(maximum,p))/maximum,
    probability:t=>Math.max(0,Math.min(1,t))*maximum,
  };
}
export function densityAt(values,p){
  const index=Math.max(0,Math.min(values.length-1,p*(values.length-1))),a=Math.floor(index),b=Math.min(values.length-1,a+1);
  return values[a]+(values[b]-values[a])*(index-a);
}
export function formatProbability(p){
  if(p===0)return '0%';
  const percent=p*100;
  return (percent<.0001?percent.toExponential(0):percent.toLocaleString('ko-KR',{maximumSignificantDigits:3}))+'%';
}
