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
