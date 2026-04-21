"use client";

import {
    createColumn,
    createEmptyDesign,
    DesignDocument,
} from "@rdbms-erd/core";
import { ERDDesigner, ERDDesignerHandle } from "@rdbms-erd/designer";
import { useCallback, useRef, useState } from "react";

function createTestDesign(): DesignDocument {
    const doc = createEmptyDesign("postgres");

    // PK ids for relationship wiring
    const warehouseId = "col-warehouses-id";
    const zoneId = "col-zones-id";
    const locationId = "col-locations-id";
    const supplierId = "col-suppliers-id";
    const productId = "col-products-id";
    const inboundReceiptId = "col-inbound-receipts-id";
    const inboundReceiptItemId = "col-inbound-receipt-items-id";
    const outboundOrderId = "col-outbound-orders-id";
    const outboundOrderItemId = "col-outbound-order-items-id";
    const inventoryBalanceId = "col-inventory-balances-id";
    const stockMovementId = "col-stock-movements-id";
    const cycleCountId = "col-cycle-counts-id";
    const cycleCountItemId = "col-cycle-count-items-id";

    doc.model.tables.push(
        {
            id: "table-warehouses",
            logicalName: "창고",
            physicalName: "warehouses",
            color: "#e0f2fe",
            columns: [
                createColumn("postgres", { id: warehouseId, logicalName: "창고ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-warehouses-code", logicalName: "창고코드", physicalName: "code", logicalType: "TEXT", nullable: false }),
                createColumn("postgres", { id: "col-warehouses-name", logicalName: "창고명", physicalName: "name", logicalType: "TEXT", nullable: false }),
            ],
        },
        {
            id: "table-zones",
            logicalName: "존",
            physicalName: "zones",
            color: "#dbeafe",
            columns: [
                createColumn("postgres", { id: zoneId, logicalName: "존ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-zones-warehouse-id", logicalName: "창고ID", physicalName: "warehouse_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: warehouseId }),
                createColumn("postgres", { id: "col-zones-name", logicalName: "존명", physicalName: "name", logicalType: "TEXT", nullable: false }),
            ],
        },
        {
            id: "table-locations",
            logicalName: "로케이션",
            physicalName: "locations",
            color: "#bfdbfe",
            columns: [
                createColumn("postgres", { id: locationId, logicalName: "로케이션ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-locations-zone-id", logicalName: "존ID", physicalName: "zone_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: zoneId }),
                createColumn("postgres", { id: "col-locations-code", logicalName: "로케이션코드", physicalName: "code", logicalType: "TEXT", nullable: false }),
            ],
        },
        {
            id: "table-suppliers",
            logicalName: "공급사",
            physicalName: "suppliers",
            color: "#ede9fe",
            columns: [
                createColumn("postgres", { id: supplierId, logicalName: "공급사ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-suppliers-code", logicalName: "공급사코드", physicalName: "code", logicalType: "TEXT", nullable: false }),
                createColumn("postgres", { id: "col-suppliers-name", logicalName: "공급사명", physicalName: "name", logicalType: "TEXT", nullable: false }),
            ],
        },
        {
            id: "table-products",
            logicalName: "상품",
            physicalName: "products",
            color: "#ddd6fe",
            columns: [
                createColumn("postgres", { id: productId, logicalName: "상품ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-products-sku", logicalName: "SKU", physicalName: "sku", logicalType: "TEXT", nullable: false }),
                createColumn("postgres", { id: "col-products-name", logicalName: "상품명", physicalName: "name", logicalType: "TEXT", nullable: false }),
                createColumn("postgres", { id: "col-products-uom", logicalName: "기준단위", physicalName: "uom", logicalType: "TEXT", nullable: false }),
            ],
        },
        {
            id: "table-product-barcodes",
            logicalName: "상품바코드",
            physicalName: "product_barcodes",
            color: "#c4b5fd",
            columns: [
                createColumn("postgres", { id: "col-product-barcodes-id", logicalName: "바코드ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-product-barcodes-product-id", logicalName: "상품ID", physicalName: "product_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: productId }),
                createColumn("postgres", { id: "col-product-barcodes-code", logicalName: "바코드", physicalName: "barcode", logicalType: "TEXT", nullable: false }),
            ],
        },
        {
            id: "table-inbound-receipts",
            logicalName: "입고전표",
            physicalName: "inbound_receipts",
            color: "#dcfce7",
            columns: [
                createColumn("postgres", { id: inboundReceiptId, logicalName: "입고전표ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-inbound-receipts-warehouse-id", logicalName: "창고ID", physicalName: "warehouse_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: warehouseId }),
                createColumn("postgres", { id: "col-inbound-receipts-supplier-id", logicalName: "공급사ID", physicalName: "supplier_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: supplierId }),
                createColumn("postgres", { id: "col-inbound-receipts-received-at", logicalName: "입고일시", physicalName: "received_at", logicalType: "DATETIME", nullable: false }),
            ],
        },
        {
            id: "table-inbound-receipt-items",
            logicalName: "입고전표상세",
            physicalName: "inbound_receipt_items",
            color: "#bbf7d0",
            columns: [
                createColumn("postgres", { id: inboundReceiptItemId, logicalName: "입고상세ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-inbound-receipt-items-receipt-id", logicalName: "입고전표ID", physicalName: "receipt_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: inboundReceiptId }),
                createColumn("postgres", { id: "col-inbound-receipt-items-product-id", logicalName: "상품ID", physicalName: "product_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: productId }),
                createColumn("postgres", { id: "col-inbound-receipt-items-location-id", logicalName: "입고로케이션ID", physicalName: "location_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: locationId }),
                createColumn("postgres", { id: "col-inbound-receipt-items-qty", logicalName: "입고수량", physicalName: "received_qty", logicalType: "NUMBER", nullable: false }),
            ],
        },
        {
            id: "table-outbound-orders",
            logicalName: "출고오더",
            physicalName: "outbound_orders",
            color: "#fecaca",
            columns: [
                createColumn("postgres", { id: outboundOrderId, logicalName: "출고오더ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-outbound-orders-warehouse-id", logicalName: "창고ID", physicalName: "warehouse_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: warehouseId }),
                createColumn("postgres", { id: "col-outbound-orders-order-no", logicalName: "출고번호", physicalName: "order_no", logicalType: "TEXT", nullable: false }),
                createColumn("postgres", { id: "col-outbound-orders-status", logicalName: "상태", physicalName: "status", logicalType: "TEXT", nullable: false }),
            ],
        },
        {
            id: "table-outbound-order-items",
            logicalName: "출고오더상세",
            physicalName: "outbound_order_items",
            color: "#fca5a5",
            columns: [
                createColumn("postgres", { id: outboundOrderItemId, logicalName: "출고상세ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-outbound-order-items-order-id", logicalName: "출고오더ID", physicalName: "order_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: outboundOrderId }),
                createColumn("postgres", { id: "col-outbound-order-items-product-id", logicalName: "상품ID", physicalName: "product_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: productId }),
                createColumn("postgres", { id: "col-outbound-order-items-location-id", logicalName: "피킹로케이션ID", physicalName: "location_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: locationId }),
                createColumn("postgres", { id: "col-outbound-order-items-qty", logicalName: "출고수량", physicalName: "shipped_qty", logicalType: "NUMBER", nullable: false }),
            ],
        },
        {
            id: "table-inventory-balances",
            logicalName: "재고잔량",
            physicalName: "inventory_balances",
            color: "#fde68a",
            columns: [
                createColumn("postgres", { id: inventoryBalanceId, logicalName: "재고ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-inventory-balances-warehouse-id", logicalName: "창고ID", physicalName: "warehouse_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: warehouseId }),
                createColumn("postgres", { id: "col-inventory-balances-location-id", logicalName: "로케이션ID", physicalName: "location_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: locationId }),
                createColumn("postgres", { id: "col-inventory-balances-product-id", logicalName: "상품ID", physicalName: "product_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: productId }),
                createColumn("postgres", { id: "col-inventory-balances-on-hand", logicalName: "가용재고", physicalName: "on_hand_qty", logicalType: "NUMBER", nullable: false }),
            ],
        },
        {
            id: "table-stock-movements",
            logicalName: "재고이동이력",
            physicalName: "stock_movements",
            color: "#fed7aa",
            columns: [
                createColumn("postgres", { id: stockMovementId, logicalName: "이동이력ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-stock-movements-product-id", logicalName: "상품ID", physicalName: "product_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: productId }),
                createColumn("postgres", { id: "col-stock-movements-from-location-id", logicalName: "출발로케이션ID", physicalName: "from_location_id", logicalType: "NUMBER", nullable: true, isForeignKey: true, referencesPrimaryColumnId: locationId }),
                createColumn("postgres", { id: "col-stock-movements-to-location-id", logicalName: "도착로케이션ID", physicalName: "to_location_id", logicalType: "NUMBER", nullable: true, isForeignKey: true, referencesPrimaryColumnId: locationId }),
                createColumn("postgres", { id: "col-stock-movements-qty", logicalName: "이동수량", physicalName: "moved_qty", logicalType: "NUMBER", nullable: false }),
            ],
        },
        {
            id: "table-cycle-counts",
            logicalName: "실사전표",
            physicalName: "cycle_counts",
            color: "#fbcfe8",
            columns: [
                createColumn("postgres", { id: cycleCountId, logicalName: "실사전표ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-cycle-counts-warehouse-id", logicalName: "창고ID", physicalName: "warehouse_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: warehouseId }),
                createColumn("postgres", { id: "col-cycle-counts-counted-at", logicalName: "실사일시", physicalName: "counted_at", logicalType: "DATETIME", nullable: false }),
            ],
        },
        {
            id: "table-cycle-count-items",
            logicalName: "실사전표상세",
            physicalName: "cycle_count_items",
            color: "#f9a8d4",
            columns: [
                createColumn("postgres", { id: cycleCountItemId, logicalName: "실사상세ID", physicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true }),
                createColumn("postgres", { id: "col-cycle-count-items-cycle-count-id", logicalName: "실사전표ID", physicalName: "cycle_count_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: cycleCountId }),
                createColumn("postgres", { id: "col-cycle-count-items-product-id", logicalName: "상품ID", physicalName: "product_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: productId }),
                createColumn("postgres", { id: "col-cycle-count-items-location-id", logicalName: "로케이션ID", physicalName: "location_id", logicalType: "NUMBER", nullable: false, isForeignKey: true, referencesPrimaryColumnId: locationId }),
                createColumn("postgres", { id: "col-cycle-count-items-counted-qty", logicalName: "실사수량", physicalName: "counted_qty", logicalType: "NUMBER", nullable: false }),
            ],
        },
    );

    doc.model.relationships.push(
        { id: "rel-zones-warehouses", sourceTableId: "table-warehouses", targetTableId: "table-zones", sourceColumnId: warehouseId, targetColumnId: "col-zones-warehouse-id" },
        { id: "rel-locations-zones", sourceTableId: "table-zones", targetTableId: "table-locations", sourceColumnId: zoneId, targetColumnId: "col-locations-zone-id" },
        { id: "rel-product-barcodes-products", sourceTableId: "table-products", targetTableId: "table-product-barcodes", sourceColumnId: productId, targetColumnId: "col-product-barcodes-product-id" },
        { id: "rel-inbound-receipts-warehouses", sourceTableId: "table-warehouses", targetTableId: "table-inbound-receipts", sourceColumnId: warehouseId, targetColumnId: "col-inbound-receipts-warehouse-id" },
        { id: "rel-inbound-receipts-suppliers", sourceTableId: "table-suppliers", targetTableId: "table-inbound-receipts", sourceColumnId: supplierId, targetColumnId: "col-inbound-receipts-supplier-id" },
        { id: "rel-inbound-items-receipts", sourceTableId: "table-inbound-receipts", targetTableId: "table-inbound-receipt-items", sourceColumnId: inboundReceiptId, targetColumnId: "col-inbound-receipt-items-receipt-id" },
        { id: "rel-inbound-items-products", sourceTableId: "table-products", targetTableId: "table-inbound-receipt-items", sourceColumnId: productId, targetColumnId: "col-inbound-receipt-items-product-id" },
        { id: "rel-inbound-items-locations", sourceTableId: "table-locations", targetTableId: "table-inbound-receipt-items", sourceColumnId: locationId, targetColumnId: "col-inbound-receipt-items-location-id" },
        { id: "rel-outbound-orders-warehouses", sourceTableId: "table-warehouses", targetTableId: "table-outbound-orders", sourceColumnId: warehouseId, targetColumnId: "col-outbound-orders-warehouse-id" },
        { id: "rel-outbound-items-orders", sourceTableId: "table-outbound-orders", targetTableId: "table-outbound-order-items", sourceColumnId: outboundOrderId, targetColumnId: "col-outbound-order-items-order-id" },
        { id: "rel-outbound-items-products", sourceTableId: "table-products", targetTableId: "table-outbound-order-items", sourceColumnId: productId, targetColumnId: "col-outbound-order-items-product-id" },
        { id: "rel-outbound-items-locations", sourceTableId: "table-locations", targetTableId: "table-outbound-order-items", sourceColumnId: locationId, targetColumnId: "col-outbound-order-items-location-id" },
        { id: "rel-inventory-warehouses", sourceTableId: "table-warehouses", targetTableId: "table-inventory-balances", sourceColumnId: warehouseId, targetColumnId: "col-inventory-balances-warehouse-id" },
        { id: "rel-inventory-locations", sourceTableId: "table-locations", targetTableId: "table-inventory-balances", sourceColumnId: locationId, targetColumnId: "col-inventory-balances-location-id" },
        { id: "rel-inventory-products", sourceTableId: "table-products", targetTableId: "table-inventory-balances", sourceColumnId: productId, targetColumnId: "col-inventory-balances-product-id" },
        { id: "rel-movements-products", sourceTableId: "table-products", targetTableId: "table-stock-movements", sourceColumnId: productId, targetColumnId: "col-stock-movements-product-id" },
        { id: "rel-movements-from-location", sourceTableId: "table-locations", targetTableId: "table-stock-movements", sourceColumnId: locationId, targetColumnId: "col-stock-movements-from-location-id" },
        { id: "rel-movements-to-location", sourceTableId: "table-locations", targetTableId: "table-stock-movements", sourceColumnId: locationId, targetColumnId: "col-stock-movements-to-location-id" },
        { id: "rel-cycle-counts-warehouses", sourceTableId: "table-warehouses", targetTableId: "table-cycle-counts", sourceColumnId: warehouseId, targetColumnId: "col-cycle-counts-warehouse-id" },
        { id: "rel-cycle-count-items-count", sourceTableId: "table-cycle-counts", targetTableId: "table-cycle-count-items", sourceColumnId: cycleCountId, targetColumnId: "col-cycle-count-items-cycle-count-id" },
        { id: "rel-cycle-count-items-products", sourceTableId: "table-products", targetTableId: "table-cycle-count-items", sourceColumnId: productId, targetColumnId: "col-cycle-count-items-product-id" },
        { id: "rel-cycle-count-items-locations", sourceTableId: "table-locations", targetTableId: "table-cycle-count-items", sourceColumnId: locationId, targetColumnId: "col-cycle-count-items-location-id" },
    );

    doc.model.indexes.push(
        { id: "idx-warehouses-code", tableId: "table-warehouses", name: "idx_warehouses_code", columns: ["code"], unique: true },
        { id: "idx-products-sku", tableId: "table-products", name: "idx_products_sku", columns: ["sku"], unique: true },
        { id: "idx-product-barcodes-code", tableId: "table-product-barcodes", name: "idx_product_barcodes_code", columns: ["barcode"], unique: true },
        { id: "idx-locations-code", tableId: "table-locations", name: "idx_locations_code", columns: ["code"], unique: true },
        { id: "idx-inbound-receipts-received-at", tableId: "table-inbound-receipts", name: "idx_inbound_receipts_received_at", columns: ["received_at"], unique: false },
        { id: "idx-outbound-orders-order-no", tableId: "table-outbound-orders", name: "idx_outbound_orders_order_no", columns: ["order_no"], unique: true },
        { id: "idx-inventory-balances-loc-prod", tableId: "table-inventory-balances", name: "idx_inventory_balances_loc_prod", columns: ["location_id", "product_id"], unique: false },
        { id: "idx-stock-movements-product-id", tableId: "table-stock-movements", name: "idx_stock_movements_product_id", columns: ["product_id"], unique: false },
    );

    doc.layout.nodePositions["table-warehouses"] = { x: 80, y: 70 };
    doc.layout.nodePositions["table-zones"] = { x: 380, y: 70 };
    doc.layout.nodePositions["table-locations"] = { x: 700, y: 70 };
    doc.layout.nodePositions["table-suppliers"] = { x: 80, y: 320 };
    doc.layout.nodePositions["table-products"] = { x: 380, y: 320 };
    doc.layout.nodePositions["table-product-barcodes"] = { x: 700, y: 320 };
    doc.layout.nodePositions["table-inbound-receipts"] = { x: 80, y: 570 };
    doc.layout.nodePositions["table-inbound-receipt-items"] = { x: 380, y: 570 };
    doc.layout.nodePositions["table-outbound-orders"] = { x: 700, y: 570 };
    doc.layout.nodePositions["table-outbound-order-items"] = { x: 1020, y: 570 };
    doc.layout.nodePositions["table-inventory-balances"] = { x: 1020, y: 320 };
    doc.layout.nodePositions["table-stock-movements"] = { x: 1330, y: 320 };
    doc.layout.nodePositions["table-cycle-counts"] = { x: 1330, y: 70 };
    doc.layout.nodePositions["table-cycle-count-items"] = { x: 1630, y: 70 };

    doc.settings = {
        ...(doc.settings ?? {}),
        projectName: "Playground WMS Sample ER",
        projectDescription: "Warehouse management domain sample with inbound, outbound, inventory, and cycle count flows.",
    };

    return doc;
}

export default function Page() {
    const designerRef = useRef<ERDDesignerHandle>(null);
    const [design, setDesign] = useState<DesignDocument | undefined>(undefined);
    const [rightPanelEnabled, setRightPanelEnabled] = useState(true);
    const [locale, setLocale] = useState("ko");
    const [relationshipLinesVisible, setRelationshipLinesVisible] =
        useState(true);
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
                margin: 0,
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
                    fontSize: 13,
                }}
            >
                <label
                    style={{
                        display: "inline-flex",
                        gap: 8,
                        alignItems: "center",
                    }}
                >
                    <input
                        type="checkbox"
                        checked={rightPanelEnabled}
                        onChange={(e) => setRightPanelEnabled(e.target.checked)}
                    />
                    showRightPanel
                </label>
                <label
                    style={{
                        display: "inline-flex",
                        gap: 8,
                        alignItems: "center",
                    }}
                >
                    locale
                    <select
                        value={locale}
                        onChange={(e) => setLocale(e.target.value)}
                        style={{ padding: "4px 8px" }}
                    >
                        <option value="ko">ko</option>
                        <option value="en">en</option>
                    </select>
                </label>
                <label
                    style={{
                        display: "inline-flex",
                        gap: 8,
                        alignItems: "center",
                    }}
                >
                    <input
                        type="checkbox"
                        checked={relationshipLinesVisible}
                        onChange={(e) =>
                            setRelationshipLinesVisible(e.target.checked)
                        }
                    />
                    relationshipLinesVisible
                </label>
                <button
                    type="button"
                    onClick={() => setDesign(createTestDesign())}
                    style={{
                        marginLeft: "auto",
                        padding: "6px 10px",
                        border: "1px solid #cbd5e1",
                        borderRadius: 8,
                        background: "#fff",
                    }}
                >
                    Load test ER
                </button>
            </section>
            <section
                style={{
                    minWidth: 0,
                    minHeight: 0,
                    padding: 12,
                    position: "relative",
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
                        boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
                    }}
                >
                    <ERDDesigner
                        ref={designerRef}
                        value={design}
                        onChange={handleDesignChange}
                        showRightPanel={rightPanelEnabled}
                        locale={locale}
                        relationshipLinesVisible={relationshipLinesVisible}
                        onRelationshipLinesVisibleChange={
                            setRelationshipLinesVisible
                        }
                    />
                </div>
            </section>
        </main>
    );
}
