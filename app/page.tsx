"use client";

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import {
  Banknote,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FileImage,
  LayoutDashboard,
  Loader2,
  Package,
  PackageSearch,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Wallet,
  WalletCards,
} from "lucide-react";

import {
  FinanceSuite,
  type FinanceView,
} from "@/components/finance-suite";

import { AthleteReceipts } from "@/components/athlete-receipts";
import { ProductCosts } from "@/components/product-costs";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Toaster } from "@/components/ui/sonner";

type View =
  | "overview"
  | "expenses"
  | "athleteReceipts"
  | "productCosts"
  | FinanceView;

type Expense = {
  id: string;
  expenseDate: string;
  expenseNumber: string;
  receiptReference: string;
  vendor: string;
  expenseType: string;
  category: string;
  subcategory: string;
  description: string;
  quantity: number;
  unitCostCents: number;
  taxFeesCents: number;
  totalCents: number;
  amountPaidCents: number;
  paymentMethod: string;
  paymentStatus: string;
  productCollection: string;
  receiptUrl: string;
  notes: string;
};

type Draft = Record<
  string,
  string
>;

type ExpenseResponse = {
  expenses: Expense[];
  budgetCents: number;
};

const expenseTypes = [
  "Operating Expense",
  "Inventory / Production",
  "Capital Expenditure",
  "Other",
];

const categories: Record<
  string,
  string[]
> = {
  "Operating Expense": [
    "Marketing / Ads",
    "Shipping / Courier",
    "Packaging",
    "Website / Software",
    "Salaries / Labor",
    "Rent / Utilities",
    "Professional Fees",
    "Bank / Payment Fees",
    "Photoshoot / Content",
    "Transportation",
    "Office Supplies",
    "Permits / Taxes",
    "Repairs / Equipment",
    "Other Operating",
  ],

  "Inventory / Production": [
    "Sampling",
    "Fabric / Materials",
    "Manufacturing",
    "Printing / Embroidery",
    "Labels / Tags",
    "Production Packaging",
    "Other Production",
  ],

  "Capital Expenditure": [
    "Equipment",
    "Computers / Devices",
    "Furniture / Fixtures",
    "Machinery",
    "Store Improvement",
    "Other Capital",
  ],

  Other: [
    "Permits / Taxes",
    "Professional Fees",
    "Miscellaneous",
    "Other",
  ],
};

const paymentMethods = [
  "Cash",
  "GCash",
  "Maya",
  "GoTyme",
  "MariBank",
  "Bank Transfer",
  "Credit Card",
  "Debit Card",
  "Other",
];

const paymentStatuses = [
  "Unpaid",
  "Partial",
  "Paid",
];

const peso =
  new Intl.NumberFormat(
    "en-PH",
    {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 2,
    },
  );

const shortDate =
  new Intl.DateTimeFormat(
    "en-PH",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  );

const today = () =>
  new Date()
    .toISOString()
    .slice(0, 10);

/* =========================
   DATE HELPERS
========================= */

function monthLabel(
  month: string,
) {
  const match =
    /^(\d{4})-(0[1-9]|1[0-2])$/.exec(
      month,
    );

  if (!match) {
    return "selected month";
  }

  const year =
    Number(match[1]);

  const monthIndex =
    Number(match[2]) - 1;

  const date =
    new Date(
      year,
      monthIndex,
      1,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "selected month";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      month: "long",
      year: "numeric",
    },
  ).format(date);
}

function dateLabel(
  date: string,
) {
  const clean =
    date?.slice(0, 10) ?? "";

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      clean,
    )
  ) {
    return "—";
  }

  const parsed =
    new Date(
      `${clean}T00:00:00`,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return "—";
  }

  return shortDate.format(
    parsed,
  );
}

function moneyFromCents(
  value: number,
) {
  return peso.format(
    value / 100,
  );
}

function draftTotal(
  draft: Draft,
) {
  return Math.max(
    Number(
      draft.quantity || 0,
    ) *
      Number(
        draft.unitCost || 0,
      ) +
      Number(
        draft.taxFees || 0,
      ),
    0,
  );
}

function initialDraft(): Draft {
  return {
    expenseDate: today(),

    expenseNumber: "",

    receiptReference: "",

    vendor: "",

    expenseType: "",

    category: "",

    subcategory: "",

    description: "",

    quantity: "1",

    unitCost: "",

    taxFees: "0",

    amountPaid: "0",

    paymentStatus:
      "Unpaid",

    paymentMethod:
      "GCash",

    productCollection: "",

    receiptUrl: "",

    notes: "",
  };
}

function BrandMark() {
  return (
    <div
      className="brand-mark"
      aria-label="PeakAthlete"
    >
      <span className="brand-emblem">
        PA
      </span>

      <span className="brand-name">
        PEAK
        <span>
          ATHLETE
        </span>
        <i />
      </span>
    </div>
  );
}

/* =========================
   HOME
========================= */

