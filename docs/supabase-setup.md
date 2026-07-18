# Supabase·카카오 로그인 연결

## 1. Supabase 프로젝트

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 [`supabase/schema.sql`](../supabase/schema.sql)을 전체 실행합니다.
3. Project Settings → API에서 Project URL과 **Publishable key**를 확인합니다.
4. `supabase-config.js`의 `url`, `publishableKey`에 입력합니다.

`secret` 또는 `service_role` 키는 웹 파일에 절대 입력하지 않습니다.

## 2. 카카오 로그인

1. Kakao Developers에서 애플리케이션을 만들고 카카오 로그인을 활성화합니다.
2. OpenID Connect를 활성화하고 동의 항목에 `openid`를 포함합니다.
3. Supabase Authentication → Providers → Kakao에 Kakao 앱 정보를 입력합니다.
4. Kakao Redirect URI에는 Supabase가 안내하는 `/auth/v1/callback` 주소를 등록합니다.
5. Supabase URL Configuration에 실제 배포 주소와 Redirect URL을 등록합니다.

## 3. 첫 관리자 지정

1. 실제 배포된 RoVoCar에서 관리자 카카오 계정으로 한 번 로그인합니다.
2. Supabase Authentication → Users에서 해당 계정의 UUID를 복사합니다.
3. SQL Editor에서 아래 문장을 실행합니다.

```sql
insert into public.admin_users(user_id)
values ('복사한-사용자-UUID');
```

4. `/admin.html`에서 같은 카카오 계정으로 로그인합니다.

관리자 페이지는 읽기 전용입니다. `admin_users` 테이블에는 클라이언트 쓰기 정책이 없으며, 관리자 통계 함수가 호출자 UUID를 다시 검사합니다.

## 4. 저장과 동기화

- 로그인 전: 기기의 게스트 저장소
- 최초 로그인: 기존 로컬 단어장을 해당 계정으로 이전
- 로그인 후: 사용자 UUID별 로컬 캐시와 Supabase DB 동시 사용
- 오프라인: 로컬에 우선 저장하고 온라인 복귀 시 전체 데이터를 트랜잭션으로 동기화
- 로그아웃: 해당 사용자의 로컬 캐시는 화면에서 분리되고 게스트 저장소로 전환

단어 번호는 로그인 사용자별 영어 스펠링에 부여되며, 같은 단어를 여러 단어장에 넣어도 번호가 유지됩니다.
