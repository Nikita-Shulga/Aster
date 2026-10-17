'use strict';
// CPU usage is a difference between two observations of the same process instance.
function samplePerformance(previous,current,{cores=1}={}) {
 const elapsed=(Date.parse(current.collectedAt)-Date.parse(previous?.collectedAt))/1000;
 const comparable=Number.isFinite(elapsed)&&elapsed>=0.25&&elapsed<=120&&Number.isInteger(cores)&&cores>0;
 const prior=new Map((previous?.items||[]).map(p=>[p.id,p]));
 let measured=0,total=0;
 const items=current.items.map(p=>{
  const before=prior.get(p.id);let cpuPercent=null;
  if(comparable&&before&&p.startedAt&&p.startedAt===before.startedAt&&p.name===before.name&&Number.isFinite(p.cpuSeconds)&&Number.isFinite(before.cpuSeconds)){
   const delta=p.cpuSeconds-before.cpuSeconds;
   if(delta>=0&&delta<=elapsed*cores*1.15){cpuPercent=Math.min(100,delta/elapsed/cores*100);total+=cpuPercent;measured++;}
  }
  return {...p,cpuPercent};
 });
 return {...current,items,sampleSeconds:comparable?elapsed:null,cpuPercent:measured?Math.min(100,total):null,measuredProcesses:measured,cpuCoverage:'Observed processes only; exited, inaccessible and newly started processes are excluded.'};
}
module.exports={samplePerformance};
