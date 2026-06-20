import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeader, ListToolbar, EmptyState } from "@/components/page-helpers";
import { Plus, Mail, Phone, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/company";
import { useActiveTenantId } from "@/lib/tenant";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers" }] }),
  component: CustomersPage,
});

type Customer = {
  id: string; name: string; company_name: string | null; email: string | null;
  phone: string | null; address: string | null; city: string | null; country: string | null;
  tax_id: string | null; notes: string | null; created_at: string;
};

function CustomersPage() {
  const qc = useQueryClient();
  const tenantId = useActiveTenantId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Customer[];
    },
  });

  const filtered = customers.filter((c) =>
    [c.name, c.company_name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q.toLowerCase()))
  );

  const upsert = useMutation({
    mutationFn: async (form: Record<string, unknown>) => {
      const payload = { ...form };
      if (editing) {
        const { error } = await supabase.from("customers").update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        payload.created_by = u.user?.id;
        payload.tenant_id = tenantId;
        const { error } = await supabase.from("customers").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Customer updated" : "Customer created");
      qc.invalidateQueries({ queryKey: ["customers"] });
      setOpen(false); setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer deleted");
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    upsert.mutate(Object.fromEntries(fd.entries()));
  };

  return (
    <div>
      <PageHeader title="Customers" subtitle="Manage your customer database, balances and statements." />
      <Card className="p-4 shadow-soft border-0">
        <ListToolbar
          query={q}
          onQuery={setQ}
          placeholder="Search by name, company, email…"
          onAdd={() => { setEditing(null); setOpen(true); }}
          addLabel="New customer"
        />
        {filtered.length === 0 ? (
          <EmptyState
            title="No customers yet"
            message="Add your first customer to start invoicing."
            action={<Button onClick={() => setOpen(true)} className="gradient-emerald text-white"><Plus className="h-4 w-4 mr-1.5" />Add customer</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.company_name}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs gap-0.5">
                        {c.email && <span className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{c.email}</span>}
                        {c.phone && <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.phone}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{[c.city, c.country].filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => confirm("Delete customer?") && del.mutate(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><span /></DialogTrigger>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
            <div className="col-span-1"><Label>Name *</Label><Input name="name" defaultValue={editing?.name} required /></div>
            <div className="col-span-1"><Label>Company</Label><Input name="company_name" defaultValue={editing?.company_name ?? ""} /></div>
            <div className="col-span-1"><Label>Email</Label><Input name="email" type="email" defaultValue={editing?.email ?? ""} /></div>
            <div className="col-span-1"><Label>Phone</Label><Input name="phone" defaultValue={editing?.phone ?? ""} /></div>
            <div className="col-span-2"><Label>Address</Label><Input name="address" defaultValue={editing?.address ?? ""} /></div>
            <div className="col-span-1"><Label>City</Label><Input name="city" defaultValue={editing?.city ?? ""} /></div>
            <div className="col-span-1"><Label>Country</Label><Input name="country" defaultValue={editing?.country ?? ""} /></div>
            <div className="col-span-2"><Label>Tax ID</Label><Input name="tax_id" defaultValue={editing?.tax_id ?? ""} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} /></div>
            <DialogFooter className="col-span-2 mt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsert.isPending} className="gradient-emerald text-white">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
