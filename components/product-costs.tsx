"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  Edit3,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type CatalogProduct = {
  id: string;
  name: string;
  variants: string[];
  createdAt?: string;
};

type CostItem = {
  id: string;
  item: string;
  costPerUnit: number;
  note: string;
};

type CostSheet = {
  productId: string;
  productName: string;
  variant: string;
  sellingPrice: number;
  commissionRate: number;
  taxRate: number;
  opexRate: number;
  items: CostItem[];
};

const DEFAULT_ITEMS = [
  "TELA",
  "PRINT",
  "CUT & SEW",
  "ZIPLOCK",
  "POUCH",
  "WAYBILL",
  "MISC.",
];

function blankItems(): CostItem[] {
  return DEFAULT_ITEMS.map((item) => ({
    id: crypto.randomUUID(),
    item,
    costPerUnit: 0,
    note: "",
  }));
}

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function percent(value: number) {
  return `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;
}

function cleanVariants(values: string[]) {
  const seen = new Set<string>();

  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function ProductCosts() {
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [variant, setVariant] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sellingPrice, setSellingPrice] = useState(0);
  const [commissionRate, setCommissionRate] = useState(30);
  const [taxRate, setTaxRate] = useState(25);
  const [opexRate, setOpexRate] = useState(20);
  const [items, setItems] = useState<CostItem[]>(blankItems());

  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(
    null,
  );
  const [deleteProduct, setDeleteProduct] = useState<CatalogProduct | null>(
    null,
  );
  const [productNameDraft, setProductNameDraft] = useState("");
  const [variantDrafts, setVariantDrafts] = useState<string[]>(["Men", "Women"]);
  const [catalogSaving, setCatalogSaving] = useState(false);

  const selectedProduct = catalog.find(
    (entry) => entry.id === selectedProductId,
  );

  const sheetReady = Boolean(selectedProductId && variant);

  const resetSheet = useCallback(() => {
    setSellingPrice(0);
    setCommissionRate(30);
    setTaxRate(25);
    setOpexRate(20);
    setItems(blankItems());
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);

    try {
      const response = await fetch("/api/product-costs?mode=catalog", {
        cache: "no-store",
      });

      const result = (await response.json()) as {
        products?: CatalogProduct[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Couldn’t load products.");
      }

      setCatalog(result.products ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn’t load products.",
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const loadSheet = useCallback(async () => {
    if (!selectedProductId || !variant) return;

    setLoading(true);

    try {
      const response = await fetch(
        `/api/product-costs?mode=sheet&productId=${encodeURIComponent(
          selectedProductId,
        )}&variant=${encodeURIComponent(variant)}`,
        { cache: "no-store" },
      );

      const result = (await response.json()) as {
        sheet?: CostSheet | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Couldn’t load product costs.");
      }

      if (!result.sheet) {
        resetSheet();
        return;
      }

      setSellingPrice(Number(result.sheet.sellingPrice) || 0);
      setCommissionRate(Number(result.sheet.commissionRate) || 0);
      setTaxRate(Number(result.sheet.taxRate) || 0);
      setOpexRate(Number(result.sheet.opexRate) || 0);
      setItems(
        Array.isArray(result.sheet.items) && result.sheet.items.length
          ? result.sheet.items.map((item) => ({
              id: item.id || crypto.randomUUID(),
              item: item.item ?? "",
              costPerUnit: Number(item.costPerUnit) || 0,
              note: item.note ?? "",
            }))
          : blankItems(),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t load product costs.",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, variant, resetSheet]);

  useEffect(() => {
    if (sheetReady) void loadSheet();
  }, [sheetReady, loadSheet]);

  const totals = useMemo(() => {
    const cogs = items.reduce(
      (sum, item) => sum + (Number(item.costPerUnit) || 0),
      0,
    );

    const commission = sellingPrice * (commissionRate / 100);
    const totalCost = cogs + commission;
    const grossProfit = sellingPrice - totalCost;
    const grossMargin =
      sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;

    const opex = sellingPrice * (opexRate / 100);
    const taxableProfit = Math.max(grossProfit - opex, 0);
    const taxes = taxableProfit * (taxRate / 100);
    const netProfit = grossProfit - opex - taxes;
    const netMargin =
      sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;

    const ebitda = grossProfit - opex;
    const ebitdaMargin =
      sellingPrice > 0 ? (ebitda / sellingPrice) * 100 : 0;

    return {
      cogs,
      commission,
      totalCost,
      grossProfit,
      grossMargin,
      taxes,
      opex,
      netProfit,
      netMargin,
      ebitda,
      ebitdaMargin,
    };
  }, [
    items,
    sellingPrice,
    commissionRate,
    taxRate,
    opexRate,
  ]);

  const chooseProduct = (product: CatalogProduct) => {
    setSelectedProductId(product.id);
    setVariant("");

    if (product.variants.length === 1) {
      setVariant(product.variants[0]);
    }
  };

  const updateItem = (
    id: string,
    key: keyof Pick<CostItem, "item" | "costPerUnit" | "note">,
    value: string,
  ) => {
    setItems((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              [key]:
                key === "costPerUnit"
                  ? Number(value) || 0
                  : value,
            }
          : row,
      ),
    );
  };

  const addRow = () => {
    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        item: "",
        costPerUnit: 0,
        note: "",
      },
    ]);
  };

  const removeRow = (id: string) => {
    setItems((current) => current.filter((row) => row.id !== id));
  };

  const saveSheet = async () => {
    if (!sheetReady || !selectedProduct) return;

    setSaving(true);

    try {
      const response = await fetch("/api/product-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveSheet",
          productId: selectedProduct.id,
          variant,
          sellingPrice,
          commissionRate,
          taxRate,
          opexRate,
          items,
        }),
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Couldn’t save product costs.");
      }

      toast.success(`${selectedProduct.name} · ${variant} costs saved`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t save product costs.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openAddProduct = () => {
    setEditingProduct(null);
    setProductNameDraft("");
    setVariantDrafts(["Men", "Women"]);
    setProductDialogOpen(true);
  };

  const openEditProduct = (
    event: React.MouseEvent,
    product: CatalogProduct,
  ) => {
    event.stopPropagation();
    setEditingProduct(product);
    setProductNameDraft(product.name);
    setVariantDrafts(product.variants.length ? [...product.variants] : [""]);
    setProductDialogOpen(true);
  };

  const requestDeleteProduct = (
    event: React.MouseEvent,
    product: CatalogProduct,
  ) => {
    event.stopPropagation();
    setDeleteProduct(product);
  };

  const addVariantDraft = () => {
    setVariantDrafts((current) => [...current, ""]);
  };

  const updateVariantDraft = (index: number, value: string) => {
    setVariantDrafts((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? value : entry,
      ),
    );
  };

  const removeVariantDraft = (index: number) => {
    setVariantDrafts((current) =>
      current.filter((_, entryIndex) => entryIndex !== index),
    );
  };

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();

    const cleanName = productNameDraft.trim();
    const variants = cleanVariants(variantDrafts);

    if (!cleanName) {
      toast.error("Enter a product name.");
      return;
    }

    if (!variants.length) {
      toast.error("Add at least one variant.");
      return;
    }

    setCatalogSaving(true);

    try {
      const response = await fetch("/api/product-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingProduct ? "updateProduct" : "createProduct",
          id: editingProduct?.id,
          name: cleanName,
          variants,
        }),
      });

      const result = (await response.json()) as {
        product?: CatalogProduct;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Couldn’t save product.");
      }

      setProductDialogOpen(false);
      await loadCatalog();

      if (editingProduct && selectedProductId === editingProduct.id) {
        const updatedVariants = result.product?.variants ?? variants;

        if (!updatedVariants.includes(variant)) {
          setVariant("");
        }
      }

      toast.success(editingProduct ? "Product updated" : "Product added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn’t save product.",
      );
    } finally {
      setCatalogSaving(false);
    }
  };

  const confirmDeleteProduct = async () => {
    if (!deleteProduct) return;

    setCatalogSaving(true);

    try {
      const response = await fetch(
        `/api/product-costs?mode=product&id=${encodeURIComponent(
          deleteProduct.id,
        )}`,
        { method: "DELETE" },
      );

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Couldn’t delete product.");
      }

      if (selectedProductId === deleteProduct.id) {
        setSelectedProductId("");
        setVariant("");
      }

      setDeleteProduct(null);
      await loadCatalog();
      toast.success("Product deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn’t delete product.",
      );
    } finally {
      setCatalogSaving(false);
    }
  };

  if (!selectedProductId) {
    return (
      <section className="product-costs-page">
        <div className="product-costs-home-header">
          <div className="product-costs-intro">
            <p className="eyebrow">PRODUCT COST SHEETS</p>
            <h2>Choose a product</h2>
            <p>
              Select a product to open its cost sheet, or add a new product.
            </p>
          </div>

          <Button
            type="button"
            className="primary-button"
            onClick={openAddProduct}
          >
            <Plus size={17} />
            Add product
          </Button>
        </div>

        {catalogLoading ? (
          <div className="product-cost-loading">
            <Loader2 className="spin" size={22} />
            Loading products…
          </div>
        ) : catalog.length === 0 ? (
          <div className="product-cost-empty">
            <strong>No products yet</strong>
            <span>Add your first product to start building cost sheets.</span>
            <Button
              type="button"
              className="primary-button"
              onClick={openAddProduct}
            >
              <Plus size={17} />
              Add product
            </Button>
          </div>
        ) : (
          <div className="product-cost-grid">
            {catalog.map((product) => (
              <button
                key={product.id}
                type="button"
                className="product-cost-choice"
                onClick={() => chooseProduct(product)}
              >
                <div className="product-cost-choice-copy">
                  <strong>{product.name}</strong>
                  <span>{product.variants.join(" · ")}</span>
                </div>

                <div className="product-cost-choice-actions">
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit ${product.name}`}
                    onClick={(event) => openEditProduct(event, product)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openEditProduct(
                          event as unknown as React.MouseEvent,
                          product,
                        );
                      }
                    }}
                  >
                    <Edit3 size={15} />
                  </span>

                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Delete ${product.name}`}
                    onClick={(event) => requestDeleteProduct(event, product)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        requestDeleteProduct(
                          event as unknown as React.MouseEvent,
                          product,
                        );
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
          <DialogContent className="product-catalog-dialog">
            <form onSubmit={saveProduct}>
              <DialogHeader>
                <p className="eyebrow">PRODUCT SETUP</p>
                <DialogTitle>
                  {editingProduct ? "Edit product" : "Add product"}
                </DialogTitle>
                <DialogDescription>
                  Add the product name and the variants that should have separate
                  cost sheets.
                </DialogDescription>
              </DialogHeader>

              <div className="product-catalog-form">
                <label className="field">
                  <span>Product name</span>
                  <Input
                    value={productNameDraft}
                    onChange={(event) =>
                      setProductNameDraft(event.target.value)
                    }
                    placeholder="e.g. Sports Bra"
                    required
                  />
                </label>

                <div className="product-catalog-variants">
                  <div className="product-catalog-variants-header">
                    <span>Variants</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addVariantDraft}
                    >
                      <Plus size={14} />
                      Add variant
                    </Button>
                  </div>

                  {variantDrafts.map((entry, index) => (
                    <div
                      className="product-catalog-variant-row"
                      key={`${index}-${entry}`}
                    >
                      <Input
                        value={entry}
                        onChange={(event) =>
                          updateVariantDraft(index, event.target.value)
                        }
                        placeholder="e.g. Men, Women, Unisex"
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove variant"
                        onClick={() => removeVariantDraft(index)}
                        disabled={variantDrafts.length <= 1}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setProductDialogOpen(false)}
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  className="primary-button"
                  disabled={catalogSaving}
                >
                  {catalogSaving ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <Save size={17} />
                  )}
                  {editingProduct ? "Save changes" : "Add product"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(deleteProduct)}
          onOpenChange={(open) => {
            if (!open) setDeleteProduct(null);
          }}
        >
          <DialogContent className="product-delete-dialog">
            <DialogHeader>
              <DialogTitle>Delete product?</DialogTitle>
              <DialogDescription>
                {deleteProduct
                  ? `${deleteProduct.name} and all of its saved cost sheets will be permanently deleted.`
                  : ""}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteProduct(null)}
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={confirmDeleteProduct}
                disabled={catalogSaving}
              >
                {catalogSaving ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    );
  }

  if (!variant && selectedProduct) {
    return (
      <section className="product-costs-page">
        <Button
          type="button"
          variant="ghost"
          className="product-cost-back"
          onClick={() => setSelectedProductId("")}
        >
          <ArrowLeft size={16} />
          Products
        </Button>

        <div className="product-costs-intro">
          <p className="eyebrow">{selectedProduct.name.toUpperCase()}</p>
          <h2>Choose a variant</h2>
          <p>
            Each variant has its own saved product cost sheet.
          </p>
        </div>

        <div className="product-cost-gender-grid">
          {selectedProduct.variants.map((entry) => (
            <button
              key={entry}
              type="button"
              className="product-cost-choice"
              onClick={() => setVariant(entry)}
            >
              <strong>{entry}</strong>
              <span>{selectedProduct.name} cost sheet</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (!selectedProduct) {
    return null;
  }

  return (
    <section className="product-costs-page">
      <div className="product-cost-sheet-header">
        <div>
          <Button
            type="button"
            variant="ghost"
            className="product-cost-back"
            onClick={() => {
              if (selectedProduct.variants.length === 1) {
                setSelectedProductId("");
                setVariant("");
              } else {
                setVariant("");
              }
            }}
          >
            <ArrowLeft size={16} />
            Back
          </Button>

          <p className="eyebrow">PRODUCT COST SHEET</p>
          <h2>
            {selectedProduct.name} · {variant}
          </h2>
        </div>

        <Button
          type="button"
          className="primary-button"
          onClick={saveSheet}
          disabled={saving || loading}
        >
          {saving ? (
            <Loader2 className="spin" size={17} />
          ) : (
            <Save size={17} />
          )}
          Save
        </Button>
      </div>

      {loading ? (
        <div className="product-cost-loading">
          <Loader2 className="spin" size={22} />
          Loading cost sheet…
        </div>
      ) : (
        <>
          <div className="product-cost-main-grid">
            <div className="product-cost-table-card">
              <div className="product-cost-table-scroll">
                <table className="product-cost-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Cost Per Unit</th>
                      <th>Note</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>

                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Input
                            value={row.item}
                            onChange={(event) =>
                              updateItem(row.id, "item", event.target.value)
                            }
                            placeholder="Item"
                          />
                        </td>

                        <td>
                          <div className="product-cost-money-field">
                            <span className="product-cost-currency">₱</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.costPerUnit}
                              onChange={(event) =>
                                updateItem(
                                  row.id,
                                  "costPerUnit",
                                  event.target.value,
                                )
                              }
                            />
                          </div>
                        </td>

                        <td>
                          <Input
                            value={row.note}
                            onChange={(event) =>
                              updateItem(row.id, "note", event.target.value)
                            }
                            placeholder="Add note"
                          />
                        </td>

                        <td>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${row.item || "cost item"}`}
                            onClick={() => removeRow(row.id)}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  <tfoot>
                    <tr>
                      <td>
                        <strong>TOTAL</strong>
                      </td>
                      <td>
                        <strong>{money(totals.cogs)}</strong>
                      </td>
                      <td colSpan={2}>Per unit cost</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <Button
                type="button"
                variant="outline"
                className="product-cost-add-row"
                onClick={addRow}
              >
                <Plus size={16} />
                Add item
              </Button>

              <div className="product-cost-selling-price">
                <label>
                  <span>Final selling price</span>
                  <div className="product-cost-money-field large">
                    <span className="product-cost-currency">₱</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={sellingPrice}
                      onChange={(event) =>
                        setSellingPrice(Number(event.target.value) || 0)
                      }
                    />
                  </div>
                </label>
              </div>
            </div>

            <div className="product-cost-summary-card">
              <div className="product-cost-summary-row">
                <strong>{money(totals.cogs)}</strong>
                <span>COST OF GOODS</span>
              </div>

              <div className="product-cost-summary-row editable-rate-row">
                <strong>{money(totals.commission)}</strong>
                <label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={commissionRate}
                    onChange={(event) =>
                      setCommissionRate(Number(event.target.value) || 0)
                    }
                  />
                  <span>% COMMISSIONS & PLATFORM FEES</span>
                </label>
              </div>

              <div className="product-cost-summary-spacer" />

              <div className="product-cost-summary-row selling">
                <strong>{money(sellingPrice)}</strong>
                <span>SELLING PRICE</span>
              </div>

              <div className="product-cost-summary-row">
                <strong>{money(totals.totalCost)}</strong>
                <span>TOTAL COST</span>
              </div>

              <div className="product-cost-summary-spacer" />

              <div className="product-cost-summary-row">
                <strong>{money(totals.grossProfit)}</strong>
                <span>GROSS PROFIT</span>
              </div>

              <div className="product-cost-summary-row margin">
                <strong>{percent(totals.grossMargin)}</strong>
                <span>GROSS PROFIT MARGIN</span>
              </div>

              <div className="product-cost-summary-row editable-rate-row">
                <strong>{money(totals.taxes)}</strong>
                <label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={taxRate}
                    onChange={(event) =>
                      setTaxRate(Number(event.target.value) || 0)
                    }
                  />
                  <span>% TAXES</span>
                </label>
              </div>

              <div className="product-cost-summary-row editable-rate-row">
                <strong>{money(totals.opex)}</strong>
                <label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={opexRate}
                    onChange={(event) =>
                      setOpexRate(Number(event.target.value) || 0)
                    }
                  />
                  <span>% OPEX</span>
                </label>
              </div>

              <div className="product-cost-summary-spacer" />

              <div className="product-cost-summary-row">
                <strong>{money(totals.netProfit)}</strong>
                <span>NET PROFIT</span>
              </div>

              <div className="product-cost-summary-row net-margin">
                <strong>{percent(totals.netMargin)}</strong>
                <span>NET PROFIT MARGIN</span>
              </div>

              <div className="product-cost-summary-spacer" />

              <div className="product-cost-summary-row ebitda">
                <strong>{money(totals.ebitda)}</strong>
                <span>EBITDA · {percent(totals.ebitdaMargin)}</span>
              </div>
            </div>
          </div>

          <p className="product-cost-formula-note">
            Taxes are calculated after OPEX. EBITDA is gross profit minus OPEX.
          </p>
        </>
      )}
    </section>
  );
}
