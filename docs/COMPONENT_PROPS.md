# 컴포넌트·팩토리 Props 상세 (`@rdbms-erd/designer`)

소스(`packages/erd-designer/src`) 기준으로 **호스트가 props로 조절할 수 있는 공개 계약**을 정리한다.  
(`@rdbms-erd/core`는 React 컴포넌트가 없으므로 이 문서 범위에서 제외한다.)

**패키지 진입점**: `package.json`의 `exports["."]` → `./src/index.ts`  
**현재 export**: `ERDDesigner`, `TableEditDialog`, `createDesignerStore`, 타입 `ERDDesignerProps`, `ERDDesignerHandle`, `CanvasDisplayMode`, `CreateTableRequestPayload`  
(`TableEditDialogProps`는 `index.ts`에서 re-export되지 않지만, 아래에 소스 기준으로 기술한다.)

---

## 1. `ERDDesigner`

`forwardRef<ERDDesignerHandle, ERDDesignerProps>`이며, 루트에서 **`ReactFlowProvider`로 한 번 감싼 뒤** 내부 `ERDDesignerInner`에 props를 그대로 전달한다(`ERDDesigner.tsx` 하단).

### 1.1 Ref — `ERDDesignerHandle`

| 메서드 | 시그니처 | 동작(소스 근거) |
|--------|----------|-----------------|
| `getJson` | `() => DesignDocument` | `useDesignerStore`의 현재 `doc` 스냅샷. |
| `undo` | `() => void` | `useDesignerStore.temporal.getState().undo()` |
| `redo` | `() => void` | `useDesignerStore.temporal.getState().redo()` |
| `addTableAt` | `(table, x, y) => void` | `hasDesign`이 false면 no-op. 그 외 `addTable(table, x, y)`. |
| `connectWithForeignKey` | `(sourceTableId, targetTableId, sourceColumnId?) => void` | PK→FK 연결·컬럼 생성·관계 추가. 동일 테이블·PK 없음 등은 조기 return. |

설계 문서·Undo와의 관계는 `docs/API.md`, `docs/DEVELOPMENT_PLAN.md`와 함께 본다.

### 1.2 Props — `ERDDesignerProps`

#### `value?: DesignDocument`

- **의미**: 제어 컴포넌트처럼 외부 문서를 스토어에 반영한다.
- **`undefined` / 생략**: `useEffect`에서 `setHasDesign(false)` 등으로 **빈 화면·툴바 비활성** 상태로 돌아간다(`value` falsy 분기).
- **객체가 들어올 때**: `serializeDesign(value)`로 시그니처를 만들고, 직전 `onChange`로 나간 문서와 동일하면(`echoedFromLocalChange`) `savedSignature`를 덮어쓰지 않아 **불필요한 “저장됨” 리셋**을 피한다. 그 외에는 외부에서 새 문서가 온 것으로 보고 `setSavedSignature`를 갱신한다.
- **동기화**: `temporal.pause()` → `setDoc(value)` → `temporal.resume()` 후 `docSyncFromValueRef`로 한 틱 동안 `onChange` echo를 막는다.

#### `onChange?: (doc: DesignDocument) => void`

- **호출 시점**: `hasDesign === true`이고, `docSyncFromValueRef`가 아닐 때, 스토어의 `doc`가 바뀐 뒤 `useEffect`에서 호출된다.
- **용도**: Host가 `value`와 함께 쓰는 제어 상태 업데이트.

#### `onSaveJson?: (doc: DesignDocument) => void`

- **호출 시점**: 툴바 **저장(JSON)** 버튼 클릭 시. 단, `toolbarDisabled \|\| !isDirty`이면 버튼이 비활성이라 호출되지 않는다.
- **인자**: 클릭 시점의 현재 `doc`.
- **참고**: 버튼 클릭 핸들러에서 `setSavedSignature(serializeDesign(doc))`까지 내부에서 처리해 “저장됨” 상태로 맞춘다.

#### `onRequestNewEr?: (currentDialect: RdbmsDialect) => void`

- **의미**: **있으면** 툴바 “새 ER” 클릭 시 **내부 `createNewEr` 대신** 이 콜백만 호출한다. 인자는 현재 문서의 `doc.model.dialect`.
- **없으면**: 라이브러리가 `createEmptyDesign(doc.model.dialect)`로 문서를 비우고 temporal 히스토리를 clear하는 기본 동작을 수행한다.

#### `onRequestCreateTable?: (payload: CreateTableRequestPayload) => void`

- **의미**: 연결 핸들에서 드래그해 **빈 캔버스(노드 밖)**에 드롭했을 때 호출. Host가 새 테이블 다이얼로그 등을 연다.
- **`CreateTableRequestPayload`** (`ERDDesigner.tsx` export):

| 필드 | 타입 | 설명 |
|------|------|------|
| `flowX`, `flowY` | `number` | React Flow 좌표계 위치. |
| `screenX`, `screenY` | `number` | 화면 좌표(모달 위치 등에 사용 가능). |
| `sourceTableId?` | `string` | 드롭 시점에 PK가 있을 때만: 연결 시작 테이블 id. |
| `sourceColumnId?` | 타입에 있으나 현재 `onConnectEnd` payload 구성에서는 **채우지 않음**(예약 필드). |
| `sourcePrimaryColumnIds?` | `string[]` | 소스 테이블의 PK 컬럼 id 목록(빈 배열이면 `sourceTableId`도 의미 없음). |

- **미제공 시**: 드롭해도 콜백 없음 → 새 테이블 플로우 없음.

#### `toolbarExtra?: React.ReactNode`

- **위치**: 툴바 flex 영역에서 **`marginLeft: "auto"`인 마지막 `div`** 안에 렌더된다. 즉 **오른쪽 끝 슬롯 하나**.
- **용도**: Host 전용 버튼·메뉴(플레이그라운드의 우측 패널 토글 등).

