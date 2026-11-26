import test from 'node:test';
import assert from 'node:assert/strict';
import {extractResult, normalize} from './lib/results.mjs';
test('extracts and normalizes Studio JSON without inventing missing fields',()=>{const raw=extractResult({output:[{content:[{text:'```json\n{"risk_level":"높음","affected_tanks":["TK-1"]}\n```'}]}]}); const result=normalize(raw); assert.equal(result.risk_level,'높음'); assert.deepEqual(result.affected_tanks,['TK-1']); assert.equal(result.severity,'확인 필요');});
test('preserves non-JSON Studio output and rejects empty results',()=>{assert.equal(extractResult({output:[{content:[{text:'not json'}]}]}),'not json');assert.throws(()=>extractResult({output:[]}));});
test('unwraps JSON containing a fenced JSON string',()=>{const inner='```json\n{"decision":"reference"}\n```';assert.deepEqual(extractResult({output:[{content:[{text:JSON.stringify(inner)}]}]}),{decision:'reference'});});
