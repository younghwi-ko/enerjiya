import { NextResponse } from 'next/server';
import { get, del } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';
import { extractResult, normalize, getOutputText } from '../../../lib/results.mjs';
import { createHistory, updateHistory, historyRequest } from '../../../lib/history.mjs';
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
    let file; let fileName;
    if (request.headers.get('content-type')?.includes('application/json')) {
      const data = await request.json();
      if (data.type === 'blob.generate-client-token') {
        const token = await handleUpload({ request, body:data, onBeforeGenerateToken: async pathname => {
          if (!/^incoming\/[0-9a-f-]{36}\.pdf$/.test(pathname)) throw new Error('올바르지 않은 업로드 경로입니다.');
          return { allowedContentTypes:['application/pdf'], maximumSizeInBytes:8*1024*1024, validUntil:Date.now()+5*60*1000, addRandomSuffix:false, allowOverwrite:false };
        }});
        return NextResponse.json(token);
      }
      fileName = data.fileName;
      const pathname = data.pathname;
      if (typeof pathname !== 'string' || !/^incoming\/[0-9a-f-]{36}\.pdf$/.test(pathname)) return NextResponse.json({error:'올바르지 않은 업로드 경로입니다.'},{status:400});
      try {
        const blob = await get(pathname, {access:'private', useCache:false});
        if (!blob || blob.statusCode !== 200 || !blob.stream || !blob.blob.size || blob.blob.size > 8*1024*1024) return NextResponse.json({error:'업로드한 PDF를 확인할 수 없습니다.'},{status:400});
        const content = await new Response(blob.stream).blob();
        file = new File([content], 'document.pdf', {type:'application/pdf'});
      } finally {
        await del(pathname).catch(error => console.error('Temporary file cleanup failed:', error.message));
      }
    } else {
      const data = await request.formData(); file = data.get('file'); fileName = file?.name;
    }
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.pdf') || file.size === 0 || file.size > 8 * 1024 * 1024) return NextResponse.json({error:'8MB 이하의 PDF 파일을 선택해 주세요.'},{status:400});
    const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (new TextDecoder().decode(bytes) !== '%PDF-') return NextResponse.json({error:'올바른 PDF 파일이 아닙니다.'},{status:400});
    const form = new FormData(); form.append('file',file); form.append('purpose','user_data');
    const uploaded = await upstream('/files',{method:'POST',body:form});
    const payload = {model:process.env.UPSTAGE_WORKFLOW_ID,input:[{role:'user',content:[{type:'input_file',file_id:uploaded.id}]}],background:true,include:['last']};
    if (process.env.UPSTAGE_CONFIG_ID) payload.config_id = process.env.UPSTAGE_CONFIG_ID;
    const job = await upstream('/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if (!job.id) throw new Error('Studio 작업 ID를 받지 못했습니다.');
    let historySaved=true;
    try { await createHistory(job.id,fileName); } catch (error) { historySaved=false; console.error('History write failed:',error.message); }
    return NextResponse.json({id:job.id,status:job.status,historySaved});
  } catch(error) { return failure(error); }
}
export async function GET(request) {
  if (!process.env.UPSTAGE_API_KEY) return NextResponse.json({error:'Studio 환경 변수가 설정되지 않았습니다.'},{status:503});
  const id = new URL(request.url).searchParams.get('jobId');
  if (!id || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) return NextResponse.json({error:'올바르지 않은 작업 ID입니다.'},{status:400});
  try {
    try {
      const rows=await historyRequest(`?job_id=eq.${encodeURIComponent(id)}&select=status,result,source&limit=1`);
      if(rows?.[0]?.status==='completed' && rows[0].result !== null) { const raw=rows[0].result; return NextResponse.json({status:'completed',result:normalize(raw),raw,source:rows[0].source || ''}); }
    } catch(error) { console.error('History cache read failed:',error.message); }
    const job = await upstream(`/responses/${encodeURIComponent(id)}?include%5B%5D=last`);
    if(job.model && job.model!==process.env.UPSTAGE_WORKFLOW_ID) return NextResponse.json({error:'현재 워크플로우의 작업이 아닙니다.'},{status:404});
    if (job.status === 'failed' || job.status === 'cancelled') {
      const detail = typeof job.error?.message === 'string' ? job.error.message.slice(0,500) : '';
      try { await updateHistory(id,{status:job.status,error:detail}); } catch(error) { console.error('History update failed:',error.message); }
      return NextResponse.json({error: job.status === 'cancelled' ? 'Studio 작업이 취소됐습니다.' : `Studio 작업이 실패했습니다.${detail ? ` ${detail}` : ''}`}, {status:422});
    }
    if (job.status !== 'completed') return NextResponse.json({status:job.status});
    const raw = extractResult(job);
    const source=getOutputText(job); let historySaved=true;
    try { historySaved=await updateHistory(id,{status:'completed',result:raw,source}); } catch(error) { historySaved=false; console.error('History update failed:',error.message); }
    return NextResponse.json({status:'completed',result:normalize(raw),raw,source,historySaved});
  } catch(error) { return failure(error); }
}


