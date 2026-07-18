# RoVoCar

영어 단어와 한글 뜻을 단어장에 싣고, 양방향 입력 퀴즈로 외우는 정적 PWA입니다.

## 매주 단어장 추가

1. Codex 대화에 단어장 사진을 첨부하고 `RoVoCar용 CSV로 만들어줘`라고 요청합니다.
2. 결과 CSV의 첫 줄은 반드시 `English,Korean`이어야 합니다.
3. RoVoCar 첫 화면에서 **CSV 불러오기**를 누르고 파일을 선택합니다.
4. 단어 수와 미리보기를 확인한 뒤 단어장을 만듭니다.

로그인 전에는 CSV와 학습 기록이 브라우저에 저장됩니다. Supabase를 연결하면 카카오 로그인 사용자별 DB와 오프라인 캐시에 동기화됩니다.

## 계정·관리자 연결

- Supabase·카카오 설정: `docs/supabase-setup.md`
- DB 테이블과 RLS: `supabase/schema.sql`
- 읽기 전용 관리자 화면: `/admin.html`

관리자 화면에는 표시 이름, 접속 횟수, 단어장·고유 단어·풀이 통계만 표시합니다. 이메일이나 카카오 프로필 원문은 별도 저장하지 않습니다.

## 로컬 실행

```bash
python3 -m http.server 5173
```

브라우저에서 `http://localhost:5173`을 엽니다.

## 확인

```bash
node --check app.js
python3 -m json.tool manifest.webmanifest
```
