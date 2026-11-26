export const scenarios = {
  'EQK-01': { incident_type:'지진에 따른 저장탱크 설비 이상', severity:'높음', risk_level:'위험', affected_tanks:['TK-101','TK-102'], impact_scope:'탱크 기초 및 연결 배관의 누출 가능성', evidence:['지진 발생 후 탱크 주변 진동 및 배관 변형 보고','인접 탱크 연결부의 누출 여부 확인 필요'], immediate_actions:['해당 구역 출입을 통제하고 운전을 안전 상태로 전환','탱크 및 배관 연결부 누출 여부를 현장 확인'], inspections:['탱크 기초 침하와 외벽 변형 점검','계측값 및 긴급 차단 설비 기능 확인'], department:'운영팀 · 설비보전팀 · HSE', notification:'지진 발생에 따른 TK-101, TK-102 현장 점검과 안전 조치를 요청합니다.' },
  'MNT-01': { incident_type:'계획정비 작업', severity:'보통', risk_level:'주의', affected_tanks:['TK-201'], impact_scope:'정비 대상 탱크 및 인접 작업 구역', evidence:['사전 계획된 설비 정비 일정 확인','작업 중 에너지 차단 및 가스 측정 필요'], immediate_actions:['작업 허가 및 에너지 격리 상태 확인','작업 전 안전 브리핑 실시'], inspections:['가스 농도 측정 및 보호구 확인','정비 후 누출 및 기능 시험'], department:'설비보전팀 · 운영팀', notification:'TK-201 계획정비 전 작업 허가와 격리 상태를 확인해 주세요.' },
  'LOW-QUALITY': { incident_type:'판독이 어려운 점검 문서', severity:'확인 필요', risk_level:'확인 필요', affected_tanks:[], impact_scope:'문서 품질 저하로 범위 확인 불가', evidence:['문서의 일부 내용이 흐리거나 누락되어 식별이 어렵습니다.'], immediate_actions:['원본 문서 또는 선명한 재스캔본 확보'], inspections:['현장 담당자에게 설비 식별 정보 확인'], department:'현장 운영팀', notification:'문서 판독이 어려워 원본과 대상 설비 확인을 요청합니다.' },
  'MULTI-FORMAT': { incident_type:'복수 양식 설비 점검', severity:'보통', risk_level:'주의', affected_tanks:['TK-301','TK-302'], impact_scope:'서로 다른 양식에 기록된 인접 저장탱크', evidence:['복수 양식의 점검 기록에서 연결부 이상 징후 확인','문서별 설비 식별 정보의 교차 확인 필요'], immediate_actions:['대상 탱크와 기록 일자를 대조','이상 징후가 보고된 연결부 우선 확인'], inspections:['문서별 점검 결과와 현장 상태 대조'], department:'운영팀 · 설비보전팀', notification:'복수 문서에 기록된 TK-301, TK-302의 점검 결과를 확인해 주세요.' }
};
export function normalize(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const pick = (...keys) => keys.map(k => source[k]).find(v => v !== undefined && v !== null && v !== '');
  const str = v => typeof v === 'string' || typeof v === 'number' ? String(v) : '확인 필요';
  const list = v => Array.isArray(v) ? v.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)) : v ? [typeof v === 'object' ? JSON.stringify(v) : String(v)] : [];
  return { incident_type:str(pick('incident_type','accident_type','사고 유형')), severity:str(pick('severity','심각도')), risk_level:str(pick('risk_level','risk_grade','위험 등급')), affected_tanks:list(pick('affected_tanks','tanks','영향 탱크')), impact_scope:str(pick('impact_scope','영향 범위')), evidence:list(pick('evidence','evidence_summary','핵심 근거')), immediate_actions:list(pick('immediate_actions','actions','즉시 조치')), inspections:list(pick('inspections','inspection_recommendations','점검 권고')), department:str(pick('department','responsible_department','담당 부서')), notification:str(pick('notification','notification_draft','담당자 알림안')) };
}
export function extractResult(job) {
  if (typeof job.output_text === 'string') {
    try { return JSON.parse(job.output_text); } catch { /* Try structured output. */ }
  }
  for (const output of job.output || []) for (const content of output.content || []) if (typeof content.text === 'string') {
    let text = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(text); } catch { /* Try another output. */ }
  }
  throw new Error('Studio 결과에서 JSON을 찾지 못했습니다. 원본 워크플로우의 출력 형식을 확인해 주세요.');
}

