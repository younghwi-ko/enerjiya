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
test('rounded daily values are not flagged, a real mismatch still is',()=>{
 const ship=[],close=[];let stock=5000;
 for(let i=0;i<14;i++){const out=333.333+i*0.004;stock-=out;ship.push(Math.round(out*100)/100);close.push(Math.round(stock*100)/100);}
 assert.deepEqual(verifyInventory({tank_close_kl:{T1:close,T2:close.map(v=>v+1000)},tank_ship_kl:{T1:ship,T2:ship}}),[]);
 const broken=[...close];broken[5]+=5;
 assert.deepEqual(verifyInventory({tank_close_kl:{T1:broken},tank_ship_kl:{T1:ship}}),[6,7]);
});
