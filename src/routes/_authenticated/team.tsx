import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-helpers";
import { useActiveTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/company";
import {
  TENANT_ROLES, addTeamMember, listTeamMembers, removeTeamMember, updateTeamMember,
  type TeamRole,
} from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team & user access — SoftfrackPos" },
      { name: "description", content: "Add staff to your business and choose what each person can access, from POS-only sellers to managers." },
      { property: "og:title", content: "Team & user access — SoftfrackPos" },
      { property: "og:description", content: "Invite staff and assign roles for your business workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const qc = useQueryClient();
  const { tenantId, role } = useActiveTenant();
  const isOwner = role === "owner";

  const listFn = useServerFn(listTeamMembers);
  const addFn = useServerFn(addTeamMember);
  const updateFn = useServerFn(updateTeamMember);
  const removeFn = useServerFn(removeTeamMember);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", fullName: "", password: "", role: "sales_agent" as TeamRole });

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team_members", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenantId: tenantId! } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["team_members", tenantId] });

  const add = useMutation({
    mutationFn: () => addFn({ data: { tenantId: tenantId!, ...form } }),
    onSuccess: () => {
      toast.success("User added", { description: "Share the email and password with them so they can sign in." });
      setOpen(false);
      setForm({ email: "", fullName: "", password: "", role: "sales_agent" });
      invalidate();
    },
    onError: (e: Error) => toast.error("Could not add user", { description: e.message }),
  });

  const update = useMutation({
    mutationFn: (v: { memberId: string; role?: TeamRole; isActive?: boolean }) =>
      updateFn({ data: { tenantId: tenantId!, ...v } }),
    onSuccess: () => { toast.success("Access updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (memberId: string) => removeFn({ data: { tenantId: tenantId!, memberId } }),
    onSuccess: () => { toast.success("User removed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Users & access"
        subtitle="Add your staff and decide what each person can do. New users start on POS only."
        action={
          isOwner ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-emerald text-white"><UserPlus className="mr-1.5 h-4 w-4" />Add user</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add a user</DialogTitle>
                  <DialogDescription>They will only be able to work inside this business.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Full name</Label>
                    <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Jane Doe" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@business.com" />
                  </div>
                  <div>
                    <Label>Temporary password</Label>
                    <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as TeamRole })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TENANT_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {TENANT_ROLES.find((r) => r.value === form.role)?.description}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() => add.mutate()}
                    disabled={add.isPending || !form.email || form.password.length < 6}
                  >
                    {add.isPending ? "Adding…" : "Add user"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      <Card className="p-4 shadow-soft border-0">
        {!isOwner && (
          <p className="mb-3 text-sm text-muted-foreground">Only the business owner can add or change users.</p>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && members.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No users yet.</TableCell></TableRow>
              )}
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">{m.full_name || m.email || "User"}</div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </TableCell>
                  <TableCell>
                    {m.role === "owner" ? (
                      <Badge variant="outline">Owner</Badge>
                    ) : (
                      <Select
                        value={m.role}
                        disabled={!isOwner || update.isPending}
                        onValueChange={(v) => update.mutate({ memberId: m.id, role: v as TeamRole })}
                      >
                        <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TENANT_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.is_active}
                      disabled={!isOwner || m.role === "owner"}
                      onCheckedChange={(v) => update.mutate({ memberId: m.id, isActive: v })}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(m.created_at)}</TableCell>
                  <TableCell className="text-right">
                    {m.role !== "owner" && isOwner && (
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(m.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
