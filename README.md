# RoVoCar

RoVoCar는 종이 영어 단어장을 CSV로 변환해 등록하고, 반복 퀴즈로 학습하는 가족용 PWA입니다. VoCat의 단어장·주행형 학습 UX를 참고하되, 사진 OCR이나 LLM API를 앱에 직접 넣지 않고 사용자가 ChatGPT/Codex로 만든 CSV를 불러오는 방식으로 구성했습니다.

## 서비스 주소

- 사용자 앱: <https://ljwkck-ship-it.github.io/rovocar/>
- 읽기 전용 관리자: <https://ljwkck-ship-it.github.io/rovocar/admin.html>
- GitHub 저장소: <https://github.com/ljwkck-ship-it/rovocar>
- Supabase 프로젝트 Ref: `txmepzwyduasgunultwa`
- 운영 카카오 앱 ID: `981885`

관리자 페이지에는 별도의 아이디나 비밀번호가 없습니다. 사용자 앱에서 관리자로 등록된 카카오 계정으로 로그인하면 같은 브라우저의 세션으로 접근합니다. 관리자 권한은 이메일 문자열이 아니라 Supabase Auth 사용자 UUID로 판별합니다.

## 2026-07-18 작업 내역

### 사용자 기능

- 설치 가능한 반응형 PWA 구성
- VoCat을 참고한 단어장 차고형 홈 화면과 반복 학습 흐름 구현
- CSV로 새 단어장 생성
- 기존 단어장에 CSV 단어 추가
- 단어장 직접 만들기
- 단어장 이름 변경 및 삭제
- 단어장 검색과 개수 표시
- 단어장이 20~30개 이상이어도 사용할 수 있는 검색·카드 목록 UX
- 영어→한글, 한글→영어 양방향 입력 퀴즈
- 정답·오답·풀이 횟수와 학습 상태 저장
- 영어 철자 기준으로 사용자가 몇 번째 등록한 고유 단어인지 표시
- 로그인 전 기기 저장과 로그인 후 Supabase 동기화
- 네트워크가 없어도 사용할 수 있는 오프라인 캐시와 서비스 워커

### CSV 검증

프로젝트의 `영어 단어 입력/` 폴더에 있던 실제 샘플을 사용해 파서를 점검했습니다.

- 샘플 CSV 4개
- 각 파일 80단어
- 총 320행 파싱 확인
- UTF-8 BOM, 쉼표, 따옴표가 포함된 CSV 처리
- `English,Korean` 헤더 형식 지원

개인 단어장 원본 CSV와 사진은 공개 GitHub 저장소에 올리지 않았으며 로컬에만 남겨두었습니다.

### 로그인 및 DB

- Supabase Auth와 카카오 로그인 연결
- 카카오 사용자별 프로필 자동 생성
- 사용자별 단어장, 단어, 학습 기록 분리
- 접속 횟수와 최근 접속 시각 기록
- RLS(Row Level Security)로 다른 사용자의 데이터 조회·수정 차단
- 로그인하지 않은 상태에서는 브라우저 로컬 저장소 사용
- 로그인 후에는 로컬 데이터와 클라우드 데이터 동기화

Supabase 프로젝트는 Tokyo AWS 리전을 사용합니다. Auth 리디렉션 허용 주소는 다음과 같습니다.

- `https://ljwkck-ship-it.github.io/rovocar/**`
- `http://localhost:5173/**`

### 카카오 앱 설정

기존 비즈 앱 `981885`를 RoVoCar 운영 앱으로 전환했습니다.

- 앱 표시 이름: `RoVoCar`
- 회사·사업자 정보: 기존 승인 정보 유지
- 카테고리: 교육
- 대표 도메인: GitHub Pages 운영 주소
- 카카오 로그인: 활성화
- OpenID Connect: 활성화
- REST API OAuth 콜백: Supabase Auth callback
- 기존 내부 IP 호출 제한 제거
- 기존 펜션 채널은 채널 자체를 삭제하지 않고 로그인 대표 채널 표시에서만 분리
- 닉네임: 필수 동의
- 프로필 사진: 선택 동의
- 카카오계정 이메일: 선택 동의
- 나머지 개인정보와 추가 API 권한: 사용 안 함
- 개인정보 국외이전 정보: Supabase Tokyo/AWS 환경에 맞춰 등록

