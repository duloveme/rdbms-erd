import { Position } from "@xyflow/react";

export type RelationshipRouteInfo = {
    path: string;
    pivotHandleX: number;
    pivotHandleY: number;
    primaryAxis: "x" | "y";
};

export function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0.5;
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    return value;
}

export function lerp(a: number, b: number, ratio: number): number {
    return a + (b - a) * ratio;
}

const REL_OUTER_MIN = 80;
export const REL_OUTER_MAX = 260;
/** 같은 쪽 우회 시 테이블에서 최대로 멀어질 수 있는 거리(피벗 드래그 여유). */
export const REL_SAME_SIDE_OUTER_MAX = REL_OUTER_MAX;
const REL_INNER_MARGIN = 12;
const REL_MIN_INNER_SPAN = 18;
export const REL_MIN_SOURCE_DEPART = 32;
export const REL_MIN_TARGET_APPROACH = 32;

export function horizontalDetourRange(params: {
    sourceX: number;
    targetX: number;
    sourcePosition: Position;
    targetPosition: Position;
}): { min: number; max: number } {
    const { sourceX, targetX, sourcePosition, targetPosition } = params;
    const sameSide = sourcePosition === targetPosition;
    if (sameSide) {
        if (sourcePosition === Position.Left) {
            const maxDetour = Math.min(
                sourceX - REL_MIN_SOURCE_DEPART,
                targetX - REL_MIN_TARGET_APPROACH,
            );
            const minDetour =
                Math.min(sourceX, targetX) - REL_SAME_SIDE_OUTER_MAX;
            if (minDetour < maxDetour) {
                return { min: minDetour, max: maxDetour };
            }
            return { min: maxDetour, max: maxDetour };
        }
        const minDetour = Math.max(
            sourceX + REL_MIN_SOURCE_DEPART,
            targetX + REL_MIN_TARGET_APPROACH,
        );
        const maxDetour = Math.max(sourceX, targetX) + REL_SAME_SIDE_OUTER_MAX;
        if (minDetour < maxDetour) {
            return { min: minDetour, max: maxDetour };
        }
        return { min: minDetour, max: minDetour };
    }
    if (sourcePosition === Position.Right && targetPosition === Position.Left) {
        // 반대편 테이블 사이에서 source 출발/target 진입 최소 길이를 우선 보장한다.
        const minDepart = Math.max(REL_INNER_MARGIN, REL_MIN_SOURCE_DEPART);
        const minApproach = Math.max(REL_INNER_MARGIN, REL_MIN_TARGET_APPROACH);
        const innerMin = sourceX + minDepart;
        const innerMax = targetX - minApproach;
        if (innerMax - innerMin >= REL_MIN_INNER_SPAN)
            return { min: innerMin, max: innerMax };
        // 공간이 부족하면 중앙에 고정해 양쪽 길이를 최대한 균형 있게 확보한다.
        const corridorMin = sourceX + REL_INNER_MARGIN;
        const corridorMax = targetX - REL_INNER_MARGIN;
        if (corridorMax > corridorMin) {
            const center = (corridorMin + corridorMax) / 2;
            return { min: center, max: center };
        }
    }
    if (sourcePosition === Position.Left && targetPosition === Position.Right) {
        const minDepart = Math.max(REL_INNER_MARGIN, REL_MIN_SOURCE_DEPART);
        const minApproach = Math.max(REL_INNER_MARGIN, REL_MIN_TARGET_APPROACH);
        const innerMin = targetX + minApproach;
        const innerMax = sourceX - minDepart;
        if (innerMax - innerMin >= REL_MIN_INNER_SPAN)
            return { min: innerMin, max: innerMax };
        const corridorMin = targetX + REL_INNER_MARGIN;
        const corridorMax = sourceX - REL_INNER_MARGIN;
        if (corridorMax > corridorMin) {
            const center = (corridorMin + corridorMax) / 2;
            return { min: center, max: center };
        }
    }
    if (sourcePosition === Position.Left) {
        return { min: sourceX - REL_OUTER_MAX, max: sourceX - REL_OUTER_MIN };
    }
    return { min: sourceX + REL_OUTER_MIN, max: sourceX + REL_OUTER_MAX };
}

export function defaultUndefinedDetourX(params: {
    sourceX: number;
    targetX: number;
    sourcePosition: Position;
    targetPosition: Position;
}): number {
    const { sourceX, targetX, sourcePosition, targetPosition } = params;
    if (sourcePosition === targetPosition) {
        if (sourcePosition === Position.Left) {
            return Math.min(
                sourceX - REL_MIN_SOURCE_DEPART,
                targetX - REL_MIN_TARGET_APPROACH,
            );
        }
        return Math.max(
            sourceX + REL_MIN_SOURCE_DEPART,
            targetX + REL_MIN_TARGET_APPROACH,
        );
    }
    if (sourcePosition === Position.Right && targetPosition === Position.Left) {
        const minX = sourceX + REL_MIN_SOURCE_DEPART;
        const maxX = targetX - REL_MIN_TARGET_APPROACH;
        if (minX <= maxX) return (minX + maxX) / 2;
        return minX;
    }
    if (sourcePosition === Position.Left && targetPosition === Position.Right) {
        const minX = targetX + REL_MIN_TARGET_APPROACH;
        const maxX = sourceX - REL_MIN_SOURCE_DEPART;
        if (minX <= maxX) return (minX + maxX) / 2;
        return maxX;
    }
    return (sourceX + targetX) / 2;
}

export function buildRelationshipRouteInfo(params: {
    sourceX: number;
    sourceY: number;
    sourcePosition: Position;
    targetX: number;
    targetY: number;
    targetPosition: Position;
    ratio: number | undefined;
}): RelationshipRouteInfo {
    const {
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        ratio,
    } = params;
    if (targetPosition === Position.Left || targetPosition === Position.Right) {
        const range = horizontalDetourRange({
            sourceX,
            targetX,
            sourcePosition,
            targetPosition,
        });
        const normalized =
            typeof ratio === "number" && Number.isFinite(ratio)
                ? clamp01(ratio)
                : 0.5;
        const detourX =
            ratio === undefined
                ? defaultUndefinedDetourX({
                      sourceX,
                      targetX,
                      sourcePosition,
                      targetPosition,
                  })
                : lerp(range.min, range.max, normalized);
        return {
            path: `M ${sourceX} ${sourceY} L ${detourX} ${sourceY} L ${detourX} ${targetY} L ${targetX} ${targetY}`,
            pivotHandleX: detourX,
            pivotHandleY: (sourceY + targetY) / 2,
            primaryAxis: "x",
        };
    }
    const normalized =
        typeof ratio === "number" && Number.isFinite(ratio)
            ? clamp01(ratio)
            : 0.5;
    const pivotY = lerp(sourceY, targetY, normalized);
    return {
        path: `M ${sourceX} ${sourceY} L ${sourceX} ${pivotY} L ${targetX} ${pivotY} L ${targetX} ${targetY}`,
        pivotHandleX: (sourceX + targetX) / 2,
        pivotHandleY: pivotY,
        primaryAxis: "y",
    };
}
