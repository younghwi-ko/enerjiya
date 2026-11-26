import test from 'node:test';
import assert from 'node:assert/strict';
import {extractResult, normalize, scenarios} from './lib/results.mjs';
test('extracts and normalizes Studio JSON without inventing missing fields',()=>{const raw=extractResult({output:[{content:[{text:'```json\n{"risk_level":"높음","affected_tanks":["TK-1"]}\n```'}]}]}); const result=normalize(raw); assert.equal(result.risk_level,'높음'); assert.deepEqual(result.affected_tanks,['TK-1']); assert.equal(result.severity,'확인 필요');});
test('rejects non-JSON output',()=>assert.throws(()=>extractResult({output:[{content:[{text:'not json'}]}]})));
test('four demo scenarios contain actionable information',()=>{assert.equal(Object.keys(scenarios).length,4);for(const result of Object.values(scenarios)){assert.ok(result.incident_type);assert.ok(result.immediate_actions.length);assert.ok(result.notification);}});
test('unwraps JSON containing a fenced JSON string',()=>{const inner='```json\n{"decision":"reference"}\n```';assert.deepEqual(extractResult({output:[{content:[{text:JSON.stringify(inner)}]}]}),{decision:'reference'});});
test('reference answer preserves the provided MNT-01 case and zero-valued impacts', async()=>{const {readFile}=await import('node:fs/promises');const reference=JSON.parse(await readFile(new URL('./lib/reference-mnt.json',import.meta.url),'utf8'));assert.equal(reference.case_id,'MNT-01');assert.deepEqual(reference.answer.targets,['T1']);assert.equal(reference.answer.impact.unshipped_delta_kl,0);assert.equal(reference.answer.scenario_summary.length,2);});
