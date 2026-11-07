// One filled outline: the shaft stops at the head base instead of covering
// the arrow tip with its round stroke cap.
export function inflowArrow(start,target,width,side=1){
  const dx=target.x-start.x,dy=target.y-start.y,length=Math.hypot(dx,dy);
  if(!Number.isFinite(length)||!Number.isFinite(width)||width<=0||length<=46)return null;
  const ux=dx/length,uy=dy/length,tip={x:target.x-ux*30,y:target.y-uy*30};
  const bend=side*Math.min(36,length*.13),control={x:(start.x+tip.x)/2-uy*bend,y:(start.y+tip.y)/2+ux*bend};
  const points=Array.from({length:49},(_,i)=>{
    const t=i/48,s=1-t;
    return {x:s*s*start.x+2*s*t*control.x+t*t*tip.x,y:s*s*start.y+2*s*t*control.y+t*t*tip.y,t};
  });
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
  const total=lengths.at(-1),headLength=Math.min(Math.max(9,width*1.8),total*.45),bodyLength=total-headLength;
  let i=1;while(lengths[i]<bodyLength)i++;
  const f=(bodyLength-lengths[i-1])/(lengths[i]-lengths[i-1]),a=points[i-1],b=points[i];
  const base={x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,t:a.t+(b.t-a.t)*f};
  const headDistance=Math.hypot(tip.x-base.x,tip.y-base.y),hx=(tip.x-base.x)/headDistance,hy=(tip.y-base.y)/headDistance;
  const body=[...points.slice(0,i),base],left=[],right=[];
  for(let j=0;j<body.length;j++){
    const p=body[j],tx=(1-p.t)*(control.x-start.x)+p.t*(tip.x-control.x),ty=(1-p.t)*(control.y-start.y)+p.t*(tip.y-control.y),l=Math.hypot(tx,ty);
    const nx=j===body.length-1?-hy:-ty/l,ny=j===body.length-1?hx:tx/l;
    left.push({x:p.x+nx*width/2,y:p.y+ny*width/2});right.push({x:p.x-nx*width/2,y:p.y-ny*width/2});
  }
  const headHalfWidth=width*.9+2;
  return {outline:[...left,{x:base.x-hy*headHalfWidth,y:base.y+hx*headHalfWidth},tip,{x:base.x+hy*headHalfWidth,y:base.y-hx*headHalfWidth},...right.reverse()],tip,base};
}
