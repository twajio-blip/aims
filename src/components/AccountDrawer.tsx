"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Account } from "@/lib/types";
import { useSession } from "@/lib/session";
import { ConfirmDialog, Drawer, Field, SaveButton, Spinner, useToast } from "./ui";

type Mode = { kind: "create"; parentId?: number | null } | { kind: "edit"; id: number };

type Form = {
  parent_id: number | "";
  code: string;
  title: string;
  gl_id: string;
  old_code: string;
  is_posting: boolean;
  normal_side: "D" | "C" | "";
  economic_code: string;
  status: "active" | "inactive";
};

const EMPTY: Form = { parent_id: "", code: "", title: "", gl_id: "", old_code: "", is_posting: true, normal_side: "", economic_code: "", status: "active" };

export function AccountDrawer({ mode, accounts, onClose }: { mode: Mode | null; accounts: Account[]; onClose: () => void }) {
  const { me, can } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = can("accounts.manage");
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editId = mode?.kind === "edit" ? mode.id : null;
  const detail = useQuery({
    queryKey: ["account", editId],
    queryFn: () => api<{ data: Account & { parent: { id: number; code: string; title: string } | null; has_children: boolean; has_activity: boolean } }>(`/accounts/${editId}`),
    enabled: editId !== null,
  });

  const controls = useMemo(
    () => accounts.filter((a) => !a.is_posting && a.status === "active" && a.level < 5).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  );

  useEffect(() => {
    setErrors({});
    if (mode?.kind === "create") {
      setForm({ ...EMPTY, parent_id: mode.parentId ?? "" });
    }
  }, [mode]);

  useEffect(() => {
    const a = detail.data?.data;
    if (a && mode?.kind === "edit") {
      setForm({
        parent_id: a.parent_id ?? "",
        code: a.code,
        title: a.title,
        gl_id: a.gl_id ?? "",
        old_code: a.old_code ?? "",
        is_posting: a.is_posting,
        normal_side: a.normal_side,
        economic_code: a.economic_code ?? "",
        status: a.status,
      });
    }
  }, [detail.data, mode]);

  // Preview the generated code when the control account changes (FR-COA-10).
  useEffect(() => {
    if (mode?.kind !== "create" || !form.parent_id) {
      if (mode?.kind === "create") setForm((f) => ({ ...f, code: "" }));
      return;
    }
    let cancelled = false;
    api<{ code: string; normal_side: "D" | "C" }>("/accounts/next-code", { query: { parent_id: form.parent_id } })
      .then((r) => !cancelled && setForm((f) => ({ ...f, code: r.code, normal_side: r.normal_side })))
      .catch((e) => !cancelled && setErrors((x) => ({ ...x, parent_id: e instanceof ApiError ? e.field("parent_id") ?? e.message : "Could not get a code." })));
    return () => {
      cancelled = true;
    };
  }, [form.parent_id, mode]);

  if (!mode) return null;
  const creating = mode.kind === "create";
  const account = detail.data?.data;
  const readOnly = !canManage;
  const postingLocked = !creating && (account?.has_children || account?.has_activity);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    const local: Record<string, string> = {};
    if (creating && !form.parent_id) local.parent_id = "Choose a control account.";
    if (!form.title.trim()) local.title = "Title must have some value.";
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    const body = {
      title: form.title.trim(),
      gl_id: form.gl_id.trim() || null,
      old_code: form.old_code.trim() || null,
      is_posting: form.is_posting,
      normal_side: form.normal_side || undefined,
      economic_code: form.economic_code.trim() || null,
      status: form.status,
      ...(creating ? { parent_id: form.parent_id } : {}),
    };
    try {
      if (creating) await api("/accounts", { method: "POST", body });
      else if (mode?.kind === "edit") await api(`/accounts/${mode.id}`, { method: "PUT", body });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["account"] });
      toast.success(creating ? "Account created." : "Account saved.");
      onClose();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.errors).length) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (mode?.kind !== "edit") return;
    setBusy(true);
    try {
      await api(`/accounts/${mode.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account deleted.");
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      toast.error(e);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const canDelete = !creating && canManage && account && !account.has_children && !account.has_activity && account.level > 1;

  return (
    <Drawer
      open
      title={creating ? "New account" : readOnly ? "Account" : "Edit account"}
      onClose={onClose}
      footer={
        <>
          {canDelete && (
            <button className="btn btn-danger mr-auto" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && <SaveButton busy={busy} onClick={save} />}
        </>
      }
    >
      {!creating && detail.isLoading ? (
        <Spinner />
      ) : (
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="sm:col-span-2">
            <Field label="Organization unit">
              <p className="py-2 text-sm text-gray-800">{me.organization?.name}</p>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Control A/C" required={creating} error={errors.parent_id} htmlFor="parent_id">
              {creating ? (
                <select id="parent_id" className={`input ${errors.parent_id ? "input-error" : ""}`} value={form.parent_id} onChange={(e) => { setErrors((x) => ({ ...x, parent_id: "" })); set("parent_id", e.target.value ? Number(e.target.value) : ""); }}>
                  <option value="">Select a control account</option>
                  {controls.map((c) => (
                    <option key={c.id} value={c.id}>
                      {"  ".repeat(c.level - 1)}
                      {c.title} ({c.code})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="py-2 text-sm text-gray-800">{account?.parent ? `${account.parent.title} (${account.parent.code})` : "None (class account)"}</p>
              )}
            </Field>
          </div>
          <Field label="GL A/C No" hint={creating ? "Generated from the control account" : undefined}>
            <input className="input tabular" value={form.code} disabled readOnly placeholder={creating ? "Choose a control account" : ""} />
          </Field>
          <Field label="GL ID" error={errors.gl_id} htmlFor="gl_id" hint="Short numeric code shown in brackets">
            <input id="gl_id" className={`input ${errors.gl_id ? "input-error" : ""}`} maxLength={20} inputMode="numeric" value={form.gl_id} disabled={readOnly} onChange={(e) => set("gl_id", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Title" required error={errors.title} htmlFor="title">
              <input id="title" className={`input ${errors.title ? "input-error" : ""}`} maxLength={200} value={form.title} disabled={readOnly} onChange={(e) => set("title", e.target.value)} />
            </Field>
          </div>
          <Field label="Posting allowed" required error={errors.is_posting} htmlFor="is_posting" hint={postingLocked ? "Locked: the account has child accounts or balances" : "Yes = accepts entries; No = groups other accounts"}>
            <select id="is_posting" className="input" value={form.is_posting ? "1" : "0"} disabled={readOnly || !!postingLocked} onChange={(e) => set("is_posting", e.target.value === "1")}>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </Field>
          <Field label="Transaction type" required error={errors.normal_side} htmlFor="normal_side" hint="Normal balance side">
            <select id="normal_side" className="input" value={form.normal_side} disabled={readOnly} onChange={(e) => set("normal_side", e.target.value as Form["normal_side"])}>
              <option value="">Select</option>
              <option value="D">Debit</option>
              <option value="C">Credit</option>
            </select>
          </Field>
          <Field label="Old GL A/C No" error={errors.old_code} htmlFor="old_code">
            <input id="old_code" className="input" maxLength={20} value={form.old_code} disabled={readOnly} onChange={(e) => set("old_code", e.target.value)} />
          </Field>
          <Field label="Economic code" error={errors.economic_code} htmlFor="economic_code">
            <input id="economic_code" className="input" maxLength={20} value={form.economic_code} disabled={readOnly} onChange={(e) => set("economic_code", e.target.value)} />
          </Field>
          <Field label="Status" required error={errors.status} htmlFor="status" hint={!creating && account && !account.is_posting ? "Making a control account inactive also makes the accounts below it inactive" : undefined}>
            <select id="status" className="input" value={form.status} disabled={readOnly} onChange={(e) => set("status", e.target.value as Form["status"])}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <button type="submit" className="hidden" />
        </form>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete account"
        message={`Delete "${form.title}" (${form.code})? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </Drawer>
  );
}
