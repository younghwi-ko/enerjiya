export function reviewNotice(checks) {
  if (!Array.isArray(checks) || !checks.length) return null;
  const text = item => typeof item === 'string' ? item : item && typeof item === 'object' ? [item.location, item.content, item.impact].filter(value => typeof value === 'string' && value.trim()).join(' · ') : '';
  const messages = checks.map(text).filter(Boolean);
  if (!messages.length) return null;
  return { count: messages.length, message: messages.find(value => /재확인|재검산|재검토|오류|불일치/.test(value)) || messages[0] };
}
export function normalize(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const pick = (...keys) => keys.map(k => source[k]).find(v => v !== undefined && v !== null && v !== '');
  const str = v => typeof v === 'string' || typeof v === 'number' ? String(v) : '확인 필요';
  const list = v => Array.isArray(v) ? v.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)) : v ? [typeof v === 'object' ? JSON.stringify(v) : String(v)] : [];
  return { incident_type:str(pick('incident_type','accident_type','사고 유형')), severity:str(pick('severity','심각도')), risk_level:str(pick('risk_level','risk_grade','위험 등급')), affected_tanks:list(pick('affected_tanks','tanks','영향 탱크')), impact_scope:str(pick('impact_scope','영향 범위')), evidence:list(pick('evidence','evidence_summary','핵심 근거')), immediate_actions:list(pick('immediate_actions','actions','즉시 조치')), inspections:list(pick('inspections','inspection_recommendations','점검 권고')), department:str(pick('department','responsible_department','담당 부서')), notification:str(pick('notification','notification_draft','담당자 알림안')) };
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
  const text = job.output_text || (job.output || []).flatMap(output => output.content || []).map(content => content.text).find(value => typeof value === 'string' && value.trim());
  if (typeof text !== 'string') return '';
  try { const parsed = JSON.parse(text); return typeof parsed === 'string' ? parsed : text; } catch { return text; }
}
export function extractResult(job) {
  if (typeof job.output_text === 'string') {
    try { return parseJson(job.output_text); } catch { /* Try structured output. */ }
  }
  for (const output of job.output || []) for (const content of output.content || []) if (typeof content.text === 'string') {
    let text = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return parseJson(text); } catch { /* Try another output. */ }
  }
  const text = getOutputText(job);
  if (text.trim()) return text;
  throw new Error('Studio에서 표시할 결과를 반환하지 않았습니다.');
}


