# 다국어(i18n) 지원 계획

`@rdbms-erd/designer`·`@rdbms-erd/core`를 소비하는 앱이 여러 로케일을 쓸 때의 권장 구조와 도입 단계를 정리한다.  
(사용자가 설계에 입력하는 **테이블명·컬럼명·DDL 본문**은 i18n 대상이 아니며, **UI 라벨·툴팁·대화상자·에러 메시지**만 대상으로 한다.)

---

## 1. 선택지 비교

| 방식 | 장점 | 단점 |
|------|------|------|
| **A. Host가 문자열 리소스 주입** | 로케일 무제한, 법무/브랜드 문구 맞춤, 번들에 언어팩 미포함 가능, 앱의 i18n 스택과 통일 | 초기 연동 코드 필요, 키 누락 시 빈 문자열 처리 규칙 필요 |
| **B. 라이브러리 내장 언어 + `lang` props** | 도입이 단순, 문서·데모가 명확 | 지원 로케일 추가마다 릴리스·번들 증가, 일부 문구만 바꾸기 어려움 |
| **C. 하이브리드 (권장)** | 기본은 내장 `ko`/`en`으로 바로 동작, 필요 시 Host가 **부분/전체 덮어쓰기** | 구현 시 병합 규칙·타입을 한 번 정리해야 함 |

**권장: C (하이브리드)**  
- 라이브러리는 **문자열 키 체계** + **기본 번들(예: `ko`, `en`)**을 제공해 “props만 넣으면 한글/영문”이 된다.  
- Host는 `locale`과 함께 **`translations` 오버라이드** 또는 **`t(key)` 콜백**으로 전부 위임할 수 있다.  
- 이는 기존 원칙(“다이얼로그·토스트는 플레이그라운드 책임 가능, **콜백/props로 주입**”)과도 맞다.

---

## 2. 공개 API 방향 (안)

### 2.1 키 설계

- 평탄한 키 권장: `toolbar.newEr`, `toolbar.mode.logical`, `dialog.tableEdit.title`, `tableEdit.column.name`  
- 키는 **안정적인 식별자**로 두고, 표시 문자열만 로케일별로 바뀐다.  
- `packages/erd-designer`에 `i18n/keys.ts`(상수) + `i18n/types.ts`(허용 키 유니온)를 두면 타입 안전성 확보에 유리하다.

### 2.2 `ERDDesigner` / `TableEditDialog` 쪽 props (예시)

```ts
type LocaleCode = "ko" | "en" | (string & {});

type ERDDesignerI18n =
  | { locale: LocaleCode; translations?: Partial<Record<I18nKey, string>> }
  | { t: (key: I18nKey) => string };
```

- **`locale` + 선택적 `translations`**: 내장 번들을 고르고, 같은 키는 `translations`가 우선(깊은 병합은 불필요, 키 단위 덮어쓰기면 충분).  
- **`t`만 제공**: Host가 완전 통제(i18next, next-intl, 포맷 메시지 등과 연결). 이때 `locale`은 생략 가능.

해석 순서 제안: **`t`가 있으면 항상 `t`만 사용** → 없으면 `translations` 병합 → 없으면 내장 `locale` 번들 → 최종 폴백 `en`(또는 `ko`를 기본 폴백으로 정책 결정).

### 2.3 컨텍스트 vs props

- **React Context (`ErdDesignerI18nProvider`)**: `TableEditDialog` 등 깊은 트리에서 props drilling을 줄인다.  
- 루트 `ERDDesigner` props로 `locale`/`t`를 받아 Provider에 주입하는 형태가 일반적이다.

### 2.4 `erd-core`

- 사용자 향 문자열이 거의 없으면 **후순위**.  
- `analyzeDdlDocument` 등 **진단 메시지**를 다국어화할 경우:  
  - **코드(`DDL_REL_MISSING_COLUMNS`) + 파라미터**만 코어에서 반환하고, 문장 조합은 Host 또는 `erd-designer`의 번들에서 처리하는 방식이 재사용에 유리하다.  
- 또는 코어는 한글/영문 고정 + Host가 맵핑만 하는 최소 전략도 가능하다.

---

## 3. 번들·의존성

- **formatjs / i18next를 peer로 강제하지 않는다.** 문자열 함수 한 겹이면 충분한 경우가 많다.  
- 날짜·숫자 포맷이 필요해지면 Host의 `Intl` 또는 기존 앱 라이브러리에 맡긴다.  
- 내장 번들은 **트리셰이킹 가능한 모듈**로 분리(`import { ko } from '@rdbms-erd/designer/locales/ko'`)해, 사용하지 않는 언어를 번들에서 제외할 수 있게 하는 것이 이상적이다(구현 단계에서 결정).

---

## 4. 구현 단계(로드맵)

### Phase 0 — 정책 고정 (문서만)

- 폴백 로케일(`en` vs `ko`) 확정.  
- 키 네이밍 규칙·PR 리뷰 체크리스트(“새 UI 문자열 = 반드시 키 추가”)를 `docs`에 한 줄이라도 남긴다.

### Phase 1 — 인프라 + 디자이너 UI 일부

- `I18nKey` 타입 + `ko`/`en` 기본 맵.  
- `useErdT()` 또는 `t` context.  
- 툴바·주요 버튼·`TableEditDialog` 제목/버튼부터 치환(범위는 PR 단위로 쪼갠다).

### Phase 2 — 전 UI 스캔

- `ERDDesigner`, `TableEditDialog`, 토스트/힌트, `aria-label`/`title`까지 키화.  
- 플레이그라운드에서 `locale` 스위치(쿼리 또는 로컬 상태)로 회귀 테스트.

### Phase 3 — 문서·예제

- `docs/API.md`에 `locale` / `translations` / `t` 사용 예 추가.  
- Storybook 또는 playground 페이지에 “Host 전용 번역” 예제 한 개.

### Phase 4 (선택) — `erd-core` 진단 메시지

- 메시지 분리(코드 vs 표시) 또는 코어용 최소 번들.

---

## 5. 결론 요약

- **“Host만”** 또는 **“내장만”**보다 **하이브리드**가 유연하고 라이브러리 소비 패턴에 잘 맞는다.  
- **기본은 `locale` + 내장 소수 언어**, 엔터프라이즈·다른 스택은 **`t` 또는 `translations`로 주입**이 좋다.  
- 구현 시 **키 기반 + 타입**을 먼저 고정하고, UI를 점진적으로 옮기면 된다.

이 문서는 `DEVELOPMENT_PLAN.md`와 병행하며, 실제 구현 착수 시 PR 설명에 Phase를 명시하면 추적이 쉽다.
