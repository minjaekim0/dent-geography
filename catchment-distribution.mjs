// Smooth the empirical (probability, full grid population) distribution.
// y is people per percentage point. Trapezoid integration over 0..100%
// preserves the population, including observations near 0% and 100%.
export function probabilityDensity(observations,{points=401,bandwidth=.01}={}){
  if(points<2||!(bandwidth>0))throw Error('Invalid density settings');
  const y=new Array(points).fill(0),step=1/(points-1);
  for(const [p,count] of observations){
    if(!(p>0&&p<=1&&count>=0&&Number.isFinite(count)))continue;
    const lo=Math.max(0,Math.floor((p-4*bandwidth)/step)),hi=Math.min(points-1,Math.ceil((p+4*bandwidth)/step));
    const kernel=[];let integral=0;
    for(let i=lo;i<=hi;i++){
      const value=Math.exp(-.5*((i*step-p)/bandwidth)**2);kernel.push(value);
      integral+=value*step*(i===0||i===points-1?.5:1);
    }
    for(let i=lo;i<=hi;i++)y[i]+=count*kernel[i-lo]/integral/100;
  }
  return y;
}

export const expectedPopulation=observations=>observations.reduce((sum,[p,n])=>sum+(p>0&&p<=1&&Number.isFinite(n)&&n>=0?p*n:0),0);
