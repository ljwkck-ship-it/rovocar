# RoVoCar CSV Maker

사진 속 영어 단어장(보통 약 80개)을 읽어 **RoVoCar 단어장 앱**에서 바로 불러올 수 있는 CSV로 만드는 가족용 웹 서비스입니다.

- 서비스: https://ljwkck-ship-it.github.io/rovocar/csv-maker/
- 연동 앱: https://ljwkck-ship-it.github.io/rovocar/
- Supabase 프로젝트: `txmepzwyduasgunultwa`
- GitHub 저장소: `ljwkck-ship-it/rovocar`

## 현재 배포 방식

이 앱은 RoVoCar 본앱 저장소 안의 하위 앱입니다.

- 소스: `csv-maker-src/`
- 정적 빌드 산출물: `../csv-maker/`
- 운영 경로: `https://ljwkck-ship-it.github.io/rovocar/csv-maker/`

소스 변경 후에는 다음을 실행하고 `csv-maker/` 변경도 함께 커밋해야 합니다.

```bash
npm test
npm run build
git add csv-maker-src csv-maker
git commit -m "..."
git push origin main
```

GitHub 토큰에 `workflow` 권한이 없어 GitHub Actions 워크플로는 현재 사용하지 않습니다.

## Supabase / Gemini 구성

OCR는 브라우저가 Gemini를 직접 호출하지 않고, Supabase Edge Function이 호출합니다.

- 함수 이름: `extract-vocabulary`
- URL: `https://txmepzwyduasgunultwa.supabase.co/functions/v1/extract-vocabulary`
- 함수 소스: `supabase/functions/extract-vocabulary/index.ts`
- 사용량 제한 SQL: `supabase/migrations/20260719000000_ocr_usage.sql`

Supabase Edge Function Secrets에는 값이 아닌 아래 **이름**으로 설정되어 있어야 합니다.

```text
GEMINI_API_KEY_PRIMARY
ALLOWED_ORIGINS
OCR_DAILY_LIMIT
OCR_MINUTE_LIMIT
MAX_IMAGE_BYTES
MAX_REQUEST_BYTES
```

