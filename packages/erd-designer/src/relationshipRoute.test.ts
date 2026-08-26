import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import {
    REL_MIN_SOURCE_DEPART,
    REL_MIN_TARGET_APPROACH,
    REL_SAME_SIDE_OUTER_MAX,
    buildRelationshipRouteInfo,
    defaultUndefinedDetourX,
} from "./relationshipRoute";

describe("relationshipRoute", () => {
    it("same-side Left with undefined ratio hugs tables (32px out)", () => {
        const sourceX = 800;
        const targetX = 820;
        const info = buildRelationshipRouteInfo({
            sourceX,
            sourceY: 100,
            sourcePosition: Position.Left,
            targetX,
            targetY: 400,
            targetPosition: Position.Left,
            ratio: undefined,
        });
        const expected = defaultUndefinedDetourX({
            sourceX,
            targetX,
            sourcePosition: Position.Left,
            targetPosition: Position.Left,
        });
        expect(expected).toBe(
            Math.min(
                sourceX - REL_MIN_SOURCE_DEPART,
                targetX - REL_MIN_TARGET_APPROACH,
            ),
        );
        expect(info.pivotHandleX).toBe(expected);
        expect(Math.min(sourceX, targetX) - info.pivotHandleX).toBe(
            REL_MIN_SOURCE_DEPART,
        );
    });

    it("same-side Left with ratio 0.5 stays within REL_SAME_SIDE_OUTER_MAX", () => {
        const sourceX = 800;
        const targetX = 800;
        const info = buildRelationshipRouteInfo({
            sourceX,
            sourceY: 100,
            sourcePosition: Position.Left,
            targetX,
            targetY: 400,
            targetPosition: Position.Left,
            ratio: 0.5,
        });
        const distance = sourceX - info.pivotHandleX;
        expect(distance).toBeLessThanOrEqual(REL_SAME_SIDE_OUTER_MAX);
        expect(distance).toBeGreaterThanOrEqual(REL_MIN_SOURCE_DEPART);
        // mid of [tables-260, tables-32] ≈ tables-146
        expect(distance).toBeCloseTo(
            (REL_SAME_SIDE_OUTER_MAX + REL_MIN_SOURCE_DEPART) / 2,
            5,
        );
    });

    it("opposite Right→Left with undefined/0.5 places detour between tables", () => {
        const sourceX = 200;
        const targetX = 600;
        const undefinedInfo = buildRelationshipRouteInfo({
            sourceX,
            sourceY: 100,
            sourcePosition: Position.Right,
            targetX,
            targetY: 200,
            targetPosition: Position.Left,
            ratio: undefined,
        });
        const midInfo = buildRelationshipRouteInfo({
            sourceX,
            sourceY: 100,
            sourcePosition: Position.Right,
            targetX,
            targetY: 200,
            targetPosition: Position.Left,
            ratio: 0.5,
        });
        expect(undefinedInfo.pivotHandleX).toBeGreaterThan(sourceX);
        expect(undefinedInfo.pivotHandleX).toBeLessThan(targetX);
        expect(midInfo.pivotHandleX).toBeGreaterThan(sourceX);
        expect(midInfo.pivotHandleX).toBeLessThan(targetX);
        expect(undefinedInfo.pivotHandleX).toBeCloseTo(
            (sourceX + REL_MIN_SOURCE_DEPART + targetX - REL_MIN_TARGET_APPROACH) /
                2,
            5,
        );
    });
});
