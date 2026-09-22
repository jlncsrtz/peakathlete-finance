"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Eye,
  FileImage,
  Loader2,
  Plus,
  Search,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AthleteReceipt = {
  id: string;
  athleteName: string;
  athleteCode: string;
  receiptDate: string;
  receiptUrl: string;
  createdAt: string;
};

function localToday() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const clean = value?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${clean}T00:00:00`));
}

export function AthleteReceipts({
  month,
}: {
  month: string;
}) {
  const [items, setItems] = useState<AthleteReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preview, setPreview] = useState<AthleteReceipt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AthleteReceipt | null>(null);
  const [search, setSearch] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [athleteCode, setAthleteCode] = useState("");
  const [receiptDate, setReceiptDate] = useState(localToday());
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const loadReceipts = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(
        `/api/athlete-receipts?month=${encodeURIComponent(month)}`,
        { cache: "no-store" },
      );

      const result = (await response.json()) as {
        receipts?: AthleteReceipt[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Couldn’t load athlete receipts.");
      }

      setItems(result.receipts ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t load athlete receipts.",
      );
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;

    return items.filter((item) =>
      [item.athleteName, item.athleteCode, item.receiptDate]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [items, search]);

  const openNew = () => {
    setAthleteName("");
    setAthleteCode("");
    setReceiptDate(localToday());
    setReceiptFile(null);
    setDialogOpen(true);
  };

  const chooseReceipt = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    if (
      file &&
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      toast.error("Use a JPG, PNG, or WebP receipt image.");
      event.target.value = "";
      return;
    }

    if (file && file.size > 4 * 1024 * 1024) {
      toast.error("Receipt image must be 4 MB or smaller.");
      event.target.value = "";
      return;
    }

    setReceiptFile(file);
  };

  const saveReceipt = async (event: FormEvent) => {
    event.preventDefault();

    if (!receiptFile) {
      toast.error("Please add the athlete receipt image.");
      return;
    }

    setSaving(true);
    let uploadedReceiptUrl = "";

    try {
      const form = new FormData();
      form.append("file", receiptFile);

      const uploadResponse = await fetch("/api/receipts", {
        method: "POST",
        body: form,
      });

      const uploadResult = (await uploadResponse.json()) as {
        receiptUrl?: string;
        error?: string;
      };

      if (!uploadResponse.ok || !uploadResult.receiptUrl) {
        throw new Error(
          uploadResult.error ?? "Couldn’t upload the athlete receipt.",
        );
      }

      uploadedReceiptUrl = uploadResult.receiptUrl;

      const response = await fetch("/api/athlete-receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          athleteName: athleteName.trim(),
          athleteCode: athleteCode.trim(),
          receiptDate,
          receiptUrl: uploadedReceiptUrl,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Couldn’t save athlete receipt.");
      }

      setDialogOpen(false);
      setReceiptFile(null);
      await loadReceipts();
      toast.success("Athlete receipt added");
    } catch (error) {
      if (uploadedReceiptUrl.startsWith("/api/receipts/")) {
        const key = decodeURIComponent(
          uploadedReceiptUrl.slice("/api/receipts/".length),
        );

        void fetch(`/api/receipts?key=${encodeURIComponent(key)}`, {
          method: "DELETE",
        });
      }

      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t save athlete receipt.",
      );
    } finally {
      setSaving(false);
    }
  };

  const removeReceipt = async () => {
    if (!deleteTarget) return;

    try {
      const response = await fetch(
        `/api/athlete-receipts?id=${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" },
      );

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Couldn’t delete athlete receipt.");
      }

      setDeleteTarget(null);
      await loadReceipts();
      toast.success("Athlete receipt deleted");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t delete athlete receipt.",
      );
    }
  };

  return (
    <section className="athlete-receipts-page">
      <div className="athlete-receipts-toolbar">
        <div className="athlete-receipts-search">
          <Search size={17} />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search athlete name or code"
          />
        </div>

        <Button className="primary-button athlete-receipt-add" onClick={openNew}>
          <Plus size={17} />
          Add receipt
        </Button>
      </div>

      <div className="athlete-receipts-card">
        {loading ? (
          <div className="loading-state">
            <Loader2 className="spin" size={22} />
            Loading athlete receipts…
          </div>
        ) : filtered.length === 0 ? (
          <div className="athlete-receipts-empty">
            <FileImage size={26} />
            <strong>No athlete receipts yet</strong>
            <span>Add a receipt for an athlete using the button above.</span>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Athlete name</TableHead>
                <TableHead>Athlete code</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="athlete-receipt-actions-head" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <strong>{item.athleteName}</strong>
                  </TableCell>
                  <TableCell>
                    <span className="athlete-code-badge">{item.athleteCode}</span>
                  </TableCell>
                  <TableCell>{formatDate(item.receiptDate)}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPreview(item)}
                    >
                      <Eye size={15} />
                      View
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete receipt for ${item.athleteName}`}
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="athlete-receipt-dialog">
          <form onSubmit={saveReceipt}>
            <DialogHeader>
              <p className="eyebrow">ATHLETE RECEIPT</p>
              <DialogTitle>Add athlete receipt</DialogTitle>
              <DialogDescription>
                Save the athlete name, athlete code, date, and receipt image.
              </DialogDescription>
            </DialogHeader>

            <div className="athlete-receipt-form">
              <label className="field">
                <span>Athlete name</span>
                <Input
                  value={athleteName}
                  onChange={(event) => setAthleteName(event.target.value)}
                  placeholder="Enter athlete name"
                  required
                />
              </label>

              <label className="field">
                <span>Athlete code</span>
                <Input
                  value={athleteCode}
                  onChange={(event) => setAthleteCode(event.target.value)}
                  placeholder="Enter athlete code"
                  required
                />
              </label>

              <label className="field">
                <span>Date</span>
                <Input
                  type="date"
                  value={receiptDate}
                  onChange={(event) => setReceiptDate(event.target.value)}
                  required
                />
              </label>

              <label className="field">
                <span>Receipt image</span>
                <div className="receipt-upload">
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={chooseReceipt}
                    required
                  />
                  <small>JPG, PNG, or WebP · maximum 4 MB</small>
                  {receiptFile ? (
                    <span>
                      <FileImage size={15} />
                      {receiptFile.name}
                    </span>
                  ) : null}
                </div>
              </label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
                Save receipt
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="athlete-receipt-preview">
          <DialogHeader>
            <p className="eyebrow">ATHLETE RECEIPT</p>
            <DialogTitle>{preview?.athleteName ?? "Receipt"}</DialogTitle>
            <DialogDescription>
              {preview
                ? `${preview.athleteCode} · ${formatDate(preview.receiptDate)}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {preview?.receiptUrl ? (
            <img
              src={preview.receiptUrl}
              alt={`Receipt for ${preview.athleteName}`}
              className="athlete-receipt-image"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="athlete-receipt-delete-dialog">
          <DialogHeader>
            <DialogTitle>Delete athlete receipt?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `${deleteTarget.athleteName} · ${deleteTarget.athleteCode}`
                : ""}{" "}
              will be permanently removed.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={removeReceipt}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
