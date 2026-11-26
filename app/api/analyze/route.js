import { NextResponse } from 'next/server';
import { extractResult, normalize } from '../../../lib/results.mjs';
export const maxDuration = 60;
const base = () => (process.env.UPSTAGE_API_BASE_URL || 'https://api.upstage.ai/v2').replace(/\/$/, '');
const headers = () => ({ Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}`, ...(process.env.UPSTAGE_PROJECT_ID ? { 'x-project-id': process.env.UPSTAGE_PROJECT_ID } : {}) });
async function upstream(path, options = {}) {
  const response = await fetch(`${base()}${path}`, { ...options, headers:{...headers(), ...options.headers}, signal:AbortSignal.timeout(45000), cache:'no-store' });
  if (!response.ok) throw new Error(`Studio API 오류 (${response.status})`);
  return response.json();
}
function failure(error) { console.error('Studio request failed:', error.message); return NextResponse.json({error: error.name === 'TimeoutError' ? 'Studio 응답 시간이 초과되었습니다.' : error.message}, {status:502}); }
export async function POST(request) {
  if (!process.env.UPSTAGE_API_KEY || !process.env.UPSTAGE_WORKFLOW_ID) return NextResponse.json({error:'Studio 환경 변수가 설정되지 않았습니다.'},{status:503});
  try {
    const data = await request.formData(); const file = data.get('file');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.pdf') || file.size === 0 || file.size > 4 * 1024 * 1024) return NextResponse.json({error:'4MB 이하의 PDF 파일을 선택해 주세요.'},{status:400});
    const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (new TextDecoder().decode(bytes) !== '%PDF-') return NextResponse.json({error:'올바른 PDF 파일이 아닙니다.'},{status:400});
    const form = new FormData(); form.append('file',file); form.append('purpose','user_data');
    const uploaded = await upstream('/files',{method:'POST',body:form});
    const payload = {model:process.env.UPSTAGE_WORKFLOW_ID,input:[{role:'user',content:[{type:'input_file',file_id:uploaded.id}]}],background:true,include:['last']};
    if (process.env.UPSTAGE_CONFIG_ID) payload.config_id = process.env.UPSTAGE_CONFIG_ID;
    const job = await upstream('/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if (!job.id) throw new Error('Studio 작업 ID를 받지 못했습니다.');
    return NextResponse.json({id:job.id,status:job.status});
  } catch(error) { return failure(error); }
}
export async function GET(request) {
  if (!process.env.UPSTAGE_API_KEY) return NextResponse.json({error:'Studio 환경 변수가 설정되지 않았습니다.'},{status:503});
  const id = new URL(request.url).searchParams.get('jobId');
  if (!id || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) return NextResponse.json({error:'올바르지 않은 작업 ID입니다.'},{status:400});
  try {
    const job = await upstream(`/responses/${encodeURIComponent(id)}?include%5B%5D=last`);
    if (job.status === 'failed' || job.status === 'cancelled') throw new Error('Studio 워크플로우 실행이 완료되지 않았습니다.');
    if (job.status !== 'completed') return NextResponse.json({status:job.status});
    const raw = extractResult(job);
    return NextResponse.json({status:'completed',result:normalize(raw),raw});
  } catch(error) { return failure(error); }
}