새로 만들었던 카카오 앱 `1517013`은 중복 로그인 경로를 막기 위해 카카오 로그인을 비활성화했습니다. 운영 인증에는 사용하지 않습니다.

REST API 키와 클라이언트 시크릿은 이 README나 Git 저장소에 기록하지 않습니다. 카카오 Developers와 Supabase Dashboard에서만 관리합니다.

### 관리자 서비스

`admin.html`은 읽기 전용 운영 화면입니다.

- 로그인 사용자 수
- 누적 접속 횟수
- 사용자별 접속 횟수
- 사용자별 단어장 수
- 사용자별 고유 단어 수
- 사용자별 풀이 수
- 사용자별 단어장 요약

이메일 주소와 전체 사용자 UUID는 관리자 목록에 노출하지 않습니다. UUID는 앞부분만 표시하고, 이메일 원문과 카카오 원본 프로필은 별도 관리 데이터로 복제하지 않습니다.

관리자 권한은 `public.admin_users` 테이블에 등록된 Auth UUID만 가집니다. 현재 최초 로그인한 운영자 계정 한 개만 등록되어 있습니다. 일반 가족 계정이 관리자 URL을 직접 입력해도 RLS와 관리자 검사로 접근할 수 없습니다.

관리자를 추가해야 할 때만 Supabase SQL Editor에서 다음 쿼리를 실행합니다.

```sql
insert into public.admin_users (user_id)
values ('추가할-Supabase-Auth-사용자-UUID')
on conflict (user_id) do nothing;
```

클라이언트 앱에는 관리자 추가·삭제 권한이 없습니다.

### 배포

- 공개 저장소: `ljwkck-ship-it/rovocar`
- 브랜치: `main`
- GitHub Pages source: `main / (root)`
- HTTPS 강제 사용
- Supabase URL과 publishable key만 프런트엔드에 포함
- Supabase secret key, service role key, 카카오 client secret은 저장소에 포함하지 않음

GitHub에는 RoVoCar 운영 소스만 추적합니다. 아래 로컬 참고 자료는 커밋에서 제외했습니다.

- `Vocat_앱/`
- `영어 단어 입력/`
- `참고 이미지/`
- `study_pwa/`
- 개인 프로젝트 가이드 문서

## PWA 설치 안내

RoVoCar는 앱스토어를 거치지 않고 브라우저에서 홈 화면이나 응용 프로그램으로 설치할 수 있습니다. 반드시 운영 주소 <https://ljwkck-ship-it.github.io/rovocar/>에서 설치합니다. `localhost` 주소는 개발용이므로 가족 기기 설치에 사용하지 않습니다.

### iPhone·iPad

Safari 사용을 권장합니다.

1. Safari에서 RoVoCar 운영 주소를 엽니다.
2. 화면 아래 또는 위의 **공유** 버튼(사각형과 위쪽 화살표)을 누릅니다.
3. 공유 메뉴를 내려 **홈 화면에 추가**를 선택합니다.
4. 이름이 `RoVoCar`인지 확인하고 **추가**를 누릅니다.
5. 홈 화면에 생긴 RoVoCar 아이콘으로 실행합니다.

iOS에서는 웹페이지 안의 **앱 설치** 버튼보다 Safari의 **공유 → 홈 화면에 추가** 절차를 사용합니다. 메뉴에 항목이 보이지 않으면 **동작 편집**에서 홈 화면에 추가를 활성화하거나 Safari로 다시 열어주세요.

### Android

Chrome 사용을 권장합니다.

1. Chrome에서 RoVoCar 운영 주소를 엽니다.
2. 화면에 표시되는 **앱 설치** 버튼을 누릅니다.
3. 설치 확인 창에서 **설치**를 선택합니다.

