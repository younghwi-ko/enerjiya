const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const keys = ['warning_delta','unshipped_delta_kl','overflow_risk_day_delta','affected_order_delta','loss_delta_krw'];
export const cleanText = value => typeof value === 'string' ? value.replace(/\b(?:null|undefined)\b/g,'미산정').replace(/(\d)\s+일차/g,'$1일차').replace(/\(\s+/g,'(').replace(/\s+\)/g,')') : '';
export function isNoImpact(data) {
 const rows = Array.isArray(data?.scenario_summary) ? data.scenario_summary : [];
 const s0=rows.find(row=>row?.id==='S0'), s1=rows.find(row=>row?.id==='S1');
 const metrics=['warning_count','unshipped_kl','overflow_risk_day_count','affected_order_count','loss_krw'];
 return s0?.computed===true && s1?.computed===true && keys.every(key=>number(data?.impact?.[key])===0) && metrics.every(key=>number(s0[key])===null || number(s1[key])===null || number(s0[key])===number(s1[key]));
}
export function dayRange(value) {
 if (typeof value !== 'string') return null;
 const text=value.split('/')[0];
 const compact=text.match(/(?<![\d:])(\d+)\s*[~～-]\s*(\d+)\s*일차/);
 if (compact) { const start=Number(compact[1]),end=Number(compact[2]); return start>=1 && end>=start && end<=14 ? {start,end} : null; }
 const times=[...text.matchAll(/(\d+)\s*일차(?:\s*(\d{1,2}):(\d{2}))?/g)];
 if (times.length<2) return null;
 const start=Number(times[0][1]);
 const qc=text.match(/QC[^\d]*(\d+)\s*일차\s*(\d{1,2}):(\d{2})/i);
 const last=times[times.length-1];
 const qcDay=qc ? Number(qc[1]) : times.length>=3 ? Number(last[1]) : null;
 const midnight=qc ? qc[2]==='00' && qc[3]==='00' : times.length>=3 && last[2]==='00' && last[3]==='00';
 const end=qcDay!==null ? qcDay-(midnight?1:0) : Number(times[1][1]);
 return start>=1 && end>=start && end<=14 ? {start,end} : null;
}
export function verifyInventory(table) {
 const close=table?.tank_close_kl, ship=table?.tank_ship_kl;
 if (!close || !ship || typeof close!=='object' || typeof ship!=='object' || Array.isArray(close) || Array.isArray(ship)) return null;
 const tanks=Object.keys(close);
 if (!tanks.length || tanks.length!==Object.keys(ship).length || tanks.some(t=>!Array.isArray(close[t]) || !Array.isArray(ship[t]))) return null;
 const values=[];
 for(let i=1;i<14;i++) {
  const amounts=tanks.map(t=>[number(close[t][i]),number(close[t][i-1]),number(ship[t][i])]);
  if(amounts.some(row=>row.includes(null))) return null;
  values.push({day:i+1,value:amounts.reduce((sum,[now,previous,out])=>sum+now-previous+out,0)});
 }
 const sorted=values.map(x=>x.value).sort((a,b)=>a-b), median=sorted[Math.floor(sorted.length/2)];
 return values.filter(x=>Math.abs(x.value-median)>Math.max(Math.abs(median)*0.01,1e-9)).map(x=>x.day);
}
export function outageEvidence(data) {
 const event=data?.scenario_summary?.find?.(row=>row?.id==='S1'), range=dayRange(event?.outage), table=data?.recommended_tank_table;
 const close=table?.tank_close_kl, ship=table?.tank_ship_kl, targets=Array.isArray(data?.targets)?data.targets:[];
 if(!range || !targets.length || !close || !ship || typeof close!=='object' || typeof ship!=='object' || Array.isArray(ship)) return null;
 const tanks=Object.keys(ship), remaining=tanks.filter(t=>!targets.includes(t));
 if(!remaining.length || targets.some(t=>!tanks.includes(t)) || tanks.some(t=>!Array.isArray(ship[t]))) return null;
 const days=Array.from({length:range.end-range.start+1},(_,i)=>range.start+i);
 const amounts=days.map(day=>tanks.map(t=>number(ship[t][day-1])));
 const allKnown=amounts.every(row=>!row.includes(null));
 let daily=null, breakdown=null;
 if(allKnown && targets.every(t=>days.every(day=>number(ship[t][day-1])===0))) {
  const totals=amounts.map(row=>row.reduce((a,b)=>a+b,0));
  if(totals.every(value=>Math.abs(value-totals[0])<0.005)) daily=totals[0];
  if(daily!==null && remaining.every(t=>days.every(day=>Math.abs(number(ship[t][day-1])-number(ship[t][days[0]-1]))<0.005))) breakdown=remaining.map(t=>({tank:t,value:ship[t][days[0]-1]}));
 }
 let maximum=null;
 if(remaining.every(t=>Array.isArray(close[t]) && days.every(day=>number(close[t][day-1])!==null))) for(const tank of remaining) for(const day of days){const value=close[tank][day-1];if(!maximum || value>maximum.value)maximum={tank,day,value};}
 return {range,daily,breakdown,maximum};
}
export function orderEvidence(data) {
 const orders=Array.isArray(data?.affected_orders) ? data.affected_orders.filter(x=>x?.scenario==='S1') : [];
 const daily=new Map(), refs=new Set();
 for(const order of orders){if(typeof order.ref==='string' && order.ref)refs.add(order.ref);const day=number(order.day), amount=number(order.day_unshipped_kl);if(day!==null && amount!==null)daily.set(day,(daily.get(day)||0)+amount);}
 return {days:[...daily].sort((a,b)=>a[0]-b[0]).map(([day,value])=>({day,value})),refs:[...refs]};
}
export function lossEvidence(data) {
 const quantity=number(data?.impact?.unshipped_delta_kl);
 if(quantity===null || quantity<=0) return null;
 const direct=number(data?.unit_price_krw_kl);
 const reports=Array.isArray(data?.team_reports) ? data.team_reports.filter(r=>r?.role==='B팀' && typeof r.message==='string') : [];
 const matches=reports.flatMap(r=>[...r.message.matchAll(/([\d,]+(?:\.\d+)?)\s*원\s*\/\s*kL/gi)].map(x=>Number(x[1].replace(/,/g,''))).filter(Number.isFinite));
 const unique=[...new Set(matches)];
 const price=direct!==null ? direct : unique.length===1 ? unique[0] : null;
 if(price===null || price<0) return null;
 return {quantity,price,estimate:quantity*price};
}
