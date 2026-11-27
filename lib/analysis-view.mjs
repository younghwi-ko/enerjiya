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
// Decimal places a returned value was rounded to (capped so float noise is not read as precision).
const decimals = value => { for (let places=0; places<6; places++) { const scaled=value*10**places; if (Math.abs(scaled-Math.round(scaled))<1e-6*Math.max(1,Math.abs(scaled))) return places; } return 6; };
export function verifyInventory(table) {
 const close=table?.tank_close_kl, ship=table?.tank_ship_kl;
 if (!close || !ship || typeof close!=='object' || typeof ship!=='object' || Array.isArray(close) || Array.isArray(ship)) return null;
 const tanks=Object.keys(close);
 if (!tanks.length || tanks.length!==Object.keys(ship).length || tanks.some(t=>!Array.isArray(close[t]) || !Array.isArray(ship[t]))) return null;
 const values=[]; let places=0;
 for(let i=1;i<14;i++) {
  const amounts=tanks.map(t=>[number(close[t][i]),number(close[t][i-1]),number(ship[t][i])]);
  if(amounts.some(row=>row.includes(null))) return null;
  for(const row of amounts) for(const value of row) places=Math.max(places,decimals(value));
  values.push({day:i+1,value:amounts.reduce((sum,[now,previous,out])=>sum+now-previous+out,0)});
 }
 // Each tank adds three rounded values (now - previous + out), each off by up to half a step.
 // Without this, rounding alone was flagged on days with near-zero inflow (1e-9 tolerance).
 const rounding=tanks.length*3*0.5*10**-places+1e-9;
 const sorted=values.map(x=>x.value).sort((a,b)=>a-b), median=sorted[Math.floor(sorted.length/2)];
 return values.filter(x=>Math.abs(x.value-median)>Math.max(Math.abs(median)*0.01,rounding)).map(x=>x.day);
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
// Same number format everywhere on the result screen: 2 decimals with thousands separators.
export const formatValue=(v,unit='')=>typeof v==='number' && Number.isFinite(v) ? `${v.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})}${unit ? ` ${unit}` : ''}` : '확인 필요';
const strings=list=>Array.isArray(list) ? list.filter(x=>typeof x==='string' && x) : [];
const summaryRow=(data,id)=>Array.isArray(data?.scenario_summary) ? data.scenario_summary.find(row=>row?.id===id) : undefined;
// Figure 2: what each tank was doing each day. Roles come only from returned targets, outage period and shipments.
export function tankRoles(data) {
 const ship=data?.recommended_tank_table?.tank_ship_kl;
 if(!ship || typeof ship!=='object' || Array.isArray(ship)) return {count:0,tanks:[]};
 const range=dayRange(summaryRow(data,'S1')?.outage), targets=strings(data?.targets);
 const rows=Object.entries(ship).filter(([,values])=>Array.isArray(values));
 const count=Math.max(0,...rows.map(([,values])=>values.length));
 const tanks=rows.map(([name,values])=>({name,cells:Array.from({length:count},(_,i)=>{const day=i+1,value=number(values[i]);const role=targets.includes(name) && range && day>=range.start && day<=range.end ? '사용 불가' : value===null ? '확인 필요' : value>0 ? '출하' : '대기';return {role,value};})}));
 return {count,tanks};
}
const span=(start,end)=>start===end ? `${start}일차` : `${start}~${end}일차`;
// "이 흐름이 나온 이유": each sentence points at a figure (1 stock, 2 tank roles, 3 shipping) and a day range.
// Only values already shown in the upper area are used, formatted with formatValue.
export function flowNotes(data) {
 const notes=[], range=dayRange(summaryRow(data,'S1')?.outage), targets=strings(data?.targets), evidence=outageEvidence(data);
 const ship=data?.recommended_tank_table?.tank_ship_kl, orders=orderEvidence(data), impact=data?.impact||{};
 const s1Unshipped=number(summaryRow(data,'S1')?.unshipped_kl), unshippedDelta=number(impact.unshipped_delta_kl);
 if(range && targets.length) {
  const stopped=ship && typeof ship==='object' && targets.every(t=>Array.isArray(ship[t]) && Array.from({length:range.end-range.start+1},(_,i)=>number(ship[t][range.start-1+i])).every(v=>v===0));
  notes.push({text:stopped ? `${targets.join('·')}을(를) ${span(range.start,range.end)}에 쓸 수 없어 이 기간 출하량이 0이다.` : `${targets.join('·')}의 사용 불가 기간은 ${span(range.start,range.end)}이다.`,figure:2,range});
 }
 if(evidence?.daily!=null) notes.push({text:`같은 기간 남은 탱크가 하루 ${formatValue(evidence.daily,'kL')}를 출하했다${evidence.breakdown ? ` (${evidence.breakdown.map(x=>`${x.tank} ${formatValue(x.value,'kL')}`).join(' + ')})` : ''}.`,figure:3,range:evidence.range});
 if(evidence?.maximum) notes.push({text:`그 사이 남은 탱크의 기말 재고는 ${evidence.maximum.tank} ${evidence.maximum.day}일차 ${formatValue(evidence.maximum.value,'kL')}가 가장 높았다.`,figure:1,range:{start:evidence.maximum.day,end:evidence.maximum.day}});
 if(orders.days.length) { const first=orders.days[0].day,last=orders.days[orders.days.length-1].day; notes.push({text:`남은 탱크 출하로 주문량을 다 채우지 못해 ${orders.days.map(x=>`${x.day}일차 ${formatValue(x.value,'kL')}`).join(', ')}의 주문 미출하가 생겼다.`,figure:3,range:{start:first,end:last}}); }
 else if(s1Unshipped===0) notes.push({text:'남은 탱크가 요청량을 모두 출하해 주문 미출하가 생기지 않았다.',figure:3,range});
 if(isNoImpact(data)) notes.push({text:'그래서 기준안(S0)과 사건안(S1)의 영향 지표 5개 증감이 모두 0이다.',figure:3,range});
 else if(unshippedDelta!==null && unshippedDelta>0) notes.push({text:`이 미출하 때문에 기준안 대비 미출하가 ${formatValue(unshippedDelta,'kL')} 늘었다.`,figure:3,range});
 return notes.slice(0,6);
}
export const METRICS=[['미출하','unshipped_delta_kl','unshipped_kl','kL'],['손실','loss_delta_krw','loss_krw','원'],['영향 주문','affected_order_delta','affected_order_count','건'],['넘침 위험일','overflow_risk_day_delta','overflow_risk_day_count','일'],['경고','warning_delta','warning_count','건']];
// One line per metric card: "{지표}: {S0} → {S1}, 이유 — {원인}".
export function metricNotes(data) {
 const s0=summaryRow(data,'S0')||{}, s1=summaryRow(data,'S1')||{}, range=dayRange(s1?.outage), evidence=outageEvidence(data), refs=orderEvidence(data).refs;
 const unshippedSame=number(s0.unshipped_kl)!==null && number(s0.unshipped_kl)===number(s1.unshipped_kl);
 return METRICS.map(([label,,key,unit])=>{
  const a=number(s0[key]), b=number(s1[key]); let cause='Studio 값 확인 필요', figure=3;
  if(a!==null && b!==null) {
   if(key==='unshipped_kl') cause=b===0 ? '남은 탱크가 요청량을 모두 출하' : b>a ? '사용 불가 기간에 남은 탱크 출하로 주문량을 다 채우지 못함' : b===a ? '기준안과 같은 출하 결과' : '사건안의 출하 조정 결과';
   else if(key==='loss_krw') cause=b===a ? (unshippedSame ? '미출하가 같아 손실도 같음' : '손실 변화 없음, Studio 산정 기준 확인') : b>a ? '미출하 증가분이 손실로 반영' : 'Studio 손실 산정 기준 확인 필요';
   else if(key==='affected_order_count') cause=b===a ? '미출하가 생긴 주문 수가 같음' : b>a ? `미출하가 생긴 주문${refs.length ? ` ${refs.join('·')}` : ''}` : '미출하 주문 감소';
   else if(key==='overflow_risk_day_count') { figure=1; cause=b===a ? '사용 불가 기간에도 남은 탱크 재고가 넘침 기준을 새로 넘지 않음' : b>a ? `사용 불가 기간에 남은 탱크 재고가 올라감${evidence?.maximum ? ` (최대 ${evidence.maximum.tank} ${evidence.maximum.day}일차 ${formatValue(evidence.maximum.value,'kL')})` : ''}` : '남은 탱크 재고 부담 감소'; }
   else if(key==='warning_count') { figure=1; cause=b===a ? '새로 생긴 경고 조건 없음' : b>a ? '사건안에서 경고 조건이 늘어남, Studio 경고 내역 확인 필요' : '경고 조건 감소'; }
  }
  return {key,text:`${label}: ${formatValue(a,unit)} → ${formatValue(b,unit)}, 이유 — ${cause}`,figure,range};
 });
}
// 팀별 의미: one short line per team, A→D order.
export function teamLines(data) {
 const reports=Array.isArray(data?.team_reports) ? data.team_reports.filter(r=>r && typeof r==='object') : [];
 return reports.map(r=>{let text=cleanText(r.message);if(r.role==='D팀')text=text.replace(/대체 출하/g,'정비 기간 출하량');const first=text.split(/(?<=[.!?。])\s+|\n/).find(x=>x.trim())||'';return {role:typeof r.role==='string' && r.role ? r.role : '담당 팀 확인 필요',text:first.length>90 ? `${first.slice(0,89)}…` : first || '확인 필요'};}).sort((a,b)=>a.role.localeCompare(b.role,'ko'));
}
