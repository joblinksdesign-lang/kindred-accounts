import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserRound } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-helpers";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — SmartInvoice Pro" },
      { name: "description", content: "Update your name, phone number and sign-in password for your SmartInvoice Pro account." },
      { property: "og:title", content: "My profile — SmartInvoice Pro" },
      { property: "og:description", content: "Update your personal details and password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [password, setPassword] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["my_profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name ?? "", phone: profile.phone ?? "" });
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: form.full_name || null, phone: form.phone || null })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["my_profile", user?.id] });
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Password changed"); setPassword(""); },
    onError: (e: Error) => toast.error("Could not change password", { description: e.message }),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="My profile" subtitle="Update your details and password." />

      <Card className="p-4 shadow-soft border-0 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4" />Personal details</div>
        <div>
          <Label>Email</Label>
          <Input value={profile?.email ?? user?.email ?? ""} disabled />
        </div>
        <div>
          <Label>Full name</Label>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Your name" />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07xx xxx xxx" />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gradient-emerald text-white">
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </Card>

      <Card className="mt-4 p-4 shadow-soft border-0 space-y-4">
        <div className="text-sm font-semibold">Change password</div>
        <div>
          <Label>New password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
        </div>
        <Button
          variant="outline"
          onClick={() => changePassword.mutate()}
          disabled={changePassword.isPending || password.length < 6}
        >
          {changePassword.isPending ? "Updating…" : "Update password"}
        </Button>
      </Card>
    </div>
  );
}