기본 Supabase Secrets인 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`도 함수에서 사용합니다. 키 값은 저장소나 README에 기록하지 않습니다.

함수 코드를 변경했다면 Supabase Dashboard의 **Edge Functions → extract-vocabulary → Code**에서 `index.ts` 전체를 로컬 파일 내용으로 교체하고 **Update deploy**를 눌러야 합니다. GitHub push만으로는 함수가 배포되지 않습니다.

## 2026-10-20 영상 제보 후 보완

- 23.8초 영상의 마지막 안내는 API 키 오류가 아닌 추출 시간 초과였습니다. 4개 샘플 성공만으로 80개 사진의 정상 동작까지 검증하지 못한 한계를 확인했습니다.
- Gemini 추출 제한을 25초에서 90초로 늘리고, Gemini 3 이상은 `LOW`, 2.5는 추론 예산 0을 지정했습니다. 실제 호출에서 Gemini 3.8 Flash가 `MINIMAL`을 지원하지 않아 HTTP 400을 반환한 것을 확인한 뒤 `LOW`로 수정했습니다. 수정한 함수를 운영 서버에 배포한 뒤 사용자가 전달한 원본 사진으로 추출에 성공했습니다. 영어 80개가 원본 순서와 일치하고 누락·중복이 없으며 한글 뜻 빈칸도 0개임을 확인했습니다. 한글 뜻은 일부 동의어로 정리되어 원문 필기와 완전히 같다는 의미는 아닙니다.
- 원본 사진 추출 성공 후 모바일 iPhone Safari의 같은 사진 요청이 91.4초 만에 503으로 종료된 운영 기록을 확인했습니다. 서버의 기존 90초 타이머가 원인이어서 제한을 120초로 늘리고, 타임아웃 진단 로그를 추가했습니다. Gemini 3 문서의 지연 안내에 따라 고정 `temperature: 0`도 제거했습니다. Supabase 무료 함수 한도는 150초이며, 화면 안내도 약 2분으로 맞췄습니다.
- 동일 사용자 인증 갱신 때 사진·추출·편집 화면을 유지합니다. 계정이 바뀌면 이전 사진/결과를 비우며, 파일 읽기·추출 완료 사이에 인증이 바뀐 요청도 중단합니다.
- 로그인·로그아웃과 동기화 응답의 순서가 뒤바뀌어도 이전 계정의 결과를 현재 화면/저장 키에 적용하지 않도록 인증 세대를 검사합니다. Chrome에서 지연 로그인→로그아웃→이전 응답 도착 시 화면이 유지되는 것을 확인했습니다.
- iPhone 영상의 인증 이벤트 자체가 A→로그아웃→A로 바뀐 원인은 아직 확정하지 않았습니다. 이번 변경은 확인된 경쟁 조건과 불필요한 화면 초기화를 막습니다.

## 2026-10-20 Gemini 추출 오류 복구

- 운영 로그에서 `gemini-3.6-flash`의 HTTP 503 `UNAVAILABLE`과 high demand 응답을 확인했습니다. 최초 요청 실패의 원인은 Gemini 모델 혼잡입니다.
- 실제 반환된 일반 Gemini Flash 모델 중 안정 버전을 우선 선택합니다. 목록의 모든 페이지를 조회하며, 이미지 생성·실시간·음성·Omni 모델을 제외합니다. 검증 중 Omni 모델은 무료 한도 0으로 HTTP 429를 반환했습니다.
- 모델 캐시는 5분 후 갱신합니다. HTTP 404·503이면 목록을 재조회해 다른 가용 모델을 우선 선택하고 한 번만 재시도합니다. 403·429는 추가 생성 요청 없이 기존 오류 처리에 전달합니다.
- 공식 REST 형식인 `responseFormat.text.schema`로 결과 구조를 지정합니다. 스키마의 `maxItems: 150`을 제거하자 실제 400 오류가 해소됐으며, 서버의 최대 150개 검증은 유지했습니다.
- 최초 복구에서는 모델 조회·생성 요청·응답 본문 수신에 걸쳐 25초 제한을 적용했으며, 이후 원본 사진 대응을 위해 위 보완 항목처럼 120초로 늘렸습니다.
- Supabase Dashboard에서 테스트한 파일과 편집기 코드가 일치함을 확인하고 배포했습니다. 운영 CSV Maker에 검증용 PNG를 업로드하여 apple/사과, banana/바나나, take care of/돌보다, involve/수반하다·포함하다 4개 항목이 모두 표시되는 것을 확인했습니다. 이후 위 보완 항목에서 사용자의 원본 80개 사진도 검증했습니다.
- 새 회귀 테스트 9개 통과. 전체 CSV Maker 테스트는 19개 통과, 기존 경로 문제로 1개 skip입니다. 본앱 core·smoke 검사도 통과했습니다. 테스트는 실제 Edge Function 소스를 실행하며 외부 fetch만 대체합니다(Node.js 24).
- 별도 Reviewer가 실제 diff와 테스트를 검토했으며, 배포를 막을 문제는 발견하지 못했습니다. API 키나 이미지 원문을 새로 기록하지 않습니다.
- 공식 API 근거: [모델 목록과 페이지 처리](https://ai.google.dev/api/models), [REST 구조화 출력](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en), [Gemini thinking 및 지연 안내](https://ai.google.dev/gemini-api/docs/troubleshooting), [Supabase Edge Function 시간 한도](https://supabase.com/docs/guides/functions/limits).

## 2026-07-19 작업 기록

- CSV Maker 구현 및 GitHub Pages 배포 완료.
- RoVoCar와 같은 `rovocar.svg` 파비콘 적용.
- 두 서비스에 Open Graph / Twitter 메타데이터와 1200×630 공유 이미지 적용.
  - CSV Maker 이미지: `public/assets/og-image.png`
  - 기존 RoVoCar 앱 이미지: `../RoVoCa_PWA/assets/og-image.png`
- iPhone에서 카메라만 강제 열던 `capture="environment"`를 두 파일 입력에서 제거함.
  - 이제 사진 선택 메뉴에서 사진 보관함을 선택할 수 있음.
- 모바일 메인 예제의 01/02 단어 행을 분리해 `02 involve`가 다음 줄에 나오게 수정함.
- 사용자 테스트 사진 확인:
  - 경로: `/Users/leejiwon/Downloads/KakaoTalk_Photo_2026-07-19-19-38-23.jpeg`
  - JPEG, 4032×3024, 약 3.9MB로 8MB 제한 이내.
- Edge Function Dashboard에 Supabase 기본 예제 코드가 함께 남아 있던 문제를 발견하고, OCR 함수 코드만 남기도록 2026-07-19에 직접 재배포함.
- 이후 Supabase Invocations에서 사용자 요청이 `401`임을 확인함. 원인은 오래 유지된 브라우저의 인증 토큰.
  - `src/main.js`는 OCR 직전에 `supabase.auth.getSession()`을 호출해 토큰을 갱신하도록 수정했고, 커밋 `f0ed547`로 Pages에 푸시함.
  - 사용자에게 새 Pages 빌드 반영 뒤 새로고침 → 카카오 로그인 → 같은 사진 재시도를 안내함.
- Safari CORS 사전 요청은 성공했지만 `authorization`, `content-type` 허용 헤더가 없어 실제 POST가 전송되지 않는 문제를 발견함.
  - 함수에 `access-control-allow-methods`와 `access-control-allow-headers`를 추가해 Dashboard에서 재배포함.
  - `curl` OPTIONS 검사로 두 헤더가 실제 응답에 포함된 것을 확인함.
- 그 뒤 실제 OCR POST는 서버에 도달했으나 `502`가 발생함.
  - 함수 로그의 `gemini_request_failed` 이벤트에서 Gemini HTTP 상태 `404`를 확인함.
  - 고정 모델명 `gemini-2.5-flash`를 사용하던 코드를 바꿔, API 키로 조회한 사용 가능 모델 목록에서 `generateContent`를 지원하는 Flash 모델을 자동 선택하도록 수정함.
  - 이 동적 모델 선택 코드는 커밋 `d0adb9a`이며, 2026-07-19에 Supabase Dashboard에서도 직접 재배포 완료.
- Gemini 오류는 API 키/권한, 무료 쿼터, 서버 설정, 응답 형식별로 안전한 한국어 안내를 반환하도록 보강함.

## 다음 세션에서 할 일

1. 통합된 GitHub Pages 주소 `https://ljwkck-ship-it.github.io/rovocar/csv-maker/`에서 사용자가 동일 사진으로 OCR을 다시 시도하게 한다.
2. 재시도에도 실패하면 Supabase Dashboard의 **Edge Functions → extract-vocabulary → Invocations**에서 최신 POST 상태 코드를 확인한다.
   - `401`: 로그인/토큰 문제
   - `429`: Gemini 또는 앱 사용량 제한
   - `502` 또는 `503`: 함수 로그에서 `gemini_request_failed` 및 HTTP 상태를 확인한다.
3. 동적 모델 선택 후에도 `404`가 나면 함수에서 Gemini 모델 목록 조회 결과를 **모델명만** 안전하게 로그로 남겨, API 키에 실제 허용된 모델을 확인한다. 키 값·토큰·사진 내용은 로그에 남기지 않는다.
4. 실사진 추출이 성공하면 80개 단어가 모두 편집 표에 나타나는지, CSV 다운로드 후 RoVoCar 앱에서 불러와지는지 확인한다.

## 검증 명령

```bash
npm test
npm run build
```

현재 테스트는 CSV RFC 4180 처리, RoVoCar 파서 호환성, 추출 결과 검증, 약 80개 항목 보존, 이미지 크기/형식 검증을 포함합니다.
