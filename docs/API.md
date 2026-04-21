# 공개 API 개요

`@rdbms-erd/core`와 `@rdbms-erd/designer`를 호스트 앱에 붙일 때 쓰는 계약만 정리합니다. 상세 타입은 각 패키지의 `src`를 참고하세요.

## `@rdbms-erd/core`

| 심볼 | 설명 |
|------|------|
| `DesignDocument`, `DesignModel`, `TableModel`, … | JSON 문서와 모델 타입 |
| `createEmptyDesign(dialect?)` | 빈 설계 문서 |
| `createColumn(dialect, params)` | 컬럼 생성. `physicalName` 생략 시 논리명과 동일. SQL 물리 타입은 방언별 기본값 |
| `defaultPhysicalType`, `applyLogicalTypeChange` | 논리·물리(SQL) 타입 매핑 |
| `serializeDesign` / `parseDesign` / `validateDesignDocument` / `roundTripDesign` | 직렬화·검증 |
| `generateDdl`, `generateIndexDdl` | DDL 문자열 생성 |
| `analyzeDdlDocument`, `formatDdlDiagnostic`, `formatDdlDiagnostics` | DDL·인덱스 구조 진단 및 통일 포맷 텍스트 |
| `generateDdlWithDiagnostics`, `generateIndexDdlWithDiagnostics` | SQL + `analyzeDdlDocument` 결과 |
| `alignNodePositions`, `AlignCommand` | 멀티 선택 정렬·간격(순수 함수) |
| `createLargeDesign(count, dialect?)` | 부하·성능용 대형 샘플 |

## `@rdbms-erd/designer`

### `ERDDesigner`

React 클라이언트 컴포넌트(`"use client"`). `ReactFlowProvider`를 내부에서 감쌉니다.

**Props (`ERDDesignerProps`)**

- `value?: DesignDocument` — 외부에서 문서를 주입하면 스토어에 반영됩니다.
- `onChange?: (doc: DesignDocument) => void` — 스토어의 `doc`가 바뀔 때마다 호출됩니다.
- `onSaveJson?: (doc: DesignDocument) => void` — 툴바의「저장(JSON 이벤트)」버튼에서 호출됩니다.
- `onRequestCreateTable?: (x, y) => void` — 연결선을 노드 밖으로 드롭했을 때 호스트가 새 테이블 생성 UI를 열 수 있습니다.
- `toolbarSlots?: ToolbarSlots` — 툴바 슬롯 `slot1` … `slot5`(왼쪽에서 오른쪽, 내장 그룹 사이) + 오른쪽 끈 `trailing`. 상세는 루트 `README.md` Toolbar 섹션.
- `toolbarExtra?: React.ReactNode` — 오른쪽 끝 행에서 `trailing` 뒤, 패널 토글 앞에 이어서 렌더.
- `showRightPanel?: boolean` — 디자이너 내부의 ER 속성 우측 패널 표시 여부(기본 `false`).
- `locale?: string` — 내장 번들 로케일. `ko*` 접두면 한국어, 그 외 영어. `t`가 있으면 무시됩니다.
- `translations?: Partial<Record<I18nKey, string>>` — 로케일 번들 위 덮어쓰기(하이브리드 i18n).
- `t?: (key: I18nKey, vars?) => string` — 문자열 전부 호스트 `t`로 처리할 때 사용(`locale`/`translations` 무시).
- `largeDiagramThreshold?: number` — 테이블 개수가 이 값 이상이면 `onlyRenderVisibleElements`, 미니맵 비표시, 노드 요약(컬럼 편집 UI 생략) 등 대형 캔버스 모드. 기본 `120`.

**다국어·툴바 상세**는 루트 `README.md`(영문) 및 `docs/I18N_PLAN.md`, `docs/custom_action.md`를 참고하세요.

`onRequestNewEr`를 전달하지 않으면, `새 ER` 버튼은 디자이너 내부 기본 대화상자를 열어 프로젝트명/설명/방언을 받아 문서를 생성합니다.

### `TableEditDialog`

- `ERDDesigner` 내부에서는 `ErdI18nProvider`가 감싸므로 별도 설정 없이 동일 로케일이 적용됩니다.
- 디자이너 밖에서 단독 사용 시: `ErdI18nProvider`로 감싸거나 `locale` / `translations` / `t` props를 넘깁니다.

**Ref (`ERDDesignerHandle`)**

- `getJson(): DesignDocument` — 현재 문서 스냅샷
- `undo()` / `redo()` — 시간 여행 스토어와 동기화된 실행 취소/다시 실행
- `addTableAt(table, x, y)` — 호스트 다이얼로그 등에서 테이블을 캔버스 좌표에 삽입
- `connectWithForeignKey(sourceTableId, targetTableId, sourceColumnId?)` — FK 관계 연결

### `createDesignerStore(initialDialect?)`

Zustand 스토어 팩토리입니다. `ERDDesigner`는 인스턴스마다 한 번 생성해 사용합니다. 커스텀 UI를 만들 때 동일 패턴으로 재사용할 수 있습니다.

## 통합 예시

최소 동작은 `apps/playground/app/page.tsx`를 참고하면 됩니다.

- `value` + `onChange`로 제어 컴포넌트처럼 상태를 둡니다.
- `ref`로 `getJson` / `undo` / `redo`를 호출합니다.
- `onSaveJson`으로 저장 페이로드를 상위로 넘깁니다.
