"use client";

import { createColumn, createEmptyDesign, DesignDocument } from "@rdbms-erd/core";
import { ERDDesigner, ERDDesignerHandle } from "@rdbms-erd/designer";
import { useCallback, useRef, useState } from "react";

function createTestDesign(): DesignDocument {
  const doc = createEmptyDesign("postgres");

  const usersId = "col-users-id";
  const productsId = "col-products-id";
  const ordersId = "col-orders-id";

  doc.model.tables.push({
    id: "table-users",
    logicalName: "사용자",
    physicalName: "users",
    color: "#e0f2fe",
    columns: [
      createColumn("postgres", { id: usersId, logicalName: "사용자ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
      createColumn("postgres", { id: "col-users-email", logicalName: "이메일", physicalName: "email", logicalType: "TEXT", nullable: false }),
      createColumn("postgres", { id: "col-users-created-at", logicalName: "생성일시", physicalName: "created_at", logicalType: "DATETIME", nullable: false })
    ]
  });
  doc.model.tables.push({
    id: "table-products",
    logicalName: "상품",
    physicalName: "products",
    color: "#ede9fe",
    columns: [
      createColumn("postgres", { id: productsId, logicalName: "상품ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
      createColumn("postgres", { id: "col-products-name", logicalName: "상품명", physicalName: "name", logicalType: "TEXT", nullable: false }),
      createColumn("postgres", { id: "col-products-price", logicalName: "가격", physicalName: "price", logicalType: "FLOAT", nullable: false })
    ]
  });
  doc.model.tables.push({
    id: "table-orders",
    logicalName: "주문",
    physicalName: "orders",
    color: "#dcfce7",
    columns: [
      createColumn("postgres", { id: ordersId, logicalName: "주문ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
      createColumn("postgres", { id: "col-orders-user-id", logicalName: "사용자ID", physicalName: "user_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: usersId }),
      createColumn("postgres", { id: "col-orders-product-id", logicalName: "상품ID", physicalName: "product_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: productsId })
    ]
  });

  doc.model.relationships.push(
    { id: "rel-orders-users", sourceTableId: "table-users", targetTableId: "table-orders", sourceColumnId: usersId, targetColumnId: "col-orders-user-id" },
    { id: "rel-orders-products", sourceTableId: "table-products", targetTableId: "table-orders", sourceColumnId: productsId, targetColumnId: "col-orders-product-id" }
  );

  doc.model.indexes.push(
    { id: "idx-users-email", tableId: "table-users", name: "idx_users_email", columns: ["email"], unique: true },
    { id: "idx-orders-user-id", tableId: "table-orders", name: "idx_orders_user_id", columns: ["user_id"], unique: false }
  );

  doc.layout.nodePositions["table-users"] = { x: 120, y: 120 };
  doc.layout.nodePositions["table-products"] = { x: 120, y: 360 };
  doc.layout.nodePositions["table-orders"] = { x: 520, y: 220 };

  doc.settings = {
    ...(doc.settings ?? {}),
    projectName: "Playground Sample ER",
    projectDescription: "Users, Products, Orders sample"
  };

  return doc;
}

export default function Page() {
  const designerRef = useRef<ERDDesignerHandle>(null);
  const [design, setDesign] = useState<DesignDocument | undefined>(undefined);
  const [rightPanelEnabled, setRightPanelEnabled] = useState(true);
  const [locale, setLocale] = useState("ko");
  const [relationshipLinesVisible, setRelationshipLinesVisible] = useState(true);
  const handleDesignChange = useCallback((doc: DesignDocument) => {
    setDesign(doc);
  }, []);

  return (
    <main
      style={{
        height: "100vh",
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        background: "#f1f5f9",
        margin: 0
      }}
    >
      <section
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          padding: "10px 12px",
          borderBottom: "1px solid #e2e8f0",
          background: "#ffffff",
          fontSize: 13
        }}
      >
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={rightPanelEnabled}
            onChange={(e) => setRightPanelEnabled(e.target.checked)}
          />
          showRightPanel
        </label>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          locale
          <select value={locale} onChange={(e) => setLocale(e.target.value)} style={{ padding: "4px 8px" }}>
            <option value="ko">ko</option>
            <option value="en">en</option>
          </select>
        </label>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={relationshipLinesVisible}
            onChange={(e) => setRelationshipLinesVisible(e.target.checked)}
          />
          relationshipLinesVisible
        </label>
        <button
          type="button"
          onClick={() => setDesign(createTestDesign())}
          style={{ marginLeft: "auto", padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }}
        >
          테스트 ER 로드
        </button>
      </section>
      <section
        style={{
          minWidth: 0,
          minHeight: 0,
          padding: 12,
          position: "relative"
        }}
      >
        <div
          style={{
            height: "100%",
            minHeight: 0,
            width: "100%",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #e2e8f0",
            background: "#fff",
            boxShadow: "0 4px 24px rgba(15,23,42,0.06)"
          }}
        >
          <ERDDesigner
            ref={designerRef}
            value={design}
            onChange={handleDesignChange}
            showRightPanel={rightPanelEnabled}
            locale={locale}
            relationshipLinesVisible={relationshipLinesVisible}
            onRelationshipLinesVisibleChange={setRelationshipLinesVisible}
          />
        </div>
      </section>
    </main>
  );
}
