"use client";

import { FormEvent, MouseEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Boxes, CalendarDays, Download, FileBarChart, Loader2, Package, Pencil, Plus, ShoppingCart, Trash2, TrendingUp, Upload, Wallet } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type FinanceView = "sales" | "products" | "profit" | "cashflow" | "reports";
type Product = { id: string; name: string; sku: string; variant: string; costCents: number; sellingPriceCents: number; stockQuantity: number; lowStockThreshold: number };
type SaleItem = { id: string; orderId: string; productId: string | null; productName: string; sku: string; variant: string; quantity: number; unitPriceCents: number; unitCostCents: number; lineTotalCents: number };
type Sale = { id: string; orderDate: string; orderNumber: string; externalOrderId: string | null; source: string; customerName: string; salesChannel: string; orderStatus: string; paymentStatus: string; paymentMethod: string; shippingMethod: string; itemsSummary: string; subtotalCents: number; discountCents: number; shippingFeeCents: number; transactionFeeCents: number; totalCents: number; netSalesCents: number; amountPaidCents: number; inventoryApplied: number; notes: string; paidAt: string; deliveredAt: string; items: SaleItem[] };
type ExpenseMini = { category: string; totalCents: number; amountPaidCents: number };
type Movement = { id: string; productId: string; productName: string; sku: string; orderId: string | null; movementType: string; quantityDelta: number; reason: string; createdAt: string };
type FinanceResponse = { orders: Omit<Sale, "items">[]; items: SaleItem[]; products: Product[]; expenses: ExpenseMini[]; movements: Movement[] };
type SaleLineDraft = { productId: string; quantity: string; unitPrice: string };
type SaleDraft = { orderDate: string; orderNumber: string; customerName: string; salesChannel: string; orderStatus: string; paymentStatus: string; paymentMethod: string; shippingMethod: string; discount: string; shippingFee: string; transactionFee: string; amountPaid: string; notes: string; items: SaleLineDraft[] };
type ProductDraft = { name: string; sku: string; variant: string; cost: string; sellingPrice: string; stockQuantity: string; lowStockThreshold: string };
type FinanceSummary = { grossSales: number; netSales: number; paid: number; receivables: number; cogs: number; expenses: number; expensePaid: number; grossProfit: number; netProfit: number; cashBalance: number };

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });
const orderStatuses = ["Pending", "Processing", "Shipped", "Completed", "Cancelled"];
const paymentStatuses = ["Unpaid", "Partial", "Paid"];
const channels = ["Direct", "Website", "Enstack", "Facebook", "Instagram", "TikTok", "Shopee", "Physical Store", "Other"];
const paymentMethods = ["Cash", "GCash", "Maya", "Bank Transfer", "Credit Card", "Debit Card", "COD", "Other"];
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => peso.format(value / 100);
const dateText = (value: string) => {
  const clean = value?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return "—";
  const date = new Date(`${clean}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(date);
};
const monthEnd = (month: string) => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return today();
  return new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).toISOString().slice(0, 10);
};
const blankSale = (): SaleDraft => ({ orderDate: today(), orderNumber: "", customerName: "", salesChannel: "Direct", orderStatus: "Pending", paymentStatus: "Unpaid", paymentMethod: "GCash", shippingMethod: "", discount: "0", shippingFee: "0", transactionFee: "0", amountPaid: "0", notes: "", items: [{ productId: "", quantity: "1", unitPrice: "" }] });
const blankProduct = (): ProductDraft => ({ name: "", sku: "", variant: "", cost: "", sellingPrice: "", stockQuantity: "0", lowStockThreshold: "5" });

export function FinanceSuite({
  view,
  month,
  dateFilterMode = "month",
  specificDate = today(),
}: {
  view: FinanceView;
  month: string;
  dateFilterMode?: "all" | "month" | "date";
  specificDate?: string;
}) {
  const [data, setData] = useState<FinanceResponse>({ orders: [], items: [], products: [], expenses: [], movements: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoaded = useRef(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [saleDialog, setSaleDialog] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [stockDialog, setStockDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [saleDraft, setSaleDraft] = useState<SaleDraft>(blankSale);
  const [productDraft, setProductDraft] = useState<ProductDraft>(blankProduct);
  const [editingSale, setEditingSale] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockDelta, setStockDelta] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ resource: "order" | "product"; id: string; label: string } | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [reportFrom, setReportFrom] = useState(`${month}-01`);
  const [reportTo, setReportTo] = useState(monthEnd(month));
  const [appliedReportFrom, setAppliedReportFrom] = useState(`${month}-01`);
  const [appliedReportTo, setAppliedReportTo] = useState(monthEnd(month));
  const [reportReloadKey, setReportReloadKey] = useState(0);

  const loadData = useCallback(async () => {
    const initialLoad = !hasLoaded.current;
    if (initialLoad) setLoading(true);
    else setRefreshing(true);

    try {
      const query =
        view === "reports"
          ? `from=${encodeURIComponent(appliedReportFrom)}&to=${encodeURIComponent(appliedReportTo)}`
          : dateFilterMode === "all"
            ? "range=all"
            : dateFilterMode === "date"
              ? `date=${encodeURIComponent(specificDate)}`
              : `month=${encodeURIComponent(month)}`;
      const response = await fetch(`/api/sales-data?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json() as FinanceResponse;
      const grouped = new Map<string, SaleItem[]>();
      for (const item of result.items) grouped.set(item.orderId, [...(grouped.get(item.orderId) ?? []), item]);
      setData({ ...result, orders: result.orders.map((order) => ({ ...order, items: grouped.get(order.id) ?? [] })) as Sale[] });
    } catch {
      toast.error("Couldn’t load sales and inventory data.");
    } finally {
      hasLoaded.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [appliedReportFrom, appliedReportTo, dateFilterMode, month, reportReloadKey, specificDate, view]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const applyReportRange = useCallback(() => {
    if (!reportFrom || !reportTo || reportFrom > reportTo) return;
    setAppliedReportFrom(reportFrom);
    setAppliedReportTo(reportTo);
    setReportReloadKey((value) => value + 1);
  }, [reportFrom, reportTo]);

  const orders = data.orders as Sale[];
  const activeOrders = orders.filter((order) => order.orderStatus !== "Cancelled");
  const completedOrders = activeOrders.filter((order) => order.orderStatus === "Completed");
  const summary = useMemo(() => {
    const grossSales = completedOrders.reduce((sum, order) => sum + order.totalCents, 0);
    const netSales = completedOrders.reduce((sum, order) => sum + order.netSalesCents, 0);
    const paid = activeOrders.reduce((sum, order) => sum + order.amountPaidCents, 0);
    const receivables = activeOrders.reduce((sum, order) => sum + Math.max(order.totalCents - order.amountPaidCents, 0), 0);
    const cogs = completedOrders.flatMap((order) => order.items).reduce((sum, item) => sum + item.unitCostCents * item.quantity, 0);
    const expenses = data.expenses.reduce((sum, expense) => sum + expense.totalCents, 0);
    const expensePaid = data.expenses.reduce((sum, expense) => sum + expense.amountPaidCents, 0);
    return { grossSales, netSales, paid, receivables, cogs, expenses, expensePaid, grossProfit: netSales - cogs, netProfit: netSales - cogs - expenses, cashBalance: paid - expensePaid };
  }, [activeOrders, completedOrders, data.expenses]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => (!query || [order.orderNumber, order.customerName, order.salesChannel, order.itemsSummary].join(" ").toLowerCase().includes(query)) && (status === "All statuses" || order.orderStatus === status));
  }, [orders, search, status]);

  const productSales = useMemo(() => {
    const totals = new Map<string, { name: string; quantity: number; sales: number }>();
    for (const order of activeOrders) for (const item of order.items) {
      const key = item.productId ?? item.productName;
      const current = totals.get(key) ?? { name: item.productName, quantity: 0, sales: 0 };
      current.quantity += item.quantity; current.sales += item.lineTotalCents; totals.set(key, current);
    }
    return [...totals.values()].sort((a, b) => b.quantity - a.quantity);
  }, [activeOrders]);
  const expenseCategories = useMemo(() => Object.entries(data.expenses.reduce<Record<string, number>>((all, expense) => ({ ...all, [expense.category]: (all[expense.category] ?? 0) + expense.totalCents }), {})).sort((a, b) => b[1] - a[1]), [data.expenses]);

  const openNewSale = () => { setEditingSale(null); setSaleDraft(blankSale()); setSaleDialog(true); };
  const openSale = (order: Sale) => {
    setEditingSale(order.id);
    setSaleDraft({ orderDate: order.orderDate, orderNumber: order.orderNumber, customerName: order.customerName, salesChannel: order.salesChannel, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod, shippingMethod: order.shippingMethod, discount: String(order.discountCents / 100), shippingFee: String(order.shippingFeeCents / 100), transactionFee: String(order.transactionFeeCents / 100), amountPaid: String(order.amountPaidCents / 100), notes: order.notes, items: order.items.filter((item) => item.productId).map((item) => ({ productId: item.productId!, quantity: String(item.quantity), unitPrice: String(item.unitPriceCents / 100) })) });
    setSaleDialog(true);
  };
  const openNewProduct = () => { setEditingProduct(null); setProductDraft(blankProduct()); setProductDialog(true); };
  const openProduct = (product: Product) => { setEditingProduct(product.id); setProductDraft({ name: product.name, sku: product.sku, variant: product.variant, cost: String(product.costCents / 100), sellingPrice: String(product.sellingPriceCents / 100), stockQuantity: String(product.stockQuantity), lowStockThreshold: String(product.lowStockThreshold) }); setProductDialog(true); };

  const saveSale = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/sales-data", { method: editingSale ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource: "order", id: editingSale, ...saleDraft }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn’t save sale");
      await loadData(); setSaleDialog(false); toast.success(editingSale ? "Sale updated" : "Sale added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn’t save sale."); }
    finally { setSaving(false); }
  };
  const saveProduct = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/sales-data", { method: editingProduct ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource: "product", id: editingProduct, ...productDraft }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn’t save product");
      await loadData(); setProductDialog(false); toast.success(editingProduct ? "Product updated" : "Product added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn’t save product."); }
    finally { setSaving(false); }
  };
  const adjustStock = async (event: FormEvent) => {
    event.preventDefault(); if (!stockProduct) return; setSaving(true);
    try {
      const response = await fetch("/api/sales-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource: "inventory", productId: stockProduct.id, quantityDelta: stockDelta, reason: stockReason }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn’t adjust stock");
      await loadData(); setStockDialog(false); toast.success("Stock adjusted");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn’t adjust stock."); }
    finally { setSaving(false); }
  };
  const removeRecord = async () => {
    if (!deleteTarget) return;
    try {
      const response = await fetch(`/api/sales-data?resource=${deleteTarget.resource}&id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn’t delete record");
      setDeleteTarget(null); await loadData(); toast.success(deleteTarget.resource === "order" ? "Sale deleted" : "Product deleted");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn’t delete record."); }
  };
  const importEnstack = async (event: FormEvent) => {
    event.preventDefault(); if (!importFile) return; setSaving(true);
    try {
      const form = new FormData(); form.append("file", importFile);
      const response = await fetch("/api/sales-import", { method: "POST", body: form });
      const result = await response.json() as { imported?: number; updated?: number; skipped?: number; errors?: string[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn’t import report");
      await loadData(); setImportDialog(false); setImportFile(null); toast.success(`${result.imported ?? 0} imported · ${result.updated ?? 0} updated · ${result.skipped ?? 0} skipped`);
      if (result.errors?.length) toast.warning(result.errors[0]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn’t import report."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state"><Loader2 className="spin" size={23} /> Loading finance data…</div>;
  return <>
    {view === "sales" && <SalesView orders={filteredOrders} summary={summary} search={search} setSearch={setSearch} status={status} setStatus={setStatus} add={openNewSale} edit={openSale} remove={(order) => setDeleteTarget({ resource: "order", id: order.id, label: order.orderNumber })} importCsv={() => setImportDialog(true)} />}
    {view === "products" && <ProductsView products={data.products} movements={data.movements} add={openNewProduct} edit={openProduct} adjust={(product) => { setStockProduct(product); setStockDelta(""); setStockReason(""); setStockDialog(true); }} remove={(product) => setDeleteTarget({ resource: "product", id: product.id, label: product.name })} />}
    {view === "profit" && <ProfitView summary={summary} orders={completedOrders} />}
    {view === "cashflow" && <CashFlowView summary={summary} orders={activeOrders} expenses={data.expenses} />}
    {view === "reports" && <ReportsView summary={summary} orders={orders} products={data.products} productSales={productSales} expenseCategories={expenseCategories} from={reportFrom} to={reportTo} setFrom={setReportFrom} setTo={setReportTo} refresh={applyReportRange} refreshing={refreshing} />}
    <SaleDialog open={saleDialog} setOpen={setSaleDialog} draft={saleDraft} setDraft={setSaleDraft} products={data.products} editing={Boolean(editingSale)} saving={saving} submit={saveSale} />
    <ProductDialog open={productDialog} setOpen={setProductDialog} draft={productDraft} setDraft={setProductDraft} editing={Boolean(editingProduct)} saving={saving} submit={saveProduct} />
    <StockDialog open={stockDialog} setOpen={setStockDialog} product={stockProduct} delta={stockDelta} setDelta={setStockDelta} reason={stockReason} setReason={setStockReason} saving={saving} submit={adjustStock} />
    <ImportDialog open={importDialog} setOpen={setImportDialog} file={importFile} setFile={setImportFile} saving={saving} submit={importEnstack} />
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle><AlertDialogDescription>{deleteTarget?.label} will be permanently removed. Stock from fulfilled sales will be restored.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void removeRecord()}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

function SalesView({ orders, summary, search, setSearch, status, setStatus, add, edit, remove, importCsv }: { orders: Sale[]; summary: FinanceSummary; search: string; setSearch: (value: string) => void; status: string; setStatus: (value: string) => void; add: () => void; edit: (order: Sale) => void; remove: (order: Sale) => void; importCsv: () => void }) {
  return <div className="finance-stack"><MetricGrid items={[{ icon: <ShoppingCart />, label: "Completed sales", value: money(summary.grossSales), note: `${orders.filter((order) => order.orderStatus === "Completed").length} completed orders`, accent: true }, { icon: <Wallet />, label: "Cash collected", value: money(summary.paid), note: "Paid and partial collections" }, { icon: <AlertTriangle />, label: "Receivables", value: money(summary.receivables), note: "Customer balances", warning: summary.receivables > 0 }, { icon: <TrendingUp />, label: "Net sales", value: money(summary.netSales), note: "After transaction fees" }]} />
    <section className="panel finance-table"><div className="finance-toolbar"><div><p className="eyebrow">SALES & ORDERS</p><h2>{orders.length} records</h2></div><div className="finance-actions"><Button variant="outline" onClick={importCsv}><Upload size={16} /> Import Enstack CSV</Button><Button className="primary-button" onClick={add}><Plus size={17} /> Add sale</Button></div></div><div className="finance-filters"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, or product" /><Choice value={status} onChange={setStatus} options={["All statuses", ...orderStatuses]} /></div>
      {orders.length ? <Table><TableHeader><TableRow><TableHead>Date / Order</TableHead><TableHead>Customer / Channel</TableHead><TableHead>Items</TableHead><TableHead>Status</TableHead><TableHead>Payment</TableHead><TableHead className="amount-column">Total</TableHead><TableHead /></TableRow></TableHeader><TableBody>{orders.map((order) => <TableRow key={order.id}><TableCell>{dateText(order.orderDate)}<small>{order.orderNumber}</small></TableCell><TableCell><strong>{order.customerName || "Walk-in customer"}</strong><small>{order.salesChannel} · {order.source}</small></TableCell><TableCell>{order.itemsSummary || "—"}</TableCell><TableCell><Status value={order.orderStatus} /></TableCell><TableCell><Status value={order.paymentStatus} /><small>{order.paymentMethod}</small></TableCell><TableCell className="amount-column"><strong>{money(order.totalCents)}</strong><small>{money(order.amountPaidCents)} paid</small></TableCell><TableCell><div className="row-actions">{order.source !== "Enstack" && <Button variant="ghost" size="icon" onClick={() => edit(order)} aria-label={`Edit ${order.orderNumber}`}><Pencil size={15} /></Button>}<Button variant="ghost" size="icon" onClick={() => remove(order)} aria-label={`Delete ${order.orderNumber}`}><Trash2 size={15} /></Button></div></TableCell></TableRow>)}</TableBody></Table> : <Empty text="No sales match the current filters." icon={<ShoppingCart />} />}
    </section></div>;
}

function ProductsView({ products, movements, add, edit, adjust, remove }: { products: Product[]; movements: Movement[]; add: () => void; edit: (product: Product) => void; adjust: (product: Product) => void; remove: (product: Product) => void }) {
  const low = products.filter((product) => product.stockQuantity <= product.lowStockThreshold);
  const value = products.reduce((sum, product) => sum + product.costCents * product.stockQuantity, 0);
  return <div className="finance-stack"><MetricGrid items={[{ icon: <Package />, label: "Products", value: String(products.length), note: "Active catalog", accent: true }, { icon: <Boxes />, label: "Units in stock", value: String(products.reduce((sum, product) => sum + product.stockQuantity, 0)), note: "Available inventory" }, { icon: <Wallet />, label: "Inventory value", value: money(value), note: "Based on product cost" }, { icon: <AlertTriangle />, label: "Low stock", value: String(low.length), note: "At or below threshold", warning: low.length > 0 }]} />
    <section className="panel finance-table"><div className="finance-toolbar"><div><p className="eyebrow">PRODUCT CATALOG</p><h2>Products & inventory</h2></div><Button className="primary-button" onClick={add}><Plus size={17} /> Add product</Button></div>{products.length ? <Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU / Variant</TableHead><TableHead>Cost</TableHead><TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead /></TableRow></TableHeader><TableBody>{products.map((product) => <TableRow key={product.id}><TableCell><strong>{product.name}</strong></TableCell><TableCell>{product.sku}<small>{product.variant || "Standard"}</small></TableCell><TableCell>{money(product.costCents)}</TableCell><TableCell>{money(product.sellingPriceCents)}</TableCell><TableCell><span className={product.stockQuantity <= product.lowStockThreshold ? "stock-low" : "stock-good"}>{product.stockQuantity}</span><small>Low at {product.lowStockThreshold}</small></TableCell><TableCell><div className="row-actions"><Button variant="ghost" size="icon" onClick={() => adjust(product)} aria-label="Adjust stock"><Boxes size={15} /></Button><Button variant="ghost" size="icon" onClick={() => edit(product)}><Pencil size={15} /></Button><Button variant="ghost" size="icon" onClick={() => remove(product)}><Trash2 size={15} /></Button></div></TableCell></TableRow>)}</TableBody></Table> : <Empty text="Add products before recording manual sales." icon={<Package />} action={add} />}</section>
    <section className="panel finance-table"><div className="finance-toolbar"><div><p className="eyebrow">STOCK HISTORY</p><h2>Recent movements</h2></div></div>{movements.length ? <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead className="amount-column">Change</TableHead></TableRow></TableHeader><TableBody>{movements.slice(0, 15).map((movement) => <TableRow key={movement.id}><TableCell>{new Date(movement.createdAt).toLocaleDateString("en-PH")}</TableCell><TableCell><strong>{movement.productName}</strong><small>{movement.sku}</small></TableCell><TableCell>{movement.movementType}</TableCell><TableCell>{movement.reason || "—"}</TableCell><TableCell className="amount-column"><strong className={movement.quantityDelta > 0 ? "positive" : "negative"}>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</strong></TableCell></TableRow>)}</TableBody></Table> : <Empty text="Stock movements will appear here." icon={<Boxes />} />}</section></div>;
}

function ProfitView({ summary, orders }: { summary: FinanceSummary; orders: Sale[] }) {
  return <div className="finance-stack"><MetricGrid items={[{ icon: <TrendingUp />, label: "Net sales", value: money(summary.netSales), note: "Completed orders after fees", accent: true }, { icon: <Package />, label: "Cost of goods", value: money(summary.cogs), note: "Product cost snapshots" }, { icon: <ArrowDownCircle />, label: "Operating expenses", value: money(summary.expenses), note: "Recorded expenses" }, { icon: <Wallet />, label: "Net profit", value: money(summary.netProfit), note: "Sales − COGS − expenses", warning: summary.netProfit < 0 }]} />
    <section className="analysis-grid"><article className="panel profit-waterfall"><p className="eyebrow">PROFIT BREAKDOWN</p><h2>How profit is calculated</h2><div className="profit-lines"><div><span>Net sales</span><strong>{money(summary.netSales)}</strong></div><div><span>Less: cost of goods</span><strong>− {money(summary.cogs)}</strong></div><div><span>Gross profit</span><strong>{money(summary.grossProfit)}</strong></div><div><span>Less: expenses</span><strong>− {money(summary.expenses)}</strong></div><div className="profit-total"><span>Net profit</span><strong>{money(summary.netProfit)}</strong></div></div></article><article className="panel"><p className="eyebrow">MARGIN</p><h2>Monthly performance</h2><div className="margin-display"><strong>{summary.netSales ? Math.round((summary.netProfit / summary.netSales) * 100) : 0}%</strong><span>Net profit margin</span></div></article></section>
    <section className="panel finance-table"><div className="finance-toolbar"><div><p className="eyebrow">ORDER PROFITABILITY</p><h2>Completed orders</h2></div></div>{orders.length ? <Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Items</TableHead><TableHead className="amount-column">Net sales</TableHead><TableHead className="amount-column">COGS</TableHead><TableHead className="amount-column">Gross profit</TableHead></TableRow></TableHeader><TableBody>{orders.map((order) => { const cogs = order.items.reduce((sum, item) => sum + item.unitCostCents * item.quantity, 0); return <TableRow key={order.id}><TableCell><strong>{order.orderNumber}</strong><small>{dateText(order.orderDate)}</small></TableCell><TableCell>{order.itemsSummary}</TableCell><TableCell className="amount-column">{money(order.netSalesCents)}</TableCell><TableCell className="amount-column">{money(cogs)}</TableCell><TableCell className="amount-column"><strong>{money(order.netSalesCents - cogs)}</strong></TableCell></TableRow>; })}</TableBody></Table> : <Empty text="Complete an order to see profitability." icon={<TrendingUp />} />}</section></div>;
}

function CashFlowView({ summary, orders, expenses }: { summary: FinanceSummary; orders: Sale[]; expenses: ExpenseMini[] }) {
  const unpaidSales = orders.filter((order) => order.totalCents > order.amountPaidCents).sort((a, b) => (b.totalCents - b.amountPaidCents) - (a.totalCents - a.amountPaidCents));
  return <div className="finance-stack"><MetricGrid items={[{ icon: <ArrowUpCircle />, label: "Cash in", value: money(summary.paid), note: "Customer payments", accent: true }, { icon: <ArrowDownCircle />, label: "Cash out", value: money(summary.expensePaid), note: "Paid expenses" }, { icon: <Wallet />, label: "Net cash flow", value: money(summary.cashBalance), note: "Cash in − cash out", warning: summary.cashBalance < 0 }, { icon: <AlertTriangle />, label: "Receivables", value: money(summary.receivables), note: "Still to collect", warning: summary.receivables > 0 }]} />
    <section className="analysis-grid"><article className="panel finance-table"><div className="finance-toolbar"><div><p className="eyebrow">ACCOUNTS RECEIVABLE</p><h2>Customer balances</h2></div></div>{unpaidSales.length ? <div className="cash-list">{unpaidSales.slice(0, 10).map((order) => <div key={order.id}><span><strong>{order.orderNumber}</strong><small>{order.customerName || order.salesChannel}</small></span><b>{money(order.totalCents - order.amountPaidCents)}</b></div>)}</div> : <Empty text="No outstanding customer balances." icon={<Wallet />} />}</article><article className="panel finance-table"><div className="finance-toolbar"><div><p className="eyebrow">ACCOUNTS PAYABLE</p><h2>Expense balances</h2></div></div><div className="cash-list">{expenseCategoriesForCash(expenses).map(([category, value]) => <div key={category}><span><strong>{category}</strong><small>Unpaid expenses</small></span><b>{money(value)}</b></div>)}</div></article></section></div>;
}

function ReportsView({ summary, orders, products, productSales, expenseCategories, from, to, setFrom, setTo, refresh, refreshing }: { summary: FinanceSummary; orders: Sale[]; products: Product[]; productSales: { name: string; quantity: number; sales: number }[]; expenseCategories: [string, number][]; from: string; to: string; setFrom: (value: string) => void; setTo: (value: string) => void; refresh: () => void; refreshing: boolean }) {
  const exportSales = () => downloadCsv("peakathlete-sales.csv", [["Order Date", "Order ID", "Source", "Customer", "Channel", "Items", "Status", "Payment Status", "Payment Method", "Subtotal", "Discount", "Shipping", "Transaction Fee", "Total", "Net Sales", "Amount Paid"], ...orders.map((order) => [order.orderDate, order.orderNumber, order.source, order.customerName, order.salesChannel, order.itemsSummary, order.orderStatus, order.paymentStatus, order.paymentMethod, order.subtotalCents / 100, order.discountCents / 100, order.shippingFeeCents / 100, order.transactionFeeCents / 100, order.totalCents / 100, order.netSalesCents / 100, order.amountPaidCents / 100])]);
  const exportProducts = () => downloadCsv("peakathlete-products.csv", [["Product", "SKU", "Variant", "Cost", "Selling Price", "Stock", "Low Stock Threshold"], ...products.map((product) => [product.name, product.sku, product.variant, product.costCents / 100, product.sellingPriceCents / 100, product.stockQuantity, product.lowStockThreshold])]);
  const exportProfit = () => downloadCsv("peakathlete-profit-summary.csv", [["From", "To", "Net Sales", "COGS", "Gross Profit", "Expenses", "Net Profit", "Cash In", "Cash Out", "Receivables"], [from, to, summary.netSales / 100, summary.cogs / 100, summary.grossProfit / 100, summary.expenses / 100, summary.netProfit / 100, summary.paid / 100, summary.expensePaid / 100, summary.receivables / 100]]);

  const ymd = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const setQuickRange = (range: "month" | "30days" | "year") => {
    const now = new Date();
    let start = new Date(now);

    if (range === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === "30days") {
      start.setDate(now.getDate() - 29);
    } else {
      start = new Date(now.getFullYear(), 0, 1);
    }

    setFrom(ymd(start));
    setTo(ymd(now));
  };

  const openPicker = (event: MouseEvent<HTMLInputElement>) => {
    try {
      event.currentTarget.showPicker?.();
    } catch {
      event.currentTarget.focus();
    }
  };

  const rangeText = from && to ? `${dateText(from)} – ${dateText(to)}` : "Choose a date range";

  return <div className="finance-stack">
    <section className="panel report-controls report-period-card">
      <div className="report-period-heading">
        <span className="report-period-icon"><CalendarDays size={19} /></span>
        <div>
          <p className="eyebrow">REPORT PERIOD</p>
          <h2>{rangeText}</h2>
          <small>Choose a quick range or select exact dates below.</small>
        </div>
      </div>

      <div className="report-quick-ranges" aria-label="Quick report date ranges">
        <button type="button" onClick={() => setQuickRange("month")}>This month</button>
        <button type="button" onClick={() => setQuickRange("30days")}>Last 30 days</button>
        <button type="button" onClick={() => setQuickRange("year")}>This year</button>
      </div>

      <div className="report-date-fields">
        <label className="report-date-field">
          <span>From</span>
          <div><CalendarDays size={15} /><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} onClick={openPicker} /></div>
        </label>

        <span className="report-date-separator">to</span>

        <label className="report-date-field">
          <span>To</span>
          <div><CalendarDays size={15} /><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} onClick={openPicker} /></div>
        </label>

        <Button className="report-apply-button" onClick={refresh} disabled={refreshing || !from || !to || from > to}>{refreshing ? <><Loader2 className="spin" size={15} /> Updating…</> : "Apply range"}</Button>
      </div>
    </section>

    <MetricGrid items={[{ icon: <ShoppingCart />, label: "Orders", value: String(orders.length), note: rangeText, accent: true }, { icon: <TrendingUp />, label: "Net sales", value: money(summary.netSales), note: "Completed order revenue" }, { icon: <ArrowDownCircle />, label: "Expenses", value: money(summary.expenses), note: "All recorded expenses" }, { icon: <Wallet />, label: "Net profit", value: money(summary.netProfit), note: "After costs and expenses", warning: summary.netProfit < 0 }]} />

    <section className="report-export-grid"><button onClick={exportSales}><Download /><span><strong>Sales report</strong><small>Orders, payments, fees, and statuses</small></span></button><button onClick={exportProducts}><Download /><span><strong>Product report</strong><small>Pricing, costs, and inventory</small></span></button><button onClick={exportProfit}><Download /><span><strong>Profit summary</strong><small>Sales, COGS, expenses, and cash flow</small></span></button></section>

    <section className="analysis-grid"><article className="panel ranked-list"><p className="eyebrow">BEST SELLERS</p><h2>Top products</h2>{productSales.length ? productSales.slice(0, 8).map((product, index) => <div key={`${product.name}-${index}`}><span>{index + 1}</span><strong>{product.name}</strong><small>{product.quantity} sold</small><b>{money(product.sales)}</b></div>) : <Empty text="Sales data will appear here." icon={<FileBarChart />} />}</article><article className="panel ranked-list"><p className="eyebrow">EXPENSE CATEGORIES</p><h2>Highest spending</h2>{expenseCategories.length ? expenseCategories.slice(0, 8).map(([category, value], index) => <div key={category}><span>{index + 1}</span><strong>{category}</strong><small>Recorded expenses</small><b>{money(value)}</b></div>) : <Empty text="Expense data will appear here." icon={<FileBarChart />} />}</article></section>
  </div>;
}

function SaleDialog({ open, setOpen, draft, setDraft, products, editing, saving, submit }: { open: boolean; setOpen: (open: boolean) => void; draft: SaleDraft; setDraft: (draft: SaleDraft) => void; products: Product[]; editing: boolean; saving: boolean; submit: (event: FormEvent) => void }) {
  const subtotal = draft.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const total = Math.max(subtotal - Number(draft.discount || 0) + Number(draft.shippingFee || 0), 0);
  const update = (key: keyof Omit<SaleDraft, "items">) => (value: string) => setDraft({ ...draft, [key]: value });
  const updateLine = (index: number, patch: Partial<SaleLineDraft>) => setDraft({ ...draft, items: draft.items.map((item, position) => position === index ? { ...item, ...patch } : item) });
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="expense-dialog sale-dialog"><form onSubmit={submit}><DialogHeader><p className="eyebrow">{editing ? "EDIT SALE" : "NEW SALE"}</p><DialogTitle>{editing ? "Update order" : "Add a sale"}</DialogTitle><DialogDescription>Record products, payment, fulfillment, and order costs.</DialogDescription></DialogHeader><div className="form-grid"><Field label="Order date"><Text value={draft.orderDate} onChange={update("orderDate")} type="date" required /></Field><Field label="Order ID"><Text value={draft.orderNumber} onChange={update("orderNumber")} placeholder="Generated automatically" disabled={!editing} /></Field><Field label="Customer name"><Text value={draft.customerName} onChange={update("customerName")} placeholder="Optional" /></Field><Field label="Sales channel"><Choice value={draft.salesChannel} onChange={update("salesChannel")} options={channels} /></Field><Field label="Order status"><Choice value={draft.orderStatus} onChange={update("orderStatus")} options={orderStatuses} /></Field><Field label="Payment status"><Choice value={draft.paymentStatus} onChange={update("paymentStatus")} options={paymentStatuses} /></Field><Field label="Payment method"><Choice value={draft.paymentMethod} onChange={update("paymentMethod")} options={paymentMethods} /></Field><Field label="Shipping method"><Text value={draft.shippingMethod} onChange={update("shippingMethod")} placeholder="Optional" /></Field><div className="full sale-items"><div className="line-heading"><span>Products</span><Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, items: [...draft.items, { productId: "", quantity: "1", unitPrice: "" }] })}><Plus size={14} /> Add item</Button></div>{draft.items.map((item, index) => <div className="sale-line" key={index}><Choice value={item.productId} onChange={(productId) => { const product = products.find((entry) => entry.id === productId); updateLine(index, { productId, unitPrice: product ? String(product.sellingPriceCents / 100) : "" }); }} options={products.map((product) => product.id)} labels={Object.fromEntries(products.map((product) => [product.id, `${product.name}${product.variant ? ` · ${product.variant}` : ""} (${product.stockQuantity} stock)`]))} placeholder="Select product" /><Text value={item.quantity} onChange={(quantity) => updateLine(index, { quantity })} type="number" min="1" step="1" aria-label="Quantity" /><Money value={item.unitPrice} onChange={(unitPrice) => updateLine(index, { unitPrice })} /><Button type="button" variant="ghost" size="icon" disabled={draft.items.length === 1} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, position) => position !== index) })}><Trash2 size={15} /></Button></div>)}</div><Field label="Discount"><Money value={draft.discount} onChange={update("discount")} /></Field><Field label="Shipping fee"><Money value={draft.shippingFee} onChange={update("shippingFee")} /></Field><Field label="Transaction fee"><Money value={draft.transactionFee} onChange={update("transactionFee")} /></Field>{draft.paymentStatus === "Partial" ? <Field label="Amount paid"><Money value={draft.amountPaid} onChange={update("amountPaid")} /></Field> : <Field label="Calculated total"><div className="calculated-total">{peso.format(total)}</div></Field>}<Field label="Notes" full><Text value={draft.notes} onChange={update("notes")} placeholder="Optional order notes" /></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="primary-button" disabled={saving || !products.length}>{saving && <Loader2 className="spin" size={16} />}{editing ? "Save changes" : "Add sale"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ProductDialog({ open, setOpen, draft, setDraft, editing, saving, submit }: { open: boolean; setOpen: (open: boolean) => void; draft: ProductDraft; setDraft: (draft: ProductDraft) => void; editing: boolean; saving: boolean; submit: (event: FormEvent) => void }) {
  const update = (key: keyof ProductDraft) => (value: string) => setDraft({ ...draft, [key]: value });
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="budget-dialog product-dialog"><form onSubmit={submit}><DialogHeader><p className="eyebrow">{editing ? "EDIT PRODUCT" : "NEW PRODUCT"}</p><DialogTitle>{editing ? "Update product" : "Add product"}</DialogTitle><DialogDescription>Set the selling price, cost, and inventory threshold.</DialogDescription></DialogHeader><div className="form-grid"><Field label="Product name" full><Text value={draft.name} onChange={update("name")} required /></Field><Field label="SKU"><Text value={draft.sku} onChange={update("sku")} required /></Field><Field label="Variant"><Text value={draft.variant} onChange={update("variant")} placeholder="Size, color, or style" /></Field><Field label="Unit cost"><Money value={draft.cost} onChange={update("cost")} required /></Field><Field label="Selling price"><Money value={draft.sellingPrice} onChange={update("sellingPrice")} required /></Field>{!editing && <Field label="Starting stock"><Text value={draft.stockQuantity} onChange={update("stockQuantity")} type="number" min="0" step="1" required /></Field>}<Field label="Low-stock warning"><Text value={draft.lowStockThreshold} onChange={update("lowStockThreshold")} type="number" min="0" step="1" required /></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="primary-button" disabled={saving}>Save product</Button></DialogFooter></form></DialogContent></Dialog>;
}

function StockDialog({ open, setOpen, product, delta, setDelta, reason, setReason, saving, submit }: { open: boolean; setOpen: (open: boolean) => void; product: Product | null; delta: string; setDelta: (value: string) => void; reason: string; setReason: (value: string) => void; saving: boolean; submit: (event: FormEvent) => void }) {
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="budget-dialog"><form onSubmit={submit}><DialogHeader><p className="eyebrow">INVENTORY ADJUSTMENT</p><DialogTitle>{product?.name}</DialogTitle><DialogDescription>Current stock: {product?.stockQuantity ?? 0}. Use a negative number for stock out.</DialogDescription></DialogHeader><Field label="Quantity change"><Text value={delta} onChange={setDelta} type="number" step="1" placeholder="e.g. 20 or -3" required /></Field><Field label="Reason"><Text value={reason} onChange={setReason} placeholder="Restock, damaged, sample, correction…" required /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="primary-button" disabled={saving}>Adjust stock</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ImportDialog({ open, setOpen, file, setFile, saving, submit }: { open: boolean; setOpen: (open: boolean) => void; file: File | null; setFile: (file: File | null) => void; saving: boolean; submit: (event: FormEvent) => void }) {
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="budget-dialog"><form onSubmit={submit}><DialogHeader><p className="eyebrow">ENSTACK IMPORT</p><DialogTitle>Import Sales Report</DialogTitle><DialogDescription>Download the CSV Sales Report from Enstack, then upload it here. Existing Enstack Order IDs will be updated instead of duplicated.</DialogDescription></DialogHeader><Input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /><small className="dialog-note">Enstack format required: Created At, Order ID, Status, Orders, Shipping Method, Mode of Payment, Sub-total, Shipping Fee, Enstack Subsidy, Voucher Discount, Cashier Discount, Transaction Fee, Total Order Amount, Enstack Shipping Fee, Enstack Transaction Fee, Enstack Commission, Total Sales, Order notes, Date Paid, Pickup Date, Date Delivered. Maximum 10 MB.</small><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="primary-button" disabled={saving || !file}>{saving && <Loader2 className="spin" size={16} />}Import sales</Button></DialogFooter></form></DialogContent></Dialog>;
}

function MetricGrid({ items }: { items: { icon: ReactNode; label: string; value: string; note: string; accent?: boolean; warning?: boolean }[] }) { return <section className="metrics-grid">{items.map((item) => <article className={`metric-card ${item.accent ? "accent" : ""}`} key={item.label}><div className="metric-icon">{item.icon}</div><p>{item.label}</p><strong className={item.warning ? "warning" : ""}>{item.value}</strong><span>{item.note}</span></article>)}</section>; }
function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) { return <label className={`field ${full ? "full" : ""}`}><span>{label}</span>{children}</label>; }
function Text({ value, onChange, ...props }: { value: string; onChange: (value: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) { return <Input value={value} onChange={(event) => onChange(event.target.value)} {...props} />; }
function Money({ value, onChange, required = false }: { value: string; onChange: (value: string) => void; required?: boolean }) { return <div className="money-input"><b>₱</b><Text type="number" min="0" step="0.01" value={value} onChange={onChange} required={required} /></div>; }
function Choice({ value, onChange, options, labels, placeholder }: { value: string; onChange: (value: string) => void; options: string[]; labels?: Record<string, string>; placeholder?: string }) { return <Select value={value || undefined} onValueChange={onChange}><SelectTrigger className="form-select"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{labels?.[option] ?? option}</SelectItem>)}</SelectContent></Select>; }
function Status({ value }: { value: string }) { return <span className={`status-tag ${value.toLowerCase().replaceAll(" ", "-")}`}>{value}</span>; }
function Empty({ text, icon, action }: { text: string; icon: ReactNode; action?: () => void }) { return <div className="empty-state"><span>{icon}</span><h3>{text}</h3>{action && <Button onClick={action} className="primary-button"><Plus size={16} /> Add first product</Button>}</div>; }
function expenseCategoriesForCash(expenses: ExpenseMini[]) { return Object.entries(expenses.reduce<Record<string, number>>((all, expense) => ({ ...all, [expense.category]: (all[expense.category] ?? 0) + Math.max(expense.totalCents - expense.amountPaidCents, 0) }), {})).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, 10); }
function downloadCsv(filename: string, rows: Array<Array<string | number>>) { const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`; const blob = new Blob([rows.map((row) => row.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