앱 안에 설치 버튼이 보이지 않는 경우 Chrome 오른쪽 위 **⋮ 메뉴 → 앱 설치** 또는 **홈 화면에 추가**를 선택합니다. 설치가 끝나면 홈 화면과 앱 목록에서 RoVoCar를 실행할 수 있습니다.

### macOS

Chrome 또는 Edge에서는 RoVoCar 화면의 **앱 설치** 버튼을 누르면 별도 앱 창으로 설치됩니다. 설치 후 다음 위치에서 실행할 수 있습니다.

- Launchpad 또는 Spotlight에서 `RoVoCar` 검색
- Chrome 주소창의 설치 아이콘
- Chrome 메뉴의 **저장 및 공유 → 페이지를 앱으로 설치**(브라우저 버전에 따라 문구가 다를 수 있음)

단, **앱 설치** 버튼은 다음 조건을 만족할 때만 나타납니다.

- HTTPS 운영 주소로 접속
- 브라우저가 PWA 설치를 지원
- 아직 해당 브라우저에 설치하지 않음
- 서비스 워커와 웹 앱 매니페스트가 정상 로드됨

따라서 macOS에서 버튼이 보이고 Chrome/Edge를 사용 중이라면 버튼을 누르는 것으로 설치됩니다. 이미 설치했거나 Safari처럼 `beforeinstallprompt`를 제공하지 않는 브라우저에서는 버튼이 숨겨질 수 있습니다.

macOS Sonoma 14 이상 Safari에서는 RoVoCar를 연 뒤 메뉴 막대의 **파일 → Dock에 추가**를 사용할 수 있습니다. Safari 설치는 웹페이지 안의 **앱 설치** 버튼이 아니라 Safari 메뉴에서 진행합니다.

### 설치 후 로그인과 데이터

- 설치형 RoVoCar도 웹 버전과 같은 Supabase 사용자 데이터를 사용합니다.
- 각 가족 구성원은 자신의 카카오 계정으로 로그인합니다.
- 같은 계정이면 다른 기기에서도 Supabase에 저장된 단어장을 불러올 수 있습니다.
- 최초 실행이나 로그인이 필요한 시점에는 인터넷 연결이 필요합니다.
- 오프라인 캐시는 최근에 받아둔 앱 파일을 실행하는 용도이며, 동기화는 네트워크가 다시 연결되면 수행됩니다.
- 앱 삭제 후 다시 설치하면 기기 캐시는 사라질 수 있지만, 로그인 계정의 Supabase 데이터는 삭제되지 않습니다.

## 매주 단어장 추가 방법

1. 종이 단어장을 휴대폰으로 촬영합니다.
2. 개인 ChatGPT 또는 Codex 대화에 사진을 첨부합니다.
3. `RoVoCar용 CSV로 만들어줘. 첫 줄은 English,Korean으로 해줘.`라고 요청합니다.
4. 생성된 CSV를 아이폰에 저장합니다.
5. RoVoCar에서 카카오 로그인합니다.
6. **CSV 불러오기**를 누르고 파일을 선택합니다.
7. 단어 수와 미리보기를 확인한 뒤 새 단어장을 생성합니다.

기존 단어장에 추가할 때는 단어장 메뉴의 CSV 추가 기능을 사용합니다. 같은 영어 철자가 이미 등록된 경우에도 단어장에는 포함할 수 있지만, 사용자의 고유 단어 등록 순번은 최초 등록 기준으로 유지됩니다.

### 권장 CSV 형식

```csv
English,Korean
apple,사과
take care of,돌보다
"right, correct",옳은
```

- 첫 줄: `English,Korean`
- 한 행에 영어와 한글 뜻 하나씩 입력
- 값에 쉼표가 있으면 큰따옴표로 감싸기
- UTF-8 CSV 권장

## 데이터 저장 구조

### 브라우저

- 로그인 전 단어장과 학습 상태
- 오프라인 사용을 위한 캐시
- Supabase 인증 세션

