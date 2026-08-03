import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TrendingUp, ShieldCheck, Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in — SmartInvoice Pro" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const sendReset = async () => {
    if (!forgotEmail) return toast.error("Enter your email");
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset link sent. Check your email.");
      setForgotOpen(false);
      setForgotEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setForgotLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Let's set up your business.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      }
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <Toaster richColors position="top-right" />
      {/* Brand panel */}
      <div className="relative hidden md:flex flex-col justify-between p-12 text-white overflow-hidden gradient-emerald">
        <div className="absolute -top-20 -right-20 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-32 -left-10 h-80 w-80 rounded-full bg-[oklch(0.78_0.15_75)]/20 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 backdrop-blur">
              <span className="text-xl font-extrabold">GP</span>
            </div>
            <div>
              <div className="text-lg font-bold leading-tight">Growth Point</div>
              <div className="text-xs uppercase tracking-[0.18em] text-white/70">SmartInvoice Pro</div>
            </div>
          </div>
        </div>
        <div className="relative z-10 space-y-6">
          <motion.h1
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="text-balance text-4xl font-extrabold leading-tight"
          >
            Run a smarter business — from invoice to inventory.
          </motion.h1>
          <p className="text-white/80 text-base max-w-md">
            One place for quotations, invoices, receipts, stock and payments — built for SMEs, retailers, pharmacies and growing teams.
          </p>
          <div className="space-y-3 pt-4">
            {[
              { icon: TrendingUp, t: "Real-time dashboards", d: "Cash flow, top customers, low stock alerts." },
              { icon: Sparkles, t: "Beautiful PDFs", d: "Multiple invoice and receipt templates." },
              { icon: ShieldCheck, t: "Role-based access", d: "Admin, Accountant and Sales Agent roles." },
            ].map((f) => (
              <div key={f.t} className="flex items-start gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10"><f.icon className="h-4 w-4" /></div>
                <div>
                  <div className="text-sm font-semibold">{f.t}</div>
                  <div className="text-xs text-white/70">{f.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-xs text-white/60">© {new Date().getFullYear()} Growth Point</div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 md:p-12">
        <Card className="w-full max-w-md p-8 shadow-elevated border-0">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signin" ? "Sign in to your workspace" : "The first user becomes the Administrator"}
            </p>
          </div>
          <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")} className="mb-6">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" />
            <TabsContent value="signup" />
          </Tabs>
          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full h-11 gradient-emerald text-white shadow-soft" disabled={loading}>
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            disabled={googleLoading}
            onClick={signInWithGoogle}
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.93l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.29 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.28a12 12 0 0 0 0 10.74l4.01-3.1z" />
              <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.18 15.23 0 12 0A12 12 0 0 0 1.28 6.63l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z" />
            </svg>
            {googleLoading ? "Connecting…" : "Continue with Google"}
          </Button>

        </Card>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>Enter your email and we'll send you a reset link.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">Email</Label>
            <Input id="forgot-email" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForgotOpen(false)} disabled={forgotLoading}>Cancel</Button>
            <Button onClick={sendReset} disabled={forgotLoading} className="gradient-emerald text-white">
              {forgotLoading ? "Sending…" : "Send reset link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
