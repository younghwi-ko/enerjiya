import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanText, dayRange, isNoImpact, lossEvidence, outageEvidence, orderEvidence, verifyInventory} from './lib/analysis-view.mjs';

test('zero impact requires both completed scenarios and all five numeric zeros',()=>{
 const data={scenario_summary:[{id:'S0',computed:true},{id:'S1',computed:true}],impact:{warning_delta:0,unshipped_delta_kl:0,overflow_risk_day_delta:0,affected_order_delta:0,loss_delta_krw:0}};
 assert.equal(isNoImpact(data),true);
 assert.equal(isNoImpact({...data,impact:{...data.impact,loss_delta_krw:null}}),false);
 assert.equal(isNoImpact({...data,scenario_summary:[{id:'S0',computed:true},{id:'S1',computed:false}]}),false);
 assert.equal(isNoImpact({...data,scenario_summary:[{id:'S0',computed:true,unshipped_kl:0},{id:'S1',computed:true,unshipped_kl:2}]}),false);
});
test('parses outage and QC times without creating an extra day',()=>{
 assert.deepEqual(dayRange('T1 2일차 00:00 ~ 7일차 00:00, QC 8일차 00:00까지'),{start:2,end:7});
 assert.deepEqual(dayRange('2일차 00:00 ~ 7일차 00:00~8일차 00:00일차'),{start:2,end:7});
 assert.deepEqual(dayRange('4~7일차'),{start:4,end:7});
 assert.equal(dayRange('기간 미상'),null);
 assert.equal(cleanText('( 1 일차 )'),' (1일차)'.trim());
});
test('calculates inflow outliers only when every tank and day is present',()=>{
 const close=Array(14).fill(100), ship=Array(14).fill(10);close[2]=130;
 const result=verifyInventory({tank_close_kl:{T1:close},tank_ship_kl:{T1:ship}});
 assert.deepEqual(result,[3,4]);
 assert.equal(verifyInventory({tank_close_kl:{T1:[1,2]},tank_ship_kl:{T1:[1,2]}}),null);
});
test('only describes daily shipments when stopped tanks are zero and amounts are known',()=>{
 const data={targets:['T1'],scenario_summary:[{id:'S1',outage:'T1 2일차 00:00 ~ 7일차 00:00, QC 8일차 00:00'}],recommended_tank_table:{tank_ship_kl:{T1:Array(14).fill(0),T2:Array(14).fill(448),T3:Array(14).fill(266.29)},tank_close_kl:{T1:Array(14).fill(1),T2:Array(14).fill(100),T3:Array(14).fill(200)}}};
 const evidence=outageEvidence(data);assert.ok(Math.abs(evidence.daily-714.29)<0.001);assert.equal(evidence.maximum.tank,'T3');
 data.recommended_tank_table.tank_ship_kl.T1[2]=10;assert.equal(outageEvidence(data).daily,null);
});
test('orders aggregate only numeric incident scenario entries',()=>{
 assert.deepEqual(orderEvidence({affected_orders:[{scenario:'S1',day:4,ref:'A',day_unshipped_kl:2},{scenario:'S0',day:4,ref:'B',day_unshipped_kl:10}]}),{days:[{day:4,value:2}],refs:['A']});
});
test('loss conversion requires an unambiguous returned price',()=>{
 assert.deepEqual(lossEvidence({impact:{unshipped_delta_kl:2},team_reports:[{role:'B팀',message:'단가 882,000원/kL'}]}),{quantity:2,price:882000,estimate:1764000});
 assert.equal(lossEvidence({impact:{unshipped_delta_kl:2},team_reports:[{role:'B팀',message:'단가 1원/kL 또는 2원/kL'}]}),null);
 assert.equal(lossEvidence({impact:{unshipped_delta_kl:2}}),null);
});
import {flowNotes,metricNotes,tankRoles,teamLines,formatValue} from './lib/analysis-view.mjs';
const sample=()=>({targets:['T1'],event_type:'정비',scenario_summary:[{id:'S0',computed:true,unshipped_kl:0,loss_krw:0,affected_order_count:0,overflow_risk_day_count:0,warning_count:0},{id:'S1',computed:true,outage:'T1 2일차 00:00 ~ 7일차 00:00, QC 8일차 00:00',unshipped_kl:0,loss_krw:0,affected_order_count:0,overflow_risk_day_count:0,warning_count:0}],impact:{warning_delta:0,unshipped_delta_kl:0,overflow_risk_day_delta:0,affected_order_delta:0,loss_delta_krw:0},recommended_tank_table:{tank_ship_kl:{T1:[100,0,0,0,0,0,0,100],T2:[200,448,448,448,448,448,448,200],T3:[0,266.29,266.29,266.29,266.29,266.29,266.29,0]},tank_close_kl:{T1:Array(8).fill(1),T2:Array(8).fill(100),T3:Array(8).fill(200)}}});
test('flow notes cite a figure and day range and reuse displayed values',()=>{
 const notes=flowNotes(sample());
 assert.ok(notes.length>=4 && notes.length<=6);
 assert.ok(notes.every(n=>[1,2,3].includes(n.figure) && n.range && n.range.start<=n.range.end));
 assert.match(notes[0].text,/2~7일차에 쓸 수 없어/);
 assert.ok(notes.some(n=>n.text.includes(formatValue(714.29,'kL'))));
 assert.ok(notes.some(n=>n.text.includes('요청량을 모두 출하')));
});
test('metric notes explain S0 to S1, including why unshipped is zero',()=>{
 const notes=metricNotes(sample());
 assert.equal(notes.length,5);
 assert.equal(notes[0].text,'미출하: 0.00 kL → 0.00 kL, 이유 — 남은 탱크가 요청량을 모두 출하');
 const changed=sample();changed.scenario_summary[1].unshipped_kl=12.5;
 assert.match(metricNotes(changed)[0].text,/0\.00 kL → 12\.50 kL, 이유 — 사용 불가 기간/);
});
test('tank roles mark the outage target and idle tanks',()=>{
 const roles=tankRoles(sample());
 assert.equal(roles.tanks[0].cells[2].role,'사용 불가');
 assert.equal(roles.tanks[0].cells[0].role,'출하');
 assert.equal(roles.tanks[2].cells[0].role,'대기');
});
test('team lines are one short line per team and keep empty messages as 확인 필요',()=>{
 const lines=teamLines({team_reports:[{role:'D팀',message:'대체 출하 확인. 두 번째 문장.'},{role:'A팀',message:''},null]});
 assert.deepEqual(lines,[{role:'A팀',text:'확인 필요'},{role:'D팀',text:'정비 기간 출하량 확인.'}]);
});