#### `largeDiagramThreshold?: number`

- **기본값**: `120` (`ERDDesignerInner` 파라미터 기본값).
- **의미**: `doc.model.tables.length >= largeDiagramThreshold`이면 **대형 다이어그램 모드**(`largeDiagram === true`).
- **영향(소스)**:
  - `ReactFlow`에 `onlyRenderVisibleElements={largeDiagram}`.
  - `largeDiagram`이면 `MiniMap` 비표시, `defaultViewport`를 `{ x: 40, y: 40, zoom: 0.22 }`로 고정.
  - 테이블 노드 `data.compact === true` → 컬럼 목록 대신 요약 한 줄.
  - `onFlowInit`에서 `fitView` 생략(대형일 때).

#### `relationshipLinesVisible?: boolean`

- **의미**: **지정 시 제어 모드**. 전역 관계선 표시 여부를 Host가 직접 제어한다.
- **미지정 시**: 내부 `useState(defaultRelationshipLinesVisible)`로 비제어.

#### `defaultRelationshipLinesVisible?: boolean`

- **기본값**: `true`.
- **적용**: `relationshipLinesVisible`이 **없을 때만** 초기 내부 상태에 사용된다.

#### `onRelationshipLinesVisibleChange?: (visible: boolean) => void`

- **호출**: 툴바 토글에서 `setShowRelationshipLines(next)` 호출 시 **항상** `next`와 함께 호출된다(제어/비제어 공통).
- **연동 효과**: `showRelationshipLines`가 `false → true`로 바뀌는 effect에서 `revealAllFkRelationLinesInDoc()`를 호출해, FK 컬럼의 `showFkRelationLine === false`를 문서에서 제거한다.

### 1.3 Props로 직접 노출되지 않는 내부 상태 (참고)

다음은 **현재 public props가 없고** UI 내부 상태다. 확장이 필요하면 별도 이슈/문서(`docs/custom_action.md`)에서 논의한다.

- 캔버스 **논리/물리 표시 모드** (`displayMode`): 툴바 토글만.
- **선택·드래그 선택 무장** 등.
- **`TableEditDialog`**: `ERDDesigner`가 `editingTableId` / `creatingTableDraft`에 따라 내부에서 연다(Host가 별도로 마운트할 필요 없음).

---

## 2. `TableEditDialog`

`packages/erd-designer/src/TableEditDialog.tsx`의 `TableEditDialogProps`.  
**독립 사용** 가능(플레이그라운드에서 새 테이블 드래프트 편집 등). `ERDDesigner`는 내부적으로도 동일 컴포넌트를 사용한다.

| Prop | 타입 | 설명 |
|------|------|------|
| `open` | `boolean` | `false`이거나 `table`이 없으면 `null` 렌더. |
| `table` | `TableModel \| null` | 편집 대상. `open && table`일 때만 본문 표시. |
| `dialect` | `RdbmsDialect` | `createColumn`·물리 타입 기본값에 사용. |
| `displayMode` | `CanvasDisplayMode` | `"logical"` \| `"physical"` — 컬럼 그리드 열 구성·이름 필드가 달라진다. |
| `onClose` | `() => void` | 닫기·취소·저장 후 호출은 Host/부모 책임(내부 저장 버튼에서 `onSave` 후 `onClose` 호출). |
| `onSave` | `(table: TableModel) => void` | 저장 시 **정규화된** 테이블(빈 이름 컬럼 제거, 비어 있으면 기본 `컬럼1` 한 줄)을 넘긴다. |

**동작 메모**

- 열릴 때 `cloneTable` + 맨 아래 **빈 컬럼 행**을 보장하는 로직이 있다.
- `displayMode === "logical"`에서 이름 변경 시 물리명이 논리명과 같았으면 물리명도 동기화한다.

---

## 3. `createDesignerStore` (팩토리 인자)

React 컴포넌트는 아니지만, **커스텀 캔버스 UI**를 만들 때 동일 스토어를 쓸 수 있다(`docs/API.md`).

```ts
createDesignerStore(initialDialect?: RdbmsDialect)
```

- **기본값**: `"mssql"` (`createDesignerStore.ts`).
- **의미**: 초기 `doc`가 `createEmptyDesign(initialDialect)`로 생성된다.

스토어 메서드 전체는 `DesignerState` 인터페이스(`createDesignerStore.ts`)를 참고한다. 대표적으로 `setDoc`, `addTable`, `removeTable`, `addRelationship`, `removeRelationship`, `setTableMeta`, `setTableColumns`, `revealAllFkRelationLinesInDoc`, `alignSelected`, `setNodePosition` 등.

---

## 4. 제어·비제어 요약

| 영역 | 제어 | 비제어 / 내부 |
|------|------|----------------|
| 설계 문서 `value` | `value` + `onChange` 권장 | `value` 없으면 “새 ER” 전까지 빈 화면 |
| 관계선 표시 | `relationshipLinesVisible` + `onRelationshipLinesVisibleChange` | `defaultRelationshipLinesVisible`만 |

---

## 5. 스타일·테마

공개 props로 **테마 객체는 없다**. 토큰은 `designer.css`의 `.erd-root` CSS 변수(`--erd-primary` 등)이며, Host가 상위에서 클래스/변수를 덮어쓰는 방식이 현재 확장 경로다.

---

## 6. 관련 문서

- `docs/API.md` — 요약 API
- `docs/I18N_PLAN.md` — 문자열 다국어(향후 `locale` / `t` 등)
- `docs/custom_action.md` — 툴바 커스텀 확장(슬롯 등)

이 문서는 구현 변경 시 함께 갱신하는 것을 권장한다.
