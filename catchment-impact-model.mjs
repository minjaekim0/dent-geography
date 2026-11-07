export const topImpacts=(rows,key='population')=>[...rows].sort((a,b)=>b[key].loss-a[key].loss||a.distance-b.distance).slice(0,5);
