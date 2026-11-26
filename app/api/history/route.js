import { NextResponse } from 'next/server';
import { historyRequest, createHistory } from '../../../lib/history.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const page = Number(new URL(request.url).searchParams.get('page') || 0);
    if (!Number.isSafeInteger(page) || page < 0 || page > 100000) return NextResponse.json({error:'올바르지 않은 페이지입니다.'},{status:400});
    const rows = await historyRequest(`?select=job_id,file_name,created_at,status&order=created_at.desc,job_id.desc&limit=50&offset=${page*50}`);
    return NextResponse.json({items:rows,hasMore:rows.length===50});
  } catch (error) { console.error('History read failed:',error.message); return NextResponse.json({error:'분석 기록을 불러오지 못했습니다.'},{status:503}); }
}
export async function POST(request) {
  try {
    const {jobId,fileName} = await request.json();
    if (typeof jobId !== 'string' || !/^job_[a-zA-Z0-9_-]{1,196}$/.test(jobId)) return NextResponse.json({error:'올바른 Studio 작업 ID를 입력해 주세요.'},{status:400});
    const base=(process.env.UPSTAGE_API_BASE_URL || 'https://api.upstage.ai/v2').replace(/\/$/,'');
    const headers={Authorization:`Bearer ${process.env.UPSTAGE_API_KEY}`};
    if(process.env.UPSTAGE_PROJECT_ID)headers['x-project-id']=process.env.UPSTAGE_PROJECT_ID;
    const response=await fetch(`${base}/responses/${encodeURIComponent(jobId)}?include%5B%5D=last`,{headers,cache:'no-store',signal:AbortSignal.timeout(45000)});
    if(!response.ok)return NextResponse.json({error:'Studio에서 해당 작업을 확인하지 못했습니다.'},{status:400});
    const job=await response.json();
    if(job.model && job.model!==process.env.UPSTAGE_WORKFLOW_ID)return NextResponse.json({error:'현재 워크플로우의 작업이 아닙니다.'},{status:400});
    await createHistory(jobId,fileName || '이전 Studio 작업');
    return NextResponse.json({ok:true});
  } catch(error) { console.error('History import failed:',error.message);return NextResponse.json({error:'기존 작업을 추가하지 못했습니다.'},{status:502}); }
}
