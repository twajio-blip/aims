"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, HandCoins, Receipt, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import Link from "next/link";
import { formatAmount, formatDate, formatNumber } from "@/lib/format";
import type { Page, Voucher } from "@/lib/vouchers";
import { useSession } from "@/lib/session";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";

type Kpis = {
  fiscal_year: { id: number; code: string; label: string } | null;
  office_id: number | null;
  cards: { key: string; label: string; amount: number; account_code: string | null }[];
};

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  cash_bank: Banknote,
  receivable: HandCoins,
  payable: Wallet,
  expense: Receipt,
};

export default function DashboardPage() {
  const { me, can } = useSession();
  const kpis = useQuery({ queryKey: ["kpis", me.office_id], queryFn: () => api<Kpis>("/dashboard/kpis"), enabled: can("dashboard.view") });
  const office = me.offices.find((o) => o.id === me.office_id);

  if (!can("dashboard.view")) {
    return <PageHeader title={`Welcome, ${me.user.name}`} description="Use the menu on the left to get started." />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Home"
        description={`${me.organization?.name ?? ""}${office ? `, ${office.name}` : ""}${kpis.data?.fiscal_year ? `. Fiscal year ${kpis.data.fiscal_year.label}` : ""}`}
      />
      {kpis.isLoading ? (
        <Spinner />
      ) : kpis.error ? (
        <ErrorBox error={kpis.error} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.data!.cards.map((card) => {
              const Icon = ICONS[card.key] ?? Banknote;
              return (
                <div key={card.key} className="card flex items-start gap-4 p-5">
                  <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700">
                    <Icon size={22} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-600">{card.label}</p>
                    <p className="tabular mt-1 truncate text-xl font-semibold text-gray-900">{formatAmount(card.amount, me.preferences)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Figures are opening balances for the current fiscal year plus verified vouchers. Drafts count once another person verifies them.
          </p>
          {can("vouchers.view") && <PendingVouchers />}
        </>
      )}
    </div>
  );
}

const LIST_FOR: Record<string, string> = { receive: "receive", payment: "payment", transfer: "transfer" };

/** Drafts waiting for a second person, so verifiers see their queue on sign-in. */
function PendingVouchers() {
  const { me } = useSession();
  const drafts = useQuery({
    queryKey: ["vouchers", "pending", me.office_id],
    queryFn: () => api<Page<Voucher>>("/vouchers", { query: { status: "draft", per_page: 10 } }),
  });
  if (!drafts.data || drafts.data.total === 0) return null;
  return (
    <section className="card mt-6">
      <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">Draft vouchers waiting for verification ({drafts.data.total})</h2>
      <ul className="divide-y divide-gray-100">
        {drafts.data.data.map((v) => (
          <li key={v.id}>
            <Link href={`/transactions/${LIST_FOR[v.source] ?? "vouchers"}?voucher=${v.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm hover:bg-gray-50">
              <span className="w-32 font-medium text-brand-800 tabular">{v.voucher_no}</span>
              <span className="w-28 text-gray-600">{formatDate(v.voucher_date, me.preferences)}</span>
              <span className="flex-1 truncate text-gray-700">{v.transaction_definition?.name ?? v.transaction_type?.name}{v.payee ? `, ${v.payee.name}` : ""}</span>
              <span className="tabular text-gray-900">{formatNumber(v.source === "receive" || v.source === "payment" ? v.net_amount : v.total_amount, me.preferences)}</span>
              {v.rejection_reason && <span className="badge bg-red-50 text-red-700">Rejected</span>}
              <span className="text-xs text-gray-500">by {v.created_by?.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