export default function Home() {
  const [
    view,
    setView,
  ] =
    useState<View>(
      "overview",
    );

  const [
    expenses,
    setExpenses,
  ] =
    useState<Expense[]>(
      [],
    );

  const [
    budgetCents,
    setBudgetCents,
  ] =
    useState(0);

  const [
    month,
    setMonth,
  ] =
    useState(
      new Date()
        .toISOString()
        .slice(0, 7),
    );

  const [
    monthInput,
    setMonthInput,
  ] =
    useState(month);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    expenseDialog,
    setExpenseDialog,
  ] =
    useState(false);

  const [
    budgetDialog,
    setBudgetDialog,
  ] =
    useState(false);

  const [
    editingId,
    setEditingId,
  ] =
    useState<
      string | null
    >(null);

  const [
    deleteTarget,
    setDeleteTarget,
  ] =
    useState<
      Expense | null
    >(null);

  const [
    draft,
    setDraft,
  ] =
    useState<Draft>(
      initialDraft,
    );

  const [
    budgetAmount,
    setBudgetAmount,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    typeFilter,
    setTypeFilter,
  ] =
    useState(
      "All types",
    );

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState(
      "All statuses",
    );

  const [
    receiptFile,
    setReceiptFile,
  ] =
    useState<
      File | null
    >(null);

  const expenseView =
    view === "overview" ||
    view === "expenses";

  const viewTitles:
    Record<
      View,
      {
        eyebrow: string;
        title: string;
      }
    > = {
    overview: {
      eyebrow:
        "EXPENSE CONTROL CENTER",

      title:
        "Overview",
    },

    expenses: {
      eyebrow:
        "EXPENSE RECORDS",

      title:
        statusFilter ===
        "Unpaid"
          ? "Unpaid expenses"
          : "All expenses",
    },

    sales: {
      eyebrow:
        "REVENUE WORKSPACE",

      title:
        "Sales & orders",
    },

    products: {
      eyebrow:
        "INVENTORY CONTROL",

      title:
        "Products & inventory",
    },

    profit: {
      eyebrow:
        "BUSINESS PERFORMANCE",

      title:
        "Profit tracking",
    },

    cashflow: {
      eyebrow:
        "MONEY MOVEMENT",

      title:
        "Cash flow",
    },

    reports: {
      eyebrow:
        "BUSINESS INSIGHTS",

      title:
        "Reports",
    },

    athleteReceipts: {
      eyebrow:
        "ATHLETE RECORDS",

      title:
        "Athlete receipts",
    },

    productCosts: {
      eyebrow:
        "PRODUCT PROFITABILITY",

      title:
        "Product costs",
    },
  };

  const knownExpenseTypes =
    useMemo(
      () =>
        Array.from(
          new Set([
            ...expenseTypes,

            ...expenses.map(
              (item) =>
                item.expenseType,
            ),
          ]),
        ),

      [expenses],
    );

  const knownCategories =
    useMemo(
      () =>
        Array.from(
          new Set([
            ...(
              categories[
                draft
                  .expenseType
              ] ?? []
            ),

            ...expenses
              .filter(
                (item) =>
                  item.expenseType ===
                  draft.expenseType,
              )
              .map(
                (item) =>
                  item.category,
              ),
          ]),
        ),

      [
        draft.expenseType,
        expenses,
      ],
    );

  /* =========================
     LOAD EXPENSES
  ========================= */

  const loadExpenses =
    useCallback(
      async () => {
        setLoading(true);

        try {
          const response =
            await fetch(
              `/api/expense-data?month=${encodeURIComponent(
                month,
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          if (
            !response.ok
          ) {
            let message =
              "Unable to load expenses";

            try {
              const result =
                (await response.json()) as {
                  error?: string;
                };

              if (
                result.error
              ) {
                message =
                  result.error;
              }
            } catch {
              // Ignore invalid JSON.
            }

            throw new Error(
              message,
            );
          }

          const result =
            (await response.json()) as ExpenseResponse;

          setExpenses(
            result.expenses ??
              [],
          );

          setBudgetCents(
            result.budgetCents ??
              0,
          );
        } catch (
          error
        ) {
          toast.error(
            error instanceof
              Error
              ? error.message
              : "Couldn’t load your expenses. Please try again.",
          );
        } finally {
          setLoading(false);
        }
      },

      [month],
    );

  useEffect(() => {
    const timer =
      window.setTimeout(
        () =>
          void loadExpenses(),
        0,
      );

    return () =>
      window.clearTimeout(
        timer,
      );
  }, [loadExpenses]);

  /* =========================
     SUMMARY
  ========================= */

  const summary =
    useMemo(() => {
      const total =
        expenses.reduce(
          (
            sum,
            item,
          ) =>
            sum +
            item.totalCents,
          0,
        );

      const paid =
        expenses.reduce(
          (
            sum,
            item,
          ) =>
            sum +
            item.amountPaidCents,
          0,
        );

      const outstanding =
        Math.max(
          total - paid,
          0,
        );

      const operating =
        expenses
          .filter(
            (item) =>
              item.expenseType ===
              "Operating Expense",
          )
          .reduce(
            (
              sum,
              item,
            ) =>
              sum +
              item.totalCents,
            0,
          );

      const production =
        expenses
          .filter(
            (item) =>
              item.expenseType ===
              "Inventory / Production",
          )
          .reduce(
            (
              sum,
              item,
            ) =>
              sum +
              item.totalCents,
            0,
          );

      const byCategory =
        Object.entries(
          expenses.reduce<
            Record<
              string,
              number
            >
          >(
            (
              result,
              item,
            ) => {
              result[
                item.category
              ] =
                (
                  result[
                    item.category
                  ] ?? 0
                ) +
                item.totalCents;

              return result;
            },
            {},
          ),
        ).sort(
          (a, b) =>
            b[1] - a[1],
        );

      return {
        total,
        paid,
        outstanding,
        operating,
        production,

        remaining:
          budgetCents -
          total,

        byCategory,
      };
    }, [
      expenses,
      budgetCents,
    ]);

  /* =========================
     FILTER EXPENSES
  ========================= */

  const filtered =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return expenses.filter(
        (item) => {
          const text = [
            item.expenseNumber,
            item.vendor,
            item.category,
            item.subcategory,
            item.description,
            item.productCollection,
            item.receiptReference,
          ]
            .join(" ")
            .toLowerCase();

          return (
            (!query ||
              text.includes(
                query,
              )) &&
            (typeFilter ===
              "All types" ||
              item.expenseType ===
                typeFilter) &&
            (statusFilter ===
              "All statuses" ||
              item.paymentStatus ===
                statusFilter)
          );
        },
      );
    }, [
      expenses,
      search,
      typeFilter,
      statusFilter,
    ]);

  /* =========================
     OPEN / EDIT
  ========================= */

  const openNew =
    useCallback(() => {
      setEditingId(
        null,
      );

      setDraft(
        initialDraft(),
      );

      setReceiptFile(
        null,
      );

      setExpenseDialog(
        true,
      );
    }, []);

  const openEdit = (
    item: Expense,
  ) => {
    setEditingId(
      item.id,
    );

    setReceiptFile(
      null,
    );

    setDraft({
      expenseDate:
        item.expenseDate
          ? item.expenseDate.slice(0, 10)
          : today(),

      expenseNumber:
        item.expenseNumber,

      receiptReference:
        item.receiptReference,

      vendor:
        item.vendor,

      expenseType:
        item.expenseType,

      category:
        item.category,

      subcategory:
        item.subcategory,

      description:
        item.description,

      quantity:
        String(
          item.quantity,
        ),

      unitCost:
        String(
          item.unitCostCents /
            100,
        ),

      taxFees:
        String(
          item.taxFeesCents /
            100,
        ),

      amountPaid:
        String(
          item.amountPaidCents /
            100,
        ),

      paymentStatus:
        item.paymentStatus,

      paymentMethod:
        item.paymentMethod,

      productCollection:
        item.productCollection,

      receiptUrl:
        item.receiptUrl,

      notes:
        item.notes,
    });

    setExpenseDialog(
      true,
    );
  };

  /* =========================
     SAVE EXPENSE
  ========================= */

  const saveExpense =
    async (
      event: FormEvent,
    ) => {
      event.preventDefault();

      const total =
        draftTotal(
          draft,
        );

      const amountPaid =
        draft.paymentStatus ===
        "Paid"
          ? total
          : draft.paymentStatus ===
              "Unpaid"
            ? 0
            : Number(
                draft.amountPaid ||
                  0,
              );

      let uploadedReceiptUrl =
        "";

      setSaving(true);

      try {
        let receiptUrl =
          draft.receiptUrl;

        if (receiptFile) {
          const form =
            new FormData();

          form.append(
            "file",
            receiptFile,
          );

          const uploadResponse =
            await fetch(
              "/api/receipts",
              {
                method:
                  "POST",

                body: form,
              },
            );

          const uploadResult =
            (await uploadResponse.json()) as {
              receiptUrl?: string;
              error?: string;
            };

          if (
            !uploadResponse.ok ||
            !uploadResult.receiptUrl
          ) {
            throw new Error(
              uploadResult.error ??
                "Couldn’t upload receipt image",
            );
          }

          receiptUrl =
            uploadResult.receiptUrl;

          uploadedReceiptUrl =
            receiptUrl;
        }

        const response =
          await fetch(
            "/api/expense-data",
            {
              method:
                editingId
                  ? "PATCH"
                  : "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(
                  {
                    resource:
                      "expense",

                    id:
                      editingId,

                    ...draft,

                    receiptUrl,

                    amountPaid,
                  },
                ),
            },
          );

        const result =
          (await response.json()) as {
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            result.error ??
              "Couldn’t save expense",
          );
        }

        await loadExpenses();

        setExpenseDialog(
          false,
        );

        setReceiptFile(
          null,
        );

        toast.success(
          editingId
            ? "Expense updated"
            : "Expense added",
        );
      } catch (
        error
      ) {
        if (
          uploadedReceiptUrl.startsWith(
            "/api/receipts/",
          )
        ) {
          const key =
            decodeURIComponent(
              uploadedReceiptUrl.slice(
                "/api/receipts/"
                  .length,
              ),
            );

          void fetch(
            `/api/receipts?key=${encodeURIComponent(
              key,
            )}`,
            {
              method:
                "DELETE",
            },
          );
        }

        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn’t save this expense.",
        );
      } finally {
        setSaving(false);
      }
    };

  /* =========================
     SAVE BUDGET
  ========================= */

  const saveBudget =
    async (
      event: FormEvent,
    ) => {
      event.preventDefault();

      if (
        !/^(\d{4})-(0[1-9]|1[0-2])$/.test(
          month,
        )
      ) {
        toast.error(
          "Please select a valid month.",
        );

        return;
      }

      setSaving(true);

      try {
        const response =
          await fetch(
            "/api/expense-data",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(
                  {
                    resource:
                      "budget",

                    month,

                    amount:
                      budgetAmount,
                  },
                ),
            },
          );

        if (!response.ok) {
          let message =
            "Couldn’t save budget";

          try {
            const result =
              (await response.json()) as {
                error?: string;
              };

            if (
              result.error
            ) {
              message =
                result.error;
            }
          } catch {
            // Ignore invalid JSON.
          }

          throw new Error(
            message,
          );
        }

        await loadExpenses();

        setBudgetDialog(
          false,
        );

        toast.success(
          "Monthly budget updated",
        );
      } catch (
        error
      ) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn’t save the monthly budget.",
        );
      } finally {
        setSaving(false);
      }
    };

  /* =========================
     DELETE EXPENSE
  ========================= */

  const deleteExpense =
    async () => {
      if (!deleteTarget) {
        return;
      }

      try {
        const response =
          await fetch(
            `/api/expense-data?id=${encodeURIComponent(
              deleteTarget.id,
            )}`,
            {
              method:
                "DELETE",
            },
          );

        if (!response.ok) {
          throw new Error(
            "Couldn’t delete expense",
          );
        }

        setDeleteTarget(
          null,
        );

        await loadExpenses();

        toast.success(
          "Expense deleted",
        );
      } catch {
        toast.error(
          "Couldn’t delete this expense.",
        );
      }
    };

  /* =========================
     OPTIONAL WEBMCP
  ========================= */

  useEffect(() => {
    const context =
      (
        document as Document & {
          modelContext?: {
            registerTool: (
              tool: Record<
                string,
                unknown
              >,

              options?: {
                signal?:
                  AbortSignal;
              },
            ) => void;
          };
        }
      ).modelContext;

    if (
      !context?.registerTool
    ) {
      return;
    }

    const lifecycle =
      new AbortController();

    try {
      context.registerTool(
        {
          name:
            "read_expense_summary",

          title:
            "Read expense summary",

          description:
            "Read the current PeakAthlete monthly expense, payment, and budget summary.",

          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties:
              false,
          },

          annotations: {
            readOnlyHint:
              true,

            untrustedContentHint:
              true,
          },

          execute:
            async () => ({
              month,

              totalCents:
                summary.total,

              paidCents:
                summary.paid,

              outstandingCents:
                summary.outstanding,

              budgetCents,

              expenseCount:
                expenses.length,
            }),
        },

        {
          signal:
            lifecycle.signal,
        },
      );

      context.registerTool(
        {
          name:
            "start_expense_entry",

          title:
            "Start expense entry",

          description:
            "Open a blank PeakAthlete expense form without saving a record.",

          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties:
              false,
          },

          annotations: {
            readOnlyHint:
              false,

            untrustedContentHint:
              false,
          },

          execute:
            async () => {
              openNew();

              return {
                status:
                  "form_opened",
              };
            },
        },

        {
          signal:
            lifecycle.signal,
        },
      );
    } catch {
      // App still works if WebMCP is unavailable.
    }

    return () =>
      lifecycle.abort();
  }, [
    budgetCents,
    expenses.length,
    month,
    openNew,
    summary,
  ]);

  /* =========================
     UI
  ========================= */

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width":
            "244px",
        } as React.CSSProperties
      }
    >
      <Sidebar
        collapsible="offcanvas"
        className="brand-sidebar"
      >
        <SidebarHeader className="brand-sidebar-header">
          <BrandMark />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              Expense workspace
            </SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      view ===
                      "overview"
                    }
                    onClick={() =>
                      setView(
                        "overview",
                      )
                    }
                  >
                    <LayoutDashboard />

                    <span>
                      Overview
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      view ===
                        "expenses" &&
                      statusFilter ===
                        "All statuses"
                    }
                    onClick={() => {
                      setView(
                        "expenses",
                      );

                      setStatusFilter(
                        "All statuses",
                      );
                    }}
                  >
                    <ReceiptText />

                    <span>
                      All expenses
                    </span>

                    <b>
                      {
                        expenses.length
                      }
                    </b>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      view ===
                        "expenses" &&
                      statusFilter ===
                        "Unpaid"
                    }
                    onClick={() => {
                      setView(
                        "expenses",
                      );

                      setStatusFilter(
                        "Unpaid",
                      );
                    }}
                  >
                    <CreditCard />

                    <span>
                      Unpaid
                    </span>

                    <b>
                      {
                        expenses.filter(
                          (
                            item,
                          ) =>
                            item.paymentStatus ===
                            "Unpaid",
                        ).length
                      }
                    </b>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      view ===
                      "athleteReceipts"
                    }
                    onClick={() =>
                      setView(
                        "athleteReceipts",
                      )
                    }
                  >
                    <FileImage />

                    <span>
                      Athlete receipts
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      view ===
                      "productCosts"
                    }
                    onClick={() =>
                      setView(
                        "productCosts",
                      )
                    }
                  >
                    <PackageSearch />

                    <span>
                      Product costs
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>
              Business finance
            </SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      view ===
                      "sales"
                    }
                    onClick={() =>
                      setView(
                        "sales",
                      )
                    }
                  >
                    <ShoppingCart />

                    <span>
                      Sales & orders
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      view ===
                      "products"
                    }
                    onClick={() =>
                      setView(
                        "products",
                      )
                    }
                  >
                    <Package />

                    <span>
                      Products &
                      inventory
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      view ===
                      "profit"
                    }
                    onClick={() =>
                      setView(
                        "profit",
                      )
                    }
                  >
                    <TrendingUp />

                    <span>
                      Profit tracking
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      view ===
                      "cashflow"
                    }
                    onClick={() =>
                      setView(
                        "cashflow",
                      )
                    }
                  >
                    <Wallet />

                    <span>
                      Cash flow
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      view ===
                      "reports"
                    }
                    onClick={() =>
                      setView(
                        "reports",
                      )
                    }
                  >
                    <FileBarChart />

                    <span>
                      Reports
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="brand-sidebar-footer">
          <button
            onClick={() => {
              setBudgetAmount(
                String(
                  budgetCents /
                    100 ||
                    "",
                ),
              );

              setBudgetDialog(
                true,
              );
            }}
          >
            <span>
              Monthly budget
            </span>

            <strong>
              {budgetCents
                ? moneyFromCents(
                    budgetCents,
                  )
                : "Not set"}
            </strong>

            <SlidersHorizontal
              size={16}
            />
          </button>

          <p>
            PeakAthlete Finance
          </p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="brand-inset">
        <header className="topbar">
          <div className="topbar-title">
            <SidebarTrigger className="sidebar-toggle" />

            <div>
              <p>
                {
                  viewTitles[
                    view
                  ].eyebrow
                }
              </p>

              <h1>
                {
                  viewTitles[
                    view
                  ].title
                }
              </h1>
            </div>
          </div>

          <div className="topbar-actions">
            {view !==
              "productCosts" && (
              <label
                className="month-picker"
                aria-label="Select month"
              >
                <CalendarDays
                  size={17}
                />

                <input
                  type="month"
                  value={monthInput}
                  onClick={(event) => {
                    try {
                      event.currentTarget.showPicker?.();
                    } catch {
                      // Native picker is not available in every browser.
                    }
                  }}
                  onChange={(
                    event,
                  ) => {
                    const value =
                      event.target
                        .value;

                    setMonthInput(
                      value,
                    );

                    if (
                      /^(\d{4})-(0[1-9]|1[0-2])$/.test(
                        value,
                      )
                    ) {
                      setMonth(
                        value,
                      );
                    }
                  }}
                  onBlur={() => {
                    if (
                      !/^(\d{4})-(0[1-9]|1[0-2])$/.test(
                        monthInput,
                      )
                    ) {
                      setMonthInput(
                        month,
                      );
                    }
                  }}
                  aria-label="Select month"
                />

                <ChevronDown
                  size={15}
                />
              </label>
            )}

            {expenseView && (
              <Button
                type="button"
                className="primary-button"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openNew();
                }}
              >
                <Plus
                  size={18}
                />
                Add expense
              </Button>
            )}
          </div>
        </header>

        <main className="page-content">
          {expenseView ? (
            loading ? (
              <div className="loading-state">
                <Loader2
                  className="spin"
                  size={23}
                />

                Loading
                expenses…
              </div>
            ) : view ===
              "overview" ? (
              <Overview
                expenses={
                  expenses
                }
                summary={
                  summary
                }
                budgetCents={
                  budgetCents
                }
                month={month}
                setView={
                  setView
                }
                openNew={
                  openNew
                }
                openEdit={
                  openEdit
                }
                setBudget={() => {
                  setBudgetAmount(
                    String(
                      budgetCents /
                        100 ||
                        "",
                    ),
                  );

                  setBudgetDialog(
                    true,
                  );
                }}
              />
            ) : (
              <ExpenseList
                expenses={
                  filtered
                }
                expenseTypes={
                  knownExpenseTypes
                }
                search={
                  search
                }
                setSearch={
                  setSearch
                }
                typeFilter={
                  typeFilter
                }
                setTypeFilter={
                  setTypeFilter
                }
                statusFilter={
                  statusFilter
                }
                setStatusFilter={
                  setStatusFilter
                }
                openEdit={
                  openEdit
                }
                remove={
                  setDeleteTarget
                }
              />
            )
          ) : view ===
            "athleteReceipts" ? (
            <AthleteReceipts
              month={month}
            />
          ) : view ===
            "productCosts" ? (
            <ProductCosts />
          ) : (
            <FinanceSuite
              key={month}
              view={
                view as FinanceView
              }
              month={
                month
              }
            />
          )}
        </main>
      </SidebarInset>

      <ExpenseDialog
        open={
          expenseDialog
        }
        setOpen={
          setExpenseDialog
        }
        draft={draft}
        setDraft={
          setDraft
        }
        expenseTypes={
          knownExpenseTypes
        }
        categoryOptions={
          knownCategories
        }
        receiptFile={
          receiptFile
        }
        setReceiptFile={
          setReceiptFile
        }
        editing={Boolean(
          editingId,
        )}
        saving={saving}
        submit={
          saveExpense
        }
      />

      <BudgetDialog
        open={
          budgetDialog
        }
        setOpen={
          setBudgetDialog
        }
        month={month}
        amount={
          budgetAmount
        }
        setAmount={
          setBudgetAmount
        }
        saving={saving}
        submit={
          saveBudget
        }
      />

      <AlertDialog
        open={Boolean(
          deleteTarget,
        )}
        onOpenChange={(
          open,
        ) =>
          !open &&
          setDeleteTarget(
            null,
          )
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this
              expense?
            </AlertDialogTitle>

            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.expenseNumber} · ${deleteTarget.vendor}`
                : ""}{" "}
              will be
              permanently
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>
              Cancel
            </AlertDialogCancel>

            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                void deleteExpense()
              }
            >
              Delete expense
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster
        position="top-right"
        richColors
      />
    </SidebarProvider>
  );
}

