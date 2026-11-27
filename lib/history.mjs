const url = () => process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = () => process.env.SUPABASE_SECRET_KEY;
export async function historyRequest(query, options = {}) {
  if (!url() || !key()) throw new Error('분석 기록 저장소가 설정되지 않았습니다.');
  const response = await fetch(`${url()}/rest/v1/analysis_history${query}`, {
    ...options,
    headers: { apikey: key(), Authorization: `Bearer ${key()}`, 'Content-Type':'application/json', ...options.headers },
    cache:'no-store', signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`분석 기록 저장소 오류 (${response.status})`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
export const safeFileName = value => typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,255) || '이름 없는 문서' : '이름 없는 문서';
export async function createHistory(jobId, fileName) {
  return historyRequest('?on_conflict=job_id', {method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({job_id:jobId,file_name:safeFileName(fileName)})});
}
export async function updateHistory(jobId, data) {
  const rows=await historyRequest(`?job_id=eq.${encodeURIComponent(jobId)}`, {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({...data,updated_at:new Date().toISOString()})});
  return Array.isArray(rows) && rows.length>0;
}
// Delete history rows by Studio job ID. Returns how many rows were removed.
// The Studio job itself is not touched; only the public history entry goes away.
export const JOB_ID = /^[a-zA-Z0-9_-]{1,200}$/;
export async function deleteHistory(jobIds) {
  if (!Array.isArray(jobIds) || !jobIds.length || jobIds.length > 100 || jobIds.some(id => typeof id !== 'string' || !JOB_ID.test(id))) throw new Error('올바르지 않은 작업 ID입니다.');
  const ids = [...new Set(jobIds)];
  const rows = await historyRequest(`?job_id=in.(${ids.join(',')})`, {method:'DELETE',headers:{Prefer:'return=representation'}});
  return Array.isArray(rows) ? rows.length : 0;
}