브라우저 데이터 삭제, 시크릿 모드, 새 기기에서는 로컬 데이터와 로그인 세션이 유지되지 않을 수 있습니다.

### Supabase

| 테이블 | 용도 |
| --- | --- |
| `profiles` | 표시 이름, 최초·최근 접속, 접속 횟수 |
| `decks` | 사용자별 단어장 이름과 정렬 순서 |
| `words` | 단어장별 영어, 뜻, 학습 결과 |
| `vocabulary_registry` | 철자 기준 최초 등록 순번과 고유 단어 통계 |
| `admin_users` | 관리자 Auth UUID 허용 목록 |

전체 스키마, 인덱스, 트리거와 RLS 정책은 `supabase/schema.sql`에 있습니다.

## 프로젝트 파일

| 파일 | 역할 |
| --- | --- |
| `index.html` | 사용자 앱 화면 |
| `app.js` | 단어장·CSV·퀴즈·로컬 상태 로직 |
| `cloud.js` | Supabase Auth와 데이터 동기화 |
| `styles.css` | 사용자 앱 스타일 |
| `admin.html` | 관리자 화면 |
| `admin.js` | 관리자 권한 검사와 통계 조회 |
| `admin.css` | 관리자 화면 스타일 |
| `supabase-config.js` | 공개 가능한 Supabase URL과 publishable key |
| `supabase/schema.sql` | DB 스키마와 RLS 정책 |
| `manifest.webmanifest` | PWA 메타데이터 |
| `sw.js` | 오프라인 캐시 |
| `tests/smoke.mjs` | 구조·기능·CSV 샘플 스모크 테스트 |

## 로컬 실행

```bash
python3 -m http.server 5173
```

브라우저에서 <http://localhost:5173/>을 엽니다. 운영 테스트는 쿼리 문자열이 없는 주소를 기준으로 합니다. 과거 테스트 주소인 `?v=7`은 필수가 아닙니다.

## 테스트

```bash
node tests/smoke.mjs
node --check app.js
node --check cloud.js
node --check admin.js
python3 -m json.tool manifest.webmanifest
```

2026-07-18 최종 스모크 테스트 결과:

```text
RoVoCar smoke test passed: PWA files, two game modes, CSV import, reference data
CSV samples passed: 4 files × 80 words
```

실서비스에서 추가로 확인한 항목:

- GitHub Pages HTTP 200 응답
- 카카오 동의 화면 진입
- 카카오 로그인 후 운영 주소 복귀
- Supabase Auth 사용자 생성
- 프로필과 접속 횟수 생성
- 관리자 RLS 접근 성공
- 비관리자 접근 차단 구조 확인

## 운영 및 보안 주의사항

- 카카오 client secret이나 Supabase service role key를 코드·README·이슈에 올리지 않습니다.
- 브라우저에는 Supabase publishable key만 사용합니다.
- 관리자 추가는 반드시 Supabase SQL Editor에서 수행합니다.
- 가족 계정을 관리자에 추가하지 않습니다.
- 카카오 앱의 REST API 키를 재발급하면 Supabase Provider 설정도 즉시 갱신합니다.
- GitHub Pages 도메인을 바꾸면 Supabase URL Configuration과 카카오 OAuth 콜백/대표 도메인을 함께 점검합니다.
- 개인정보 수집 범위를 늘릴 때는 카카오 동의항목, 개인정보 처리방침과 관리자 표시 범위를 함께 검토합니다.
- 카카오 탈퇴·연결 해제 정보를 자동 반영하려면 향후 User Unlinked 웹훅을 별도로 구성합니다.

## 후속 작업 후보

- 가족 계정으로 실제 단어장 생성·수정·삭제 동기화 검증
- 아이폰 홈 화면 설치와 오프라인 재접속 시험
- 카카오 User Unlinked 웹훅 구성
- 개인정보 처리방침 페이지 추가
- 관리자 화면의 기간별 접속 추이와 CSV 내보내기(개인정보 최소화 유지)
