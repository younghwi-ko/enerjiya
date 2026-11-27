export function scenarioValues(rows, key) {
  const scenarios = Array.isArray(rows) ? rows : [];
  return ['S0', 'S1'].map(id => scenarios.find(row => row && row.id === id)?.[key]);
}
export function normalize(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const pick = (...keys) => keys.map(k => source[k]).find(v => v !== undefined && v !== null && v !== '');
  const str = v => typeof v === 'string' || typeof v === 'number' ? String(v) : '확인 필요';
  const list = v => Array.isArray(v) ? v.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)) : v ? [typeof v === 'object' ? JSON.stringify(v) : String(v)] : [];
  // Keep {location, content, impact} objects so the List component can render them readably.
  const items = v => (Array.isArray(v) ? v : v ? [v] : []).filter(x => x !== null && x !== undefined).map(x => typeof x === 'object' ? x : String(x));
  return { incident_type:str(pick('incident_type','accident_type','사고 유형')), severity:str(pick('severity','심각도')), risk_level:str(pick('risk_level','risk_grade','위험 등급')), affected_tanks:list(pick('affected_tanks','tanks','영향 탱크')), impact_scope:str(pick('impact_scope','영향 범위')), evidence:items(pick('evidence','evidence_summary','핵심 근거')), immediate_actions:items(pick('immediate_actions','actions','즉시 조치')), inspections:items(pick('inspections','inspection_recommendations','점검 권고')), department:str(pick('department','responsible_department','담당 부서')), notification:str(pick('notification','notification_draft','담당자 알림안')) };
}
function parseJson(text) {
  let value = text;
  for (let i = 0; i < 4 && typeof value === 'string'; i++) {
    const input = value.trim();
    try { value = JSON.parse(input); continue; } catch { /* The workflow may include explanatory text around JSON. */ }
    const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!fenced) throw new Error('JSON not found');
    value = JSON.parse(fenced[1]);
  }
  return value;
}
export function getOutputText(job) {
  const text = job.output_text || (Array.isArray(job.output) ? job.output : []).flatMap(output => Array.isArray(output?.content) ? output.content : []).map(content => content?.text).find(value => typeof value === 'string' && value.trim());
  if (typeof text !== 'string') return '';
  try { const parsed = JSON.parse(text); return typeof parsed === 'string' ? parsed : text; } catch { return text; }
}
export function extractResult(job) {
  if (typeof job.output_text === 'string') {
    try { return parseJson(job.output_text); } catch { /* Try structured output. */ }
  }
  for (const output of Array.isArray(job.output) ? job.output : []) for (const content of Array.isArray(output?.content) ? output.content : []) if (typeof content?.text === 'string') {
    let text = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return parseJson(text); } catch { /* Try another output. */ }
  }
  const text = getOutputText(job);
  if (text.trim()) return text;
  throw new Error('Studio에서 표시할 결과를 반환하지 않았습니다.');
}
// Banner colour for a risk level. Low/none is checked first so "위험 낮음" is not shown as danger,
// and "중위험" is caution rather than danger.
export function riskTone(level) {
  const text = typeof level === 'string' ? level.trim() : '';
  if (!text || /낮|없|low|minor|none/i.test(text)) return 'neutral';
  if (/중대|고위험|높|심각|high|critical|severe/i.test(text)) return 'danger';
  if (/중위험|중간|보통|주의|medium|moderate|(^|\s)중(\s|$)/i.test(text)) return 'caution';
  if (/위험|danger/i.test(text)) return 'danger';
  return 'neutral';
}
