import test from 'node:test';
import assert from 'node:assert/strict';
import {extractResult, normalize, scenarioValues} from './lib/results.mjs';
test('compares only the returned scenario values, including zero and missing data',()=>{
 assert.deepEqual(scenarioValues([{id:'S1',unshipped_kl:12},{id:'S0',unshipped_kl:0}],'unshipped_kl'),[0,12]);
 assert.deepEqual(scenarioValues([{id:'S1',unshipped_kl:12}],'unshipped_kl'),[undefined,12]);
 assert.deepEqual(scenarioValues(null,'unshipped_kl'),[undefined,undefined]);
});
test('extracts and normalizes Studio JSON without inventing missing fields',()=>{const raw=extractResult({output:[{content:[{text:'```json\n{"risk_level":"높음","affected_tanks":["TK-1"]}\n```'}]}]}); const result=normalize(raw); assert.equal(result.risk_level,'높음'); assert.deepEqual(result.affected_tanks,['TK-1']); assert.equal(result.severity,'확인 필요');});
test('preserves non-JSON Studio output and rejects empty results',()=>{assert.equal(extractResult({output:[{content:[{text:'not json'}]}]}),'not json');assert.throws(()=>extractResult({output:[]}));});
test('unwraps JSON containing a fenced JSON string',()=>{const inner='```json\n{"decision":"reference"}\n```';assert.deepEqual(extractResult({output:[{content:[{text:JSON.stringify(inner)}]}]}),{decision:'reference'});});
test('parses Studio JSON inside a quoted response with a source preamble',()=>{const inner='근거 문서: 보고서\n```json\n{"event_type":"정비","impact":{"unshipped_delta_kl":532.57},"check_needed":[{"content":"검토"}]}\n```';const actual=extractResult({output:[{content:[{text:JSON.stringify(inner)}]}]});assert.equal(actual.event_type,'정비');assert.equal(actual.impact.unshipped_delta_kl,532.57);assert.equal(actual.check_needed[0].content,'검토');});
