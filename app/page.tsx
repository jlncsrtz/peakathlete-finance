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
import { useRouter } from "next/navigation";
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
  LogOut,
  Package,
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
import { getSupabaseBrowser } from "@/lib/supabase-browser";

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
  | FinanceView;

type DateFilterMode = "all" | "month" | "date";

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

const MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;

const CURRENT_YEAR = new Date().getFullYear();

const YEAR_OPTIONS = Array.from(
  { length: 21 },
  (_, index) => String(CURRENT_YEAR - 10 + index),
);

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
    return "Month";
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
    return "Month";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      month: "short",
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
    <div className="brand-mark" aria-label="PeakAthlete">
      <img
        src="/peakathlete-logo.png"
        alt="PA"
        className="brand-emblem-image"
      />

      <span className="brand-name">
        PEAK
        <span>ATHLETE</span>
        <i />
      </span>
    </div>
  );
}

/* =========================
   HOME
========================= */

export default function Home() {
  const router = useRouter();

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
    dateFilterMode,
    setDateFilterMode,
  ] = useState<DateFilterMode>("month");

  const [
    specificDate,
    setSpecificDate,
  ] = useState(today());

  const [
    dateFilterOpen,
    setDateFilterOpen,
  ] = useState(false);

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

  const selectedDateYear =
    specificDate.slice(0, 4) || String(CURRENT_YEAR);

  const selectedDateMonth =
    specificDate.slice(5, 7) || "01";

  const selectedDateDay =
    specificDate.slice(8, 10) || "01";

  const dayOptions = Array.from(
    {
      length: new Date(
        Number(selectedDateYear),
        Number(selectedDateMonth),
        0,
      ).getDate(),
    },
    (_, index) => String(index + 1).padStart(2, "0"),
  );

  const periodLabel =
    dateFilterMode === "all"
      ? "All dates"
      : dateFilterMode === "date"
        ? dateLabel(specificDate)
        : monthLabel(month);

  const changeSpecificDate = (
    nextYear: string,
    nextMonth: string,
    nextDay: string,
  ) => {
    const maxDay = new Date(
      Number(nextYear),
      Number(nextMonth),
      0,
    ).getDate();

    const safeDay = String(
      Math.min(Math.max(Number(nextDay) || 1, 1), maxDay),
    ).padStart(2, "0");

    setSpecificDate(`${nextYear}-${nextMonth}-${safeDay}`);
  };

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
    useMemo(() => {
      const suggested = draft.expenseType
        ? categories[draft.expenseType] ?? []
        : Object.values(categories).flat();

      const saved = draft.expenseType
        ? expenses
            .filter((item) => item.expenseType === draft.expenseType)
            .map((item) => item.category)
        : expenses.map((item) => item.category);

      return Array.from(new Set([...suggested, ...saved].filter(Boolean)));
    }, [draft.expenseType, expenses]);

  /* =========================
     LOAD EXPENSES
  ========================= */

  const loadExpenses =
    useCallback(
      async () => {
        setLoading(true);

        try {
          const query =
            dateFilterMode === "all"
              ? "range=all"
              : dateFilterMode === "date"
                ? `date=${encodeURIComponent(specificDate)}`
                : `month=${encodeURIComponent(month)}`;

          const response =
            await fetch(
              `/api/expense-data?${query}`,
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

      [
        dateFilterMode,
        month,
        specificDate,
      ],
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

                    paymentStatus:
                      draft.paymentStatus,
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

  const logout = async () => {
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t log out. Please try again.",
      );
    }
  };

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

          <button
            type="button"
            className="logout-button"
            onClick={() => void logout()}
          >
            <span>Account</span>
            <strong>Log out</strong>
            <LogOut size={16} />
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
            {view !== "reports" && (
              <div className="compact-date-filter">
              <button
                type="button"
                className={`compact-date-button ${dateFilterOpen ? "open" : ""}`}
                onClick={() => setDateFilterOpen((open) => !open)}
                aria-expanded={dateFilterOpen}
                aria-label="Open date filter"
              >
                <CalendarDays size={18} />
                <span>{periodLabel}</span>
                <ChevronDown size={15} />
              </button>

              {dateFilterOpen && (
                <div className="compact-date-popover">
                  <div className="date-popover-header">
                    <div>
                      <span>Date filter</span>
                      <strong>{periodLabel}</strong>
                    </div>

                    <button
                      type="button"
                      className="date-popover-close"
                      onClick={() => setDateFilterOpen(false)}
                      aria-label="Close date filter"
                    >
                      ×
                    </button>
                  </div>

                  <div className="date-mode-grid" role="group" aria-label="Date filter mode">
                    <button
                      type="button"
                      className={`date-mode-button ${dateFilterMode === "all" ? "active" : ""}`}
                      onClick={() => setDateFilterMode("all")}
                    >
                      All
                    </button>

                    <button
                      type="button"
                      className={`date-mode-button ${dateFilterMode === "month" ? "active" : ""}`}
                      onClick={() => setDateFilterMode("month")}
                    >
                      Month
                    </button>

                    <button
                      type="button"
                      className={`date-mode-button ${dateFilterMode === "date" ? "active" : ""}`}
                      onClick={() => setDateFilterMode("date")}
                    >
                      Date
                    </button>
                  </div>

                  {dateFilterMode === "all" && (
                    <div className="date-filter-summary">
                      <span>Showing</span>
                      <strong>All available records</strong>
                    </div>
                  )}

                  {dateFilterMode === "month" && (
                    <div className="date-control-section">
                      <span className="date-control-label">Choose month</span>

                      <div className="compact-date-row month-row">
                        <select
                          className="compact-date-select"
                          value={month.split("-")[1] || "01"}
                          onChange={(event) => {
                            const selectedMonth = event.target.value;
                            const selectedYear =
                              month.split("-")[0] || String(CURRENT_YEAR);
                            setMonth(`${selectedYear}-${selectedMonth}`);
                          }}
                          aria-label="Select month"
                        >
                          {MONTH_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>

                        <select
                          className="compact-date-select compact-year-select"
                          value={month.split("-")[0] || String(CURRENT_YEAR)}
                          onChange={(event) => {
                            const selectedYear = event.target.value;
                            const selectedMonth = month.split("-")[1] || "01";
                            setMonth(`${selectedYear}-${selectedMonth}`);
                          }}
                          aria-label="Select year"
                        >
                          {YEAR_OPTIONS.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {dateFilterMode === "date" && (
                    <div className="date-control-section">
                      <span className="date-control-label">Choose date</span>

                      <div className="compact-date-row date-row">
                        <select
                          className="compact-date-select"
                          value={selectedDateMonth}
                          onChange={(event) =>
                            changeSpecificDate(
                              selectedDateYear,
                              event.target.value,
                              selectedDateDay,
                            )
                          }
                          aria-label="Select month"
                        >
                          {MONTH_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>

                        <select
                          className="compact-date-select compact-day-select"
                          value={selectedDateDay}
                          onChange={(event) =>
                            changeSpecificDate(
                              selectedDateYear,
                              selectedDateMonth,
                              event.target.value,
                            )
                          }
                          aria-label="Select day"
                        >
                          {dayOptions.map((day) => (
                            <option key={day} value={day}>
                              {day}
                            </option>
                          ))}
                        </select>

                        <select
                          className="compact-date-select compact-year-select"
                          value={selectedDateYear}
                          onChange={(event) =>
                            changeSpecificDate(
                              event.target.value,
                              selectedDateMonth,
                              selectedDateDay,
                            )
                          }
                          aria-label="Select year"
                        >
                          {YEAR_OPTIONS.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="compact-date-done"
                    onClick={() => setDateFilterOpen(false)}
                  >
                    Apply filter
                  </button>
                </div>
              )}
            </div>
            )}

            {expenseView && (
              <Button
                className="primary-button"
                onClick={
                  openNew
                }
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
                periodLabel={periodLabel}
                monthlyBudgetMode={dateFilterMode === "month"}
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
          ) : (
            <FinanceSuite
              key={`${dateFilterMode}:${month}:${specificDate}`}
              view={
                view as FinanceView
              }
              month={
                month
              }
              dateFilterMode={dateFilterMode}
              specificDate={specificDate}
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
  periodLabel,
  monthlyBudgetMode,
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

  periodLabel: string;

  monthlyBudgetMode: boolean;

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
          } in ${periodLabel}`}
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
            monthlyBudgetMode
              ? budgetCents
                ? moneyFromCents(
                    summary.remaining,
                  )
                : "Not set"
              : "Monthly only"
          }
          note={
            monthlyBudgetMode
              ? budgetCents
                ? `${Math.round(
                    budgetPercent,
                  )}% of budget used`
                : "Set a monthly spending limit"
              : "Switch to By month to compare with budget"
          }
          warning={
            monthlyBudgetMode &&
            summary.remaining <
              0
          }
          action={
            monthlyBudgetMode &&
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
              {periodLabel}
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
  const [receiptPreview, setReceiptPreview] = useState<{
    url: string;
    title: string;
  } | null>(null);

  return (
    <>
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setReceiptPreview({
                          url: item.receiptUrl,
                          title: `Receipt · ${item.expenseNumber}`,
                        })
                      }
                      aria-label={`View receipt for ${item.expenseNumber}`}
                    >
                      <FileImage
                        size={
                          16
                        }
                      />
                    </Button>
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

      <ReceiptPreviewDialog
        open={Boolean(receiptPreview)}
        onOpenChange={(open) => {
          if (!open) setReceiptPreview(null);
        }}
        url={receiptPreview?.url ?? ""}
        title={receiptPreview?.title ?? "Receipt"}
      />
    </>
  );
}

function ReceiptPreviewDialog({
  open,
  onOpenChange,
  url,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="receipt-preview-dialog">
        <DialogHeader>
          <p className="eyebrow">RECEIPT PREVIEW</p>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Receipt image preview inside PeakAthlete Finance.
          </DialogDescription>
        </DialogHeader>

        <div className="receipt-preview-frame">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={title}
              className="receipt-preview-image"
            />
          ) : (
            <div className="receipt-preview-empty">Receipt unavailable.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
                value={draft.expenseType}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    expenseType: value,
                    category: "",
                  })
                }
                options={expenseTypes}
                placeholder="Type or choose an expense type"
                required
              />
            </Field>

            <Field label="Category">
              <EditableChoice
                value={draft.category}
                onChange={update("category")}
                options={categoryOptions}
                placeholder={
                  draft.expenseType
                    ? "Type or choose a category"
                    : "Type a category or choose an expense type first"
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
              <PaymentStatusChoice
                value={draft.paymentStatus}
                onChange={update("paymentStatus")}
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
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  required?: boolean;
}) {
  const listId = useId();

  return (
    <div className="editable-choice">
      <TextInput
        value={value}
        onChange={onChange}
        list={listId}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
      />

      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      <small>
        Choose a suggestion or type a new one.
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
  const [previewOpen, setPreviewOpen] = useState(false);

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
    <>
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
          <button
            type="button"
            className="receipt-preview-link"
            onClick={() => setPreviewOpen(true)}
          >
            <FileImage
              size={15}
            />

            View current
            receipt
          </button>
        ) : null}
      </div>

      <ReceiptPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={existingUrl}
        title="Current receipt"
      />
    </>
  );
}

function paymentStatusTriggerClass(value: string) {
  if (value === "Unpaid") {
    return "border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/15";
  }

  if (value === "Partial") {
    return "border-orange-500/50 bg-orange-500/10 text-orange-400 hover:bg-orange-500/15";
  }

  if (value === "Paid") {
    return "border-green-500/50 bg-green-500/10 text-green-400 hover:bg-green-500/15";
  }

  return "";
}

function PaymentStatusChoice({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={onChange}
    >
      <SelectTrigger
        className={`form-select font-semibold ${paymentStatusTriggerClass(value)}`}
      >
        <SelectValue placeholder="Select payment status" />
      </SelectTrigger>

      <SelectContent>
        <SelectItem
          value="Unpaid"
          className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
        >
          <span className="flex items-center gap-2 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            Unpaid
          </span>
        </SelectItem>

        <SelectItem
          value="Partial"
          className="text-orange-400 focus:bg-orange-500/10 focus:text-orange-400"
        >
          <span className="flex items-center gap-2 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            Partial
          </span>
        </SelectItem>

        <SelectItem
          value="Paid"
          className="text-green-400 focus:bg-green-500/10 focus:text-green-400"
        >
          <span className="flex items-center gap-2 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            Paid
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function Choice({
  value,
  onChange,
  options,
  className = "form-select",
  placeholder = "Select an option",
  disabled = false,
  required = false,
}: {
  value: string;

  onChange: (
    value: string,
  ) => void;

  options: string[];

  className?: string;

  placeholder?: string;

  disabled?: boolean;

  required?: boolean;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={onChange}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger
        className={className}
      >
        <SelectValue
          placeholder={placeholder}
        />
      </SelectTrigger>

      <SelectContent>
        {options.map(
          (option) => (
            <SelectItem
              key={option}
              value={option}
            >
              {option}
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