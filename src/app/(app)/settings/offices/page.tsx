"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cx } from "@/lib/format";
import { useOffices } from "@/lib/queries";
import type { Office } from "@/lib/types";
import { Drawer, ErrorBox, Field, PageHeader, SaveButton, Spinner, StatusBadge, useToast } from "@/components/ui";

type Form = { id: number | null; code: string; name: string; address: string; phone: string; status: "active" | "inactive" };

export default function OfficesPage() {
  const offices = useOffices();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const edit = (o?: Office) => {
    setErrors({});
    setForm(o ? { id: o.id, code: o.code, name: o.name, address: o.address ?? "", phone: o.phone ?? "", status: o.status } : { id: null, code: "", name: "", address: "", phone: "", status: "active" });
  };

  async function save() {
    if (!form) return;
    setBusy(true);
    const body = { code: form.code.trim(), name: form.name.trim(), address: form.address.trim() || null, phone: form.phone.trim() || null, status: form.status };
    try {
      if (form.id) await api(`/settings/offices/${form.id}`, { method: "PUT", body });
      else await api("/settings/offices", { method: "POST", body });
      await queryClient.invalidateQueries({ queryKey: ["offices"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Office saved.");
      setForm(null);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.errors).length) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Offices" description="Units of the organization. Transactions and opening balances are recorded per office." actions={<button className="btn btn-primary" onClick={() => edit()}><Plus size={16} /> New office</button>} />
      <div className="card overflow-x-auto">
        {offices.isLoading ? <Spinner /> : offices.error ? <div className="p-4"><ErrorBox error={offices.error} /></div> : (
          <table className="table-base">
            <thead><tr><th>Code</th><th>Name</th><th>Address</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {offices.data!.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-gray-50" onClick={() => edit(o)}>
                  <td className="font-medium">{o.code}</td><td>{o.name}</td><td className="text-gray-600">{o.address}</td><td className="text-gray-600">{o.phone}</td><td><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Drawer open={!!form} title={form?.id ? "Edit office" : "New office"} onClose={() => setForm(null)} size="sm" footer={<><button className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button><SaveButton busy={busy} onClick={save} /></>}>
        {form && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Code" required error={errors.code} htmlFor="o-code"><input id="o-code" className={cx("input", errors.code && "input-error")} maxLength={30} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Name" required error={errors.name} htmlFor="o-name"><input id="o-name" className={cx("input", errors.name && "input-error")} maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Address" error={errors.address} htmlFor="o-addr"><textarea id="o-addr" className="input" rows={2} maxLength={500} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Phone" error={errors.phone} htmlFor="o-phone"><input id="o-phone" className="input" maxLength={50} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Status" htmlFor="o-status">
              <select id="o-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}><option value="active">Active</option><option value="inactive">Inactive</option></select>
            </Field>
            <button type="submit" className="hidden" />
          </form>
        )}
      </Drawer>
    </div>
  );
}
