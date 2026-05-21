import { describe, expect, it } from "vitest";
import {
    estimateTableNodeHeightPx,
    flowPositionAtViewportCenter,
} from "./placement";

describe("estimateTableNodeHeightPx", () => {
    it("uses at least one body row when there are no columns", () => {
        expect(estimateTableNodeHeightPx(0)).toBe(39 + 2 + 36 + 4);
    });

    it("scales with column count", () => {
        expect(estimateTableNodeHeightPx(2)).toBe(39 + 2 + 72 + 4);
    });
});

describe("flowPositionAtViewportCenter", () => {
    it("uses getViewport pan/zoom so pane center maps to flow coords", () => {
        const inst = {
            getViewport: () => ({ x: 80, y: 40, zoom: 2 }),
        };
        const paneEl = {
            getBoundingClientRect: () => ({
                left: 0,
                top: 0,
                width: 400,
                height: 300,
                right: 400,
                bottom: 300,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        };
        const height = 120;
        const pos = flowPositionAtViewportCenter(inst, paneEl, 200, height);
        expect(pos).toEqual({
            x: (200 - 80) / 2 - 100,
            y: (150 - 40) / 2 - height / 2,
        });
    });
});
