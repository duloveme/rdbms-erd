# Host 커스텀 버튼·액션 확장 계획

호스트 앱이 ERD 툴바(및 향후 다른 영역)에 **자체 버튼·메뉴·배지**를 넣을 때의 방향과 단계별 계획이다.  
(사용자 정의 **비즈니스 로직**은 Host에 두고, 라이브러리는 **삽입 지점·문서 읽기 수단**을 제공하는 것이 목표다.)

---

## 1. 현재 상태

- `ERDDesignerProps.toolbarExtra?: React.ReactNode`  
  - 툴바 **맨 오른쪽**(`marginLeft: "auto"`)에 한 블록만 삽입 가능하다.  
  - `apps/playground`는 패널 토글 버튼을 여기에 넣는다.
- 한계:
  - **위치가 하나**뿐이라 “정렬 그룹 옆”“저장 버튼 왼쪽” 등 세밀한 배치가 어렵다.
  - **여러 액션**을 넣을 때 Host가 직접 flex·그룹을 구성해야 한다(중복 래퍼가 생기기 쉬움).
  - 버튼 클릭 시 **최신 `DesignDocument`**가 필요하면 `ref.getJson()`을 Host가 들고 있어야 한다(이미 가능).

---

## 2. 목표 UX

| 요구 | 설명 |
|------|------|
| 여러 커스텀 버튼 | Host가 배열·Fragment로 넣거나, 라이브러리가 **슬롯 이름**을 제공 |
| 위치 선택 | 예: `start` \| `afterPrimary` \| `afterClipboard` \| `end`(기본) |
| 스타일 일관 | `erd-toolbar-btn` 등 기존 클래스 재사용을 문서화 |
| 문서 접근 | `ref.getJson()` 유지 + 선택적으로 **렌더 시 스냅샷** 또는 **읽기 전용 context** |
| 비침투 | 기본 툴바 동작·키보드 단축키는 깨지지 않아야 함 |

---

## 3. 설계 옵션 비교

### A. `toolbarExtra`만 강화 (최소 변경)

- **추가 props 없이** 문서만 보강: “여러 버튼은 Fragment + `div.erd-toolbar-group`으로 묶는다”.
- 장점: 구현 비용 제로.  
- 단점: 위치 제어는 Host 마크업에 전적으로 의존.

### B. 명시적 슬롯 (권장 1단계)

```ts
toolbarSlots?: {
  slot1?: React.ReactNode;
  slot2?: React.ReactNode;
  slot3?: React.ReactNode;
  slot4?: React.ReactNode;
  slot5?: React.ReactNode;
  trailing?: React.ReactNode;
};
```

- 내부 툴바 JSX를 **고정된 flex 구간**으로 나누고, 각 경계에 `slot1` … `slot5`와 오른쪽 `trailing`을 삽입한다. 순서는 `ERDDesigner` / `README.md` 참고.
- **`toolbarExtra`**는 오른쪽 끈 행에서 `trailing` 뒤에 이어진다.

### C. 선언적 액션 배열 + 선택적 렌더러

```ts
type ToolbarCustomAction = {
  id: string;
  placement: "slot1" | "slot2" | "slot3" | "slot4" | "slot5" | "trailing";
  order?: number;
  label: string;
  icon?: React.ReactNode;
  title?: string;
  disabled?: boolean;
  variant?: "default" | "primary";
  onClick: (ctx: { getDoc: () => DesignDocument }) => void;
};

toolbarActions?: ToolbarCustomAction[];
```

- 라이브러리가 **버튼 DOM**을 생성 → 스타일·접근성 일관.  
- 단점: 표현력이 `ReactNode`보다 좁고, 드롭다운·복합 위젯은 확장 필드가 필요하다.

### D. Render props / Context

```ts
renderToolbar?: (api: {
  doc: DesignDocument; // 스냅샷 주의: 리렌더 시 갱신
  getDoc: () => DesignDocument;
}) => React.ReactNode;
```

- **전체 툴바를 대체**하면 유지보수 부담이 크므로 비권장.  
- **부분 슬롯만** `renderToolbarTrailing(api)` 형태는 B와 조합 가능.

---

## 4. 권장 로드맵

### Phase 0 — 문서·API 정리

- `docs/API.md`에 `toolbarExtra` 위치·권장 마크업(`erd-toolbar-group`) 명시.  
- “커스텀 버튼에서 `ref.getJson()` 사용” 패턴 예시 추가.

### Phase 1 — `toolbarSlots` (또는 동등 이름)

- `slot1` … `slot5` + `trailing` 구간 도입.  
- `toolbarExtra` → `trailing` 뒤에 이어서 렌더.

### Phase 2 — (선택) `toolbarActions` 선언형

- 자주 쓰는 “단일 버튼 N개” 패턴을 데이터로 표현.  
- 내부 구현은 기존 `erd-toolbar-btn` 클래스 사용.

### Phase 3 — (선택) Context

- `ErdDesignerChromeContext`에 `getDoc`, `hasDesign`, `isDirty` 등 **읽기 전용** API만 노출.  
- 커스텀 노드가 깊어질 때 props drilling 완화.

---

## 5. 비목표·주의

- **전체 툴바 교체**는 공식 API로 노출하지 않는 것이 좋다(내부 버튼 추가 시 깨짐 방지).  
- Host가 넣는 `onClick`에서 **스토어를 직접 mutate**하지 말고, 가능하면 `onChange`로 문서를 돌려주는 제어 패턴을 권장한다(단, ref 기반 명령형 API가 늘어나면 별도 문서화).  
- **보안**: Host가 제공하는 `ReactNode`는 Host 책임이며, 라이브러리는 `dangerouslySetInnerHTML`을 쓰지 않는 한 XSS 표면이 제한적이다.

---

## 6. 요약

- **즉시 가능**: `toolbarExtra` + `ref`로 대부분의 “커스텀 버튼”은 이미 구현 가능하다.  
- **다음 단계**: 위치 제어를 위해 **`toolbarSlots`류의 명시적 슬롯**을 도입하는 것이 비용 대비 효과가 크다.  
- **그 다음**: 필요 시 선언적 `toolbarActions` 또는 얇은 **Context**로 확장한다.

구현 착수 시 이 문서의 Phase를 PR 제목/본문에 맞추면 추적이 쉽다.
