# 구현 대기 (Agent 모드에서 적용)

## 1. 테이블 소실 방지

### createDesignerStore.ts
- `getCoreOptions?: () => CoreDbMetaOptions | undefined` 추가
- `resolveCoreOptions()`로 `setColumnLogicalType`에서 사용

### ERDDesigner.tsx
- `coreOptionsRef` + store `useMemo(..., [])` 고정
- `value` 동기화: `echoedFromLocalChange`이면 `setDoc` 스킵 후 return

## 2. 빈 컬럼 테이블 허용

### TableEditDialog.tsx normalizeTableForSave
- `filtered.length === 0`일 때 기본 컬럼 생성 분기 제거
- `const baseColumns = draft.columns.filter((c) => !columnNamesBlank(c));`
