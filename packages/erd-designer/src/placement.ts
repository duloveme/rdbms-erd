import type { ReactFlowInstance } from "@xyflow/react";

/** `TableNode` / `relationshipEdges`와 동일한 테이블 카드 레이아웃 상수 */
const NODE_HEADER_PX = 39;
const NODE_BODY_PAD_TOP = 2;
const NODE_BODY_PAD_BOTTOM = 4;
const NODE_ROW_PX = 36;

/**
 * 비-compact 테이블 노드의 대략적인 높이(px). 뷰포트 세로 중앙 배치에 사용한다.
 */
export function estimateTableNodeHeightPx(columnCount: number): number {
    const rows = Math.max(1, columnCount);
    return (
        NODE_HEADER_PX +
        NODE_BODY_PAD_TOP +
        rows * NODE_ROW_PX +
        NODE_BODY_PAD_BOTTOM
    );
}

/** React Flow pane — `erd-canvas-inner` 안의 `.react-flow` 우선 */
export function resolveFlowPaneElement(canvasRoot: ParentNode): HTMLElement {
    if (canvasRoot instanceof HTMLElement) {
        return (
            canvasRoot.querySelector<HTMLElement>(".react-flow") ?? canvasRoot
        );
    }
    return canvasRoot as HTMLElement;
}

/**
 * **현재** 뷰포트(팬·줌 반영)에서 보이는 pane 중앙의 flow 좌표(노드 position, 좌상단).
 */
export function flowPositionAtViewportCenter(
    inst: Pick<ReactFlowInstance, "getViewport">,
    paneEl: Pick<HTMLElement, "getBoundingClientRect">,
    tableWidth: number,
    tableNodeHeightPx: number,
): { x: number; y: number } {
    const { width, height } = paneEl.getBoundingClientRect();
    const { x: vx, y: vy, zoom } = inst.getViewport();
    const zoomSafe = zoom === 0 ? 1 : zoom;
    const centerFlowX = (width / 2 - vx) / zoomSafe;
    const centerFlowY = (height / 2 - vy) / zoomSafe;
    return {
        x: centerFlowX - tableWidth / 2,
        y: centerFlowY - tableNodeHeightPx / 2,
    };
}