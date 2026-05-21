import { describe, expect, it } from "vitest";
import { createEmptyDesign, serializeDesign } from "@rdbms-erd/core";
import { createDesignerStore } from "./createDesignerStore";

describe("host controlled document stability", () => {
    it("addTable appends without replacing existing tables", () => {
        const useStore = createDesignerStore({ initialDialect: "postgres" });
        const initial = createEmptyDesign("postgres");
        initial.model.tables.push({
            id: "t-existing",
            logicalName: "Existing",
            physicalName: "existing",
            columns: [],
        });
        useStore.getState().setDoc(initial);

        useStore.getState().addTable(
            {
                id: "t-new",
                logicalName: "New",
                physicalName: "new",
                columns: [],
            },
            100,
            100,
        );

        const tables = useStore.getState().doc.model.tables;
        expect(tables).toHaveLength(2);
        expect(tables.map((t) => t.id).sort()).toEqual(["t-existing", "t-new"]);
    });

    it("getCoreOptions allows stable store while reading latest options", () => {
        const options = { defaultPhysicalTypes: { TEXT: "NVARCHAR(99)" } };
        const getCoreOptions = () => options;
        const useStore = createDesignerStore({
            initialDialect: "mssql",
            getCoreOptions,
        });
        const doc1 = useStore.getState().doc;
        options.defaultPhysicalTypes = { TEXT: "NVARCHAR(100)" };
        const doc2 = useStore.getState().doc;
        expect(doc1).toBe(doc2);
    });
});

describe("serializeDesign echo detection", () => {
    it("same doc content produces identical signature after local edit", () => {
        const useStore = createDesignerStore({ initialDialect: "postgres" });
        const doc = createEmptyDesign("postgres");
        doc.model.tables.push({
            id: "a",
            logicalName: "A",
            physicalName: "a",
            columns: [],
        });
        useStore.getState().setDoc(doc);
        useStore.getState().addTable(
            {
                id: "b",
                logicalName: "B",
                physicalName: "b",
                columns: [],
            },
            0,
            0,
        );
        const fromStore = useStore.getState().doc;
        const sig1 = serializeDesign(fromStore);
        const sig2 = serializeDesign(fromStore);
        expect(sig1).toBe(sig2);
    });
});
