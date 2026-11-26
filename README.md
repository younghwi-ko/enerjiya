# EnerJiya

사고·점검 PDF를 기존 Upstage Studio 워크플로우에 전달하고 위험도와 대응안, 담당자 알림 초안을 표시하는 대시보드입니다. 알림을 실제로 발송하지 않습니다.

## 로컬 실행

Node.js 20 이상이 필요합니다.

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. `.env.local`에 아래 값을 넣고 서버를 재시작하세요. 실제 자격 증명은 Git에 올리지 않습니다. 테스트와 배포 빌드는 `npm test`, `npm run build`로 실행합니다.

## 환경 변수

| 변수 | 값 |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | 4MiB 초과 PDF용 비공개 Blob 저장소 토큰. Vercel 저장소 연결 시 자동 설정됩니다. |
| `UPSTAGE_API_KEY` | Upstage 콘솔의 API 키. 서버에서만 사용합니다. |
| `UPSTAGE_PROJECT_ID` | 프로젝트에 속한 워크플로우의 Project ID. 모든 Studio 요청의 `x-project-id` 헤더에 사용합니다. |
| `UPSTAGE_WORKFLOW_ID` | 기존 Studio 워크플로우의 Agent ID (`agt_...`). |
| `UPSTAGE_CONFIG_ID` | 선택 사항. Studio의 저장된 Config ID. 생략하면 최신 설정을 사용합니다. |
| `UPSTAGE_API_BASE_URL` | 선택 사항. 기본값 `https://api.upstage.ai/v2`. |

기존 Studio 워크플로우에서 설정을 저장한 뒤 오른쪽 위 `⋯ → Code`에서 Agent ID와 Config ID를 확인합니다. 특정 버전을 사용하려면 Config ID도 설정하세요. 프로젝트 ID는 같은 화면의 API 호출 예시에서 `x-project-id` 값을 확인합니다. 워크플로우를 생성하거나 수정하지 않습니다.

## 동작과 제한

서버는 PDF를 `/files`에 `purpose=user_data`로 업로드하고, `/responses`로 기존 워크플로우를 실행합니다. 브라우저는 `/api/analyze`만 호출하여 작업 완료를 조회합니다. [Upstage 공식 API 문서](https://console.upstage.ai/docs/agents)를 참고했습니다. PDF는 8MiB 이하를 허용합니다. 4MiB 초과 파일은 브라우저에서 비공개 Vercel Blob으로 직접 업로드하고, 서버가 읽어 Studio로 전송한 후 임시 Blob을 삭제합니다. 브라우저 중단이나 서버 장애 시 임시 파일이 남을 수 있으므로 저장소를 정기적으로 확인하세요. Blob 저장소의 무료 사용량은 모든 사용자에게 공유됩니다. 장시간 대기 또는 오류 시 4개 예시 시나리오를 선택할 수 있습니다. 화면의 문서 파싱 등 세부 단계는 Studio 내부에서 실행되며 개별 단계의 실시간 완료 상태를 나타내지 않습니다.

결과 매핑은 `lib/results.mjs`의 `normalize`에서 관리합니다. Studio 결과 스키마가 다르면 실제 JSON을 확인하고 필드 별칭을 추가해야 합니다. 미확인 값은 임의로 생성하지 않으며 상세 JSON을 그대로 볼 수 있습니다. 예시 시나리오는 실제 분석이 아닌 가상의 데이터입니다. 실제 결과와 예시는 모두 현장 전문가가 검토해야 합니다.

## Vercel 배포

GitHub 저장소를 Vercel 프로젝트에 연결하고 프로젝트 Settings → Environment Variables에 위 변수를 추가합니다. Production 및 필요한 Preview 환경을 선택한 뒤 재배포해야 새 환경 변수가 반영됩니다. 기존 프로젝트 설정이나 권한 변경은 이 코드가 수행하지 않습니다. 새 GitHub 저장소는 Vercel에 별도 연결해야 자동 배포됩니다.

## 시연 순서

1. 대시보드에서 PDF를 선택하고 `Upstage Studio 분석 시작`을 누릅니다.
2. 문서 수신과 Studio 실행 상태를 보여줍니다.
3. 분석 결과에서 위험 등급, 영향 탱크, 근거와 조치안을 차례로 설명합니다.
4. 담당자 알림 초안과 상세 JSON을 펼쳐 보여줍니다.
5. `새 분석 시작`으로 초기 화면에 돌아갑니다. 오류 또는 장시간 대기 시 시나리오를 선택해 `데모 시나리오로 보기`를 누릅니다.

## 약 1분 시연 멘트

“EnerJiya는 저장탱크 사고와 점검 문서를 현장 대응으로 연결하는 Energy AI Workflow입니다. 먼저 PDF 보고서를 업로드하고 Upstage Studio 분석을 시작합니다. 문서는 기존 Studio 워크플로우로 전달되어 파싱과 위험 요인 추출을 거칩니다. 분석이 완료되면 사고 유형과 위험 등급, 영향받는 탱크와 범위를 한눈에 확인할 수 있습니다. 근거 요약을 바탕으로 즉시 조치와 추가 점검 권고도 제안합니다. 담당 부서에 전달할 알림 초안을 확인하고, 필요하면 원본 JSON까지 열어 세부 결과를 검토할 수 있습니다. 모든 제안은 현장 담당자의 검토를 거쳐 사용하며, 새 분석 버튼으로 다음 문서를 이어서 처리할 수 있습니다.”