/* =========================
   OVERVIEW
========================= */

function Overview({
  expenses,
  summary,
  budgetCents,
  month,
  setView,
  openNew,
  openEdit,
  setBudget,
}: {
  expenses: Expense[];

  summary: {
    total: number;
    paid: number;
    outstanding: number;
    operating: number;
    production: number;
    remaining: number;
    byCategory: [
      string,
      number,
    ][];
  };

  budgetCents: number;

  month: string;

  setView: (
    view: View,
  ) => void;

  openNew: () => void;

  openEdit: (
    expense: Expense,
  ) => void;

  setBudget: () => void;
}) {
  const maxCategory =
    Math.max(
      ...summary.byCategory.map(
        ([, value]) =>
          value,
      ),
      1,
    );

  const budgetPercent =
    budgetCents
      ? Math.min(
          (summary.total /
            budgetCents) *
            100,
          100,
        )
      : 0;

  return (
    <>
      <section className="metrics-grid">
        <Metric
          icon={
            <CircleDollarSign
              size={20}
            />
          }
          label="Total expenses"
          value={moneyFromCents(
            summary.total,
          )}
          note={`${
            expenses.length
          } ${
            expenses.length ===
            1
              ? "entry"
              : "entries"
          } in ${monthLabel(
            month,
          )}`}
          accent
        />

        <Metric
          icon={
            <Banknote
              size={20}
            />
          }
          label="Total paid"
          value={moneyFromCents(
            summary.paid,
          )}
          note={`${
            summary.total
              ? Math.round(
                  (summary.paid /
                    summary.total) *
                    100,
                )
              : 0
          }% settled`}
        />

        <Metric
          icon={
            <CreditCard
              size={20}
            />
          }
          label="Outstanding"
          value={moneyFromCents(
            summary.outstanding,
          )}
          note="Unpaid and partial balances"
          warning={
            summary.outstanding >
            0
          }
        />

        <Metric
          icon={
            <WalletCards
              size={20}
            />
          }
          label="Budget remaining"
          value={
            budgetCents
              ? moneyFromCents(
                  summary.remaining,
                )
              : "Not set"
          }
          note={
            budgetCents
              ? `${Math.round(
                  budgetPercent,
                )}% of budget used`
              : "Set a monthly spending limit"
          }
          warning={
            summary.remaining <
            0
          }
          action={
            !budgetCents
              ? setBudget
              : undefined
          }
        />
      </section>

      <section className="analysis-grid">
        <article className="panel category-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                CATEGORY
                BREAKDOWN
              </p>

              <h2>
                Where the
                budget goes
              </h2>
            </div>

            <span>
              {monthLabel(
                month,
              )}
            </span>
          </div>

          {summary.byCategory
            .length ? (
            <div className="category-list">
              {summary.byCategory
                .slice(0, 6)
                .map(
                  (
                    [
                      category,
                      value,
                    ],
                    index,
                  ) => (
                    <div
                      className="category-row"
                      key={
                        category
                      }
                    >
                      <span>
                        {String(
                          index +
                            1,
                        ).padStart(
                          2,
                          "0",
                        )}
                      </span>

                      <div>
                        <div>
                          <strong>
                            {
                              category
                            }
                          </strong>

                          <b>
                            {moneyFromCents(
                              value,
                            )}
                          </b>
                        </div>

                        <div className="bar-track">
                          <i
                            style={{
                              width: `${Math.max(
                                (value /
                                  maxCategory) *
                                  100,
                                3,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ),
                )}
            </div>
          ) : (
            <EmptyState
              compact
              text="Your category breakdown will appear after the first expense."
            />
          )}
        </article>

        <article className="panel budget-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                MONTHLY
                BUDGET
              </p>

              <h2>
                Spending pace
              </h2>
            </div>

            <button
              onClick={
                setBudget
              }
            >
              Edit
            </button>
          </div>

          <div className="budget-amount">
            <span>
              {budgetCents
                ? "Budget"
                : "No budget set"}
            </span>

            <strong>
              {budgetCents
                ? moneyFromCents(
                    budgetCents,
                  )
                : "—"}
            </strong>
          </div>

          <div className="budget-progress">
            <i
              style={{
                width: `${budgetPercent}%`,
              }}
              className={
                summary.remaining <
                0
                  ? "over"
                  : ""
              }
            />
          </div>

          <div className="budget-split">
            <div>
              <span>
                Operating
              </span>

              <strong>
                {moneyFromCents(
                  summary.operating,
                )}
              </strong>
            </div>

            <div>
              <span>
                Inventory /
                production
              </span>

              <strong>
                {moneyFromCents(
                  summary.production,
                )}
              </strong>
            </div>
          </div>
        </article>
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              RECENT
              TRANSACTIONS
            </p>

            <h2>
              Latest expenses
            </h2>
          </div>

          <button
            onClick={() =>
              setView(
                "expenses",
              )
            }
          >
            View all
          </button>
        </div>

        {expenses.length ? (
          <ExpenseTable
            expenses={expenses.slice(
              0,
              6,
            )}
            openEdit={
              openEdit
            }
            remove={() =>
              undefined
            }
            compact
          />
        ) : (
          <EmptyState
            text="No expenses for this month yet."
            action={
              openNew
            }
          />
        )}
      </section>
    </>
  );
}

/* =========================
   METRIC
========================= */

function Metric({
  icon,
  label,
  value,
  note,
  accent,
  warning,
  action,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  accent?: boolean;
  warning?: boolean;
  action?: () => void;
}) {
  return (
    <article
      className={`metric-card ${
        accent
          ? "accent"
          : ""
      }`}
      onClick={action}
      role={
        action
          ? "button"
          : undefined
      }
      tabIndex={
        action
          ? 0
          : undefined
      }
    >
      <div className="metric-icon">
        {icon}
      </div>

      <p>
        {label}
      </p>

      <strong
        className={
          warning
            ? "warning"
            : ""
        }
      >
        {value}
      </strong>

      <span>
        {note}
      </span>
    </article>
  );
}

/* =========================
   EXPENSE LIST
========================= */

function ExpenseList({
  expenses,
  expenseTypes,
  search,
  setSearch,
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  openEdit,
  remove,
}: {
  expenses: Expense[];

  expenseTypes: string[];

  search: string;

  setSearch: (
    value: string,
  ) => void;

  typeFilter: string;

  setTypeFilter: (
    value: string,
  ) => void;

  statusFilter: string;

  setStatusFilter: (
    value: string,
  ) => void;

  openEdit: (
    expense: Expense,
  ) => void;

  remove: (
    expense: Expense,
  ) => void;
}) {
  return (
    <section className="panel records-panel">
      <div className="records-toolbar">
        <div>
          <p className="eyebrow">
            TRANSACTIONS
          </p>

          <h2>
            {expenses.length}{" "}
            {expenses.length ===
            1
              ? "expense"
              : "expenses"}
          </h2>
        </div>

        <div className="filters">
          <label className="search-box">
            <Search
              size={17}
            />

            <input
              value={
                search
              }
              onChange={(
                event,
              ) =>
                setSearch(
                  event
                    .target
                    .value,
                )
              }
              placeholder="Search expense"
              aria-label="Search expenses"
            />
          </label>

          <Choice
            value={
              typeFilter
            }
            onChange={
              setTypeFilter
            }
            options={[
              "All types",
              ...expenseTypes,
            ]}
            className="filter-select"
          />

          <Choice
            value={
              statusFilter
            }
            onChange={
              setStatusFilter
            }
            options={[
              "All statuses",
              ...paymentStatuses,
            ]}
            className="filter-select status-filter"
          />
        </div>
      </div>

      {expenses.length ? (
        <ExpenseTable
          expenses={
            expenses
          }
          openEdit={
            openEdit
          }
          remove={remove}
        />
      ) : (
        <EmptyState text="No expenses match the selected filters." />
      )}
    </section>
  );
}

/* =========================
   EXPENSE TABLE
========================= */

function ExpenseTable({
  expenses,
  openEdit,
  remove,
  compact = false,
}: {
  expenses: Expense[];

  openEdit: (
    expense: Expense,
  ) => void;

  remove: (
    expense: Expense,
  ) => void;

  compact?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            Date / ID
          </TableHead>

          <TableHead>
            Vendor
          </TableHead>

          <TableHead>
            Category
          </TableHead>

          {!compact && (
            <TableHead>
              Type
            </TableHead>
          )}

          <TableHead>
            Status
          </TableHead>

          <TableHead className="amount-column">
            Total
          </TableHead>

          <TableHead />
        </TableRow>
      </TableHeader>

      <TableBody>
        {expenses.map(
          (item) => (
            <TableRow
              key={
                item.id
              }
            >
              <TableCell>
                {dateLabel(
                  item.expenseDate,
                )}

                <small>
                  {
                    item.expenseNumber
                  }
                </small>
              </TableCell>

              <TableCell>
                <strong>
                  {
                    item.vendor
                  }
                </strong>

                <small>
                  {
                    item.description
                  }
                </small>
              </TableCell>

              <TableCell>
                {
                  item.category
                }

                <small>
                  {item.productCollection ||
                    item.subcategory ||
                    "—"}
                </small>
              </TableCell>

              {!compact && (
                <TableCell>
                  <span
                    className={`type-tag ${
                      item.expenseType ===
                      "Inventory / Production"
                        ? "production"
                        : ""
                    }`}
                  >
                    {
                      item.expenseType
                    }
                  </span>
                </TableCell>
              )}

              <TableCell>
                <span
                  className={`status-tag ${item.paymentStatus.toLowerCase()}`}
                >
                  {
                    item.paymentStatus
                  }
                </span>

                {item.paymentStatus ===
                  "Partial" && (
                  <small>
                    {moneyFromCents(
                      item.totalCents -
                        item.amountPaidCents,
                    )}{" "}
                    due
                  </small>
                )}
              </TableCell>

              <TableCell className="amount-column">
                <strong>
                  {moneyFromCents(
                    item.totalCents,
                  )}
                </strong>

                <small>
                  {
                    item.paymentMethod
                  }
                </small>
              </TableCell>

              <TableCell>
                <div className="row-actions">
                  {item.receiptUrl && (
                    <a
                      href={
                        item.receiptUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`View receipt for ${item.expenseNumber}`}
                    >
                      <FileImage
                        size={
                          16
                        }
                      />
                    </a>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      openEdit(
                        item,
                      )
                    }
                    aria-label={`Edit ${item.expenseNumber}`}
                  >
                    <Pencil
                      size={
                        16
                      }
                    />
                  </Button>

                  {!compact && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        remove(
                          item,
                        )
                      }
                      aria-label={`Delete ${item.expenseNumber}`}
                    >
                      <Trash2
                        size={
                          16
                        }
                      />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ),
        )}
      </TableBody>
    </Table>
  );
}

/* =========================
   EMPTY STATE
========================= */

function EmptyState({
  text,
  action,
  compact = false,
}: {
  text: string;
  action?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`empty-state ${
        compact
          ? "compact"
          : ""
      }`}
    >
      <span>
        <ClipboardList
          size={23}
        />
      </span>

      <h3>
        {text}
      </h3>

      {action && (
        <Button
          className="primary-button"
          onClick={
            action
          }
        >
          <Plus
            size={17}
          />
          Add first
          expense
        </Button>
      )}
    </div>
  );
}

/* =========================
   EXPENSE DIALOG
========================= */

function ExpenseDialog({
  open,
  setOpen,
  draft,
  setDraft,
  expenseTypes,
  categoryOptions,
  receiptFile,
  setReceiptFile,
  editing,
  saving,
  submit,
}: {
  open: boolean;

  setOpen: (
    open: boolean,
  ) => void;

  draft: Draft;

  setDraft: (
    draft: Draft,
  ) => void;

  expenseTypes: string[];

  categoryOptions:
    string[];

  receiptFile:
    File | null;

  setReceiptFile: (
    file: File | null,
  ) => void;

  editing: boolean;

  saving: boolean;

  submit: (
    event: FormEvent,
  ) => void;
}) {
  const update =
    (key: string) =>
    (value: string) =>
      setDraft({
        ...draft,
        [key]: value,
      });

  const total =
    draftTotal(draft);

  return (
    <Dialog
      open={open}
      onOpenChange={
        setOpen
      }
    >
      <DialogContent className="expense-dialog">
        <form
          onSubmit={
            submit
          }
        >
          <DialogHeader>
            <p className="eyebrow">
              {editing
                ? "EDIT TRANSACTION"
                : "NEW TRANSACTION"}
            </p>

            <DialogTitle>
              {editing
                ? "Update expense"
                : "Add an expense"}
            </DialogTitle>

            <DialogDescription>
              Record the
              complete cost
              and payment
              details.
            </DialogDescription>
          </DialogHeader>

          <div className="form-grid">
            <Field label="Expense date">
            <Input
              type="date"
              value={draft.expenseDate || ""}
              onClick={(event) => {
                try {
                  event.currentTarget.showPicker?.();
                } catch {
                  // Native picker is not available in every browser.
                }
              }}
              onChange={(event) => {
                setDraft({
                  ...draft,
                  expenseDate: event.target.value,
                });
              }}
              required
            />
          </Field>

            <Field label="Expense ID">
              <TextInput
                value={
                  draft.expenseNumber
                }
                onChange={update(
                  "expenseNumber",
                )}
                placeholder="Generated automatically"
                disabled={
                  !editing
                }
              />
            </Field>

            <Field
              label="Vendor / payee"
              full
            >
              <TextInput
                value={
                  draft.vendor
                }
                onChange={update(
                  "vendor",
                )}
                placeholder="e.g. Meta Ads, J&T Express"
                required
              />
            </Field>

            <Field label="Expense type">
              <EditableChoice
                value={
                  draft.expenseType
                }
                onChange={update(
                  "expenseType",
                )}
                options={
                  expenseTypes
                }
                placeholder="Choose or type a new expense type"
                required
              />
            </Field>

            <Field label="Category">
              <EditableChoice
                value={
                  draft.category
                }
                onChange={update(
                  "category",
                )}
                options={
                  categoryOptions
                }
                placeholder={
                  draft.expenseType.trim()
                    ? "Choose or type a new category"
                    : "Enter expense type first"
                }
                disabled={
                  !draft.expenseType.trim()
                }
                required
              />
            </Field>

            <Field label="Subcategory">
              <TextInput
                value={
                  draft.subcategory
                }
                onChange={update(
                  "subcategory",
                )}
                placeholder="Optional"
              />
            </Field>

            <Field label="Product / collection">
              <TextInput
                value={
                  draft.productCollection
                }
                onChange={update(
                  "productCollection",
                )}
                placeholder="Optional"
              />
            </Field>

            <Field
              label="Description"
              full
            >
              <TextInput
                value={
                  draft.description
                }
                onChange={update(
                  "description",
                )}
                placeholder="What was purchased or paid for?"
                required
              />
            </Field>

            <Field label="Quantity">
              <TextInput
                type="number"
                min="1"
                step="1"
                value={
                  draft.quantity
                }
                onChange={update(
                  "quantity",
                )}
                required
              />
            </Field>

            <Field label="Unit cost">
              <MoneyInput
                value={
                  draft.unitCost
                }
                onChange={update(
                  "unitCost",
                )}
                required
              />
            </Field>

            <Field label="Tax / fees">
              <MoneyInput
                value={
                  draft.taxFees
                }
                onChange={update(
                  "taxFees",
                )}
              />
            </Field>

            <Field label="Calculated total">
              <div className="calculated-total">
                {peso.format(
                  total,
                )}
              </div>
            </Field>

            <Field label="Payment method">
              <Choice
                value={
                  draft.paymentMethod
                }
                onChange={update(
                  "paymentMethod",
                )}
                options={
                  paymentMethods
                }
              />
            </Field>

            <Field label="Payment status">
              <Choice
                value={
                  draft.paymentStatus
                }
                onChange={update(
                  "paymentStatus",
                )}
                options={
                  paymentStatuses
                }
                className={`form-select payment-status-select ${draft.paymentStatus.toLowerCase()}`}
              />
            </Field>

            {draft.paymentStatus ===
              "Partial" && (
              <Field
                label="Amount paid"
                full
              >
                <MoneyInput
                  value={
                    draft.amountPaid
                  }
                  onChange={update(
                    "amountPaid",
                  )}
                  required
                />
              </Field>
            )}

            <Field label="Receipt / reference no.">
              <TextInput
                value={
                  draft.receiptReference
                }
                onChange={update(
                  "receiptReference",
                )}
                placeholder="Optional"
              />
            </Field>

            <Field label="Receipt image">
              <ReceiptUpload
                existingUrl={
                  draft.receiptUrl
                }
                file={
                  receiptFile
                }
                onChange={
                  setReceiptFile
                }
              />
            </Field>

            <Field
              label="Notes"
              full
            >
              <TextInput
                value={
                  draft.notes
                }
                onChange={update(
                  "notes",
                )}
                placeholder="Optional details"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setOpen(
                  false,
                )
              }
            >
              Cancel
            </Button>

            <Button
              type="submit"
              className="primary-button"
              disabled={
                saving
              }
            >
              {saving && (
                <Loader2
                  className="spin"
                  size={17}
                />
              )}

              {editing
                ? "Save changes"
                : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =========================
   BUDGET DIALOG
========================= */

function BudgetDialog({
  open,
  setOpen,
  month,
  amount,
  setAmount,
  saving,
  submit,
}: {
  open: boolean;

  setOpen: (
    open: boolean,
  ) => void;

  month: string;

  amount: string;

  setAmount: (
    value: string,
  ) => void;

  saving: boolean;

  submit: (
    event: FormEvent,
  ) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={
        setOpen
      }
    >
      <DialogContent className="budget-dialog">
        <form
          onSubmit={
            submit
          }
        >
          <DialogHeader>
            <p className="eyebrow">
              MONTHLY LIMIT
            </p>

            <DialogTitle>
              Set expense
              budget
            </DialogTitle>

            <DialogDescription>
              Choose the
              spending limit
              for{" "}
              {monthLabel(
                month,
              )}
              .
            </DialogDescription>
          </DialogHeader>

          <Field label="Budget amount">
            <MoneyInput
              value={
                amount
              }
              onChange={
                setAmount
              }
              required
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setOpen(
                  false,
                )
              }
            >
              Cancel
            </Button>

            <Button
              type="submit"
              className="primary-button"
              disabled={
                saving
              }
            >
              {saving && (
                <Loader2
                  className="spin"
                  size={17}
                />
              )}

              Save budget
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =========================
   FORM COMPONENTS
========================= */

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label
      className={`field ${
        full
          ? "full"
          : ""
      }`}
    >
      <span>
        {label}
      </span>

      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  ...props
}: {
  value?: string;

  onChange: (
    value: string,
  ) => void;
} & Omit<
  React.ComponentProps<
    typeof Input
  >,
  "value" | "onChange"
>) {
  return (
    <Input
      value={
        value ?? ""
      }
      onChange={(
        event,
      ) =>
        onChange(
          event.target
            .value,
        )
      }
      {...props}
    />
  );
}

function EditableChoice({
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
}: {
  value: string;

  onChange: (
    value: string,
  ) => void;

  options: string[];

  placeholder: string;

  required?: boolean;

  disabled?: boolean;
}) {
  const listId =
    useId();

  return (
    <div className="editable-choice">
      <TextInput
        value={value}
        onChange={
          onChange
        }
        list={listId}
        placeholder={
          placeholder
        }
        autoComplete="off"
        required={
          required
        }
        disabled={
          disabled
        }
      />

      <datalist
        id={listId}
      >
        {options.map(
          (option) => (
            <option
              key={
                option
              }
              value={
                option
              }
            />
          ),
        )}
      </datalist>

      <small>
        {disabled
          ? "Enter expense type first."
          : "Select an option or type your own."}
      </small>
    </div>
  );
}

function ReceiptUpload({
  existingUrl,
  file,
  onChange,
}: {
  existingUrl: string;

  file:
    | File
    | null;

  onChange: (
    file:
      | File
      | null,
  ) => void;
}) {
  const chooseFile = (
    event:
      React.ChangeEvent<HTMLInputElement>,
  ) => {
    const next =
      event.target
        .files?.[0] ??
      null;

    if (
      next &&
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
      ].includes(
        next.type,
      )
    ) {
      toast.error(
        "Use a JPG, PNG, or WebP receipt image.",
      );

      event.target.value =
        "";

      return;
    }

    if (
      next &&
      next.size >
        4 *
          1024 *
          1024
    ) {
      toast.error(
        "Receipt image must be 4 MB or smaller.",
      );

      event.target.value =
        "";

      return;
    }

    onChange(next);
  };

  return (
    <div className="receipt-upload">
      <Input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={
          chooseFile
        }
      />

      <small>
        JPG, PNG, or
        WebP · maximum
        4 MB
      </small>

      {file ? (
        <span>
          <FileImage
            size={15}
          />

          {
            file.name
          }
        </span>
      ) : existingUrl ? (
        <a
          href={
            existingUrl
          }
          target="_blank"
          rel="noreferrer"
        >
          <FileImage
            size={15}
          />

          View current
          receipt
        </a>
      ) : null}
    </div>
  );
}

function Choice({
  value,
  onChange,
  options,
  className = "form-select",
}: {
  value: string;

  onChange: (
    value: string,
  ) => void;

  options: string[];

  className?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={
        onChange
      }
    >
      <SelectTrigger
        className={
          className
        }
      >
        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        {options.map(
          (option) => (
            <SelectItem
              key={
                option
              }
              value={
                option
              }
            >
              {
                option
              }
            </SelectItem>
          ),
        )}
      </SelectContent>
    </Select>
  );
}

function MoneyInput({
  value,
  onChange,
  required,
}: {
  value?: string;

  onChange: (
    value: string,
  ) => void;

  required?: boolean;
}) {
  return (
    <div className="money-input">
      <b>
        ₱
      </b>

      <TextInput
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={
          onChange
        }
        placeholder="0.00"
        required={
          required
        }
      />
    </div>
  );
}