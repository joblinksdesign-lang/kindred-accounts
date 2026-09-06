import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Smartphone, Upload, Trash2, Save, Download } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-helpers";
import {
  DISPLAY_MODES, ICON_SIZE_OPTIONS, fileToDataUrl, refreshInstallAssets, useInstallPrompt, usePwaSettings,
  type PwaSettings,
} from "@/lib/pwa";

export const Route = createFileRoute("/_authenticated/admin/app-install")({
  head: () => ({
    meta: [
      { title: "App install & branding — Softtrack Pos admin" },
      { name: "description", content: "Configure the installable app icon, splash screen, colours and sizes." },
      { property: "og:title", content: "App install & branding — Softtrack Pos admin" },
      { property: "og:description", content: "Configure the installable app icon, splash screen, colours and sizes." },
    ],
  }),
  component: AppInstallAdmin,
});

function AppInstallAdmin() {
  const { data, isLoading } = usePwaSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState<PwaSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const { canInstall, installed, promptInstall } = useInstallPrompt();

  useEffect(() => { if (data) setForm(data); }, [data]);

  const set = <K extends keyof PwaSettings>(key: K, value: PwaSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const upload = async (kind: "icon_url" | "splash_url", file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file, kind === "icon_url" ? 512 : 1440);
      set(kind, dataUrl);
      toast.success(kind === "icon_url" ? "Icon ready — remember to save" : "Splash ready — remember to save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await saveSettings({
        data: {
          id: form.id,
          app_name: form.app_name,
          short_name: form.short_name,
          description: form.description ?? "",
          theme_color: form.theme_color,
          background_color: form.background_color,
          display_mode: form.display_mode,
          start_url: form.start_url || "/",
          icon_url: form.icon_url,
          splash_url: form.splash_url,
          icon_sizes: form.icon_sizes,
          splash_width: form.splash_width,
          splash_height: form.splash_height,
          install_enabled: form.install_enabled,
        },
      });
      qc.invalidateQueries({ queryKey: ["pwa_settings"] });
      refreshInstallAssets();
      toast.success("App install settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the settings");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !form) {
    return <div className="text-sm text-muted-foreground">Loading app install settings…</div>;
  }

  const toggleSize = (size: number) => {
    const has = form.icon_sizes.includes(size);
    const next = has ? form.icon_sizes.filter((s) => s !== size) : [...form.icon_sizes, size];
    set("icon_sizes", next.sort((a, b) => a - b));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="App install"
        subtitle="Control how Softtrack Pos installs on phones and desktops: icon, splash screen, colours and sizes."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold">Identity</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>App name</Label>
                <Input value={form.app_name} onChange={(e) => set("app_name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Short name (home screen)</Label>
                <Input value={form.short_name} onChange={(e) => set("short_name", e.target.value)} maxLength={12} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Start page</Label>
                <Input value={form.start_url} onChange={(e) => set("start_url", e.target.value)} placeholder="/" />
              </div>
              <div className="space-y-1.5">
                <Label>Display mode</Label>
                <Select value={form.display_mode} onValueChange={(v) => set("display_mode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DISPLAY_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold">Colours</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Theme colour</Label>
                <div className="flex items-center gap-2">
                  <input type="color" className="h-9 w-12 cursor-pointer rounded border bg-background"
                    value={form.theme_color} onChange={(e) => set("theme_color", e.target.value)} />
                  <Input value={form.theme_color} onChange={(e) => set("theme_color", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Background / splash colour</Label>
                <div className="flex items-center gap-2">
                  <input type="color" className="h-9 w-12 cursor-pointer rounded border bg-background"
                    value={form.background_color} onChange={(e) => set("background_color", e.target.value)} />
                  <Input value={form.background_color} onChange={(e) => set("background_color", e.target.value)} />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold">App icon</h2>
            <p className="text-xs text-muted-foreground">Square image — any size works, it is resized automatically.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" /> Upload icon
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => upload("icon_url", e.target.files?.[0])} />
              </Label>
              {form.icon_url && (
                <Button variant="ghost" size="sm" onClick={() => set("icon_url", null)}>
                  <Trash2 className="h-4 w-4 mr-1.5" />Remove
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Generated sizes</Label>
              <div className="flex flex-wrap gap-2">
                {ICON_SIZE_OPTIONS.map((size) => (
                  <button key={size} type="button" onClick={() => toggleSize(size)}>
                    <Badge variant={form.icon_sizes.includes(size) ? "default" : "outline"} className="cursor-pointer">
                      {size}×{size}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold">Splash screen</h2>
            <div className="flex flex-wrap items-center gap-3">
              <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" /> Upload splash
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => upload("splash_url", e.target.files?.[0])} />
              </Label>
              {form.splash_url && (
                <Button variant="ghost" size="sm" onClick={() => set("splash_url", null)}>
                  <Trash2 className="h-4 w-4 mr-1.5" />Remove
                </Button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Splash width (px)</Label>
                <Input type="number" value={form.splash_width}
                  onChange={(e) => set("splash_width", Number(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Splash height (px)</Label>
                <Input type="number" value={form.splash_height}
                  onChange={(e) => set("splash_height", Number(e.target.value) || 0)} />
              </div>
            </div>
          </Card>

          <Card className="p-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Show install button in the app</div>
              <div className="text-xs text-muted-foreground">Adds an “Install app” action to the top bar when supported.</div>
            </div>
            <Switch checked={form.install_enabled} onCheckedChange={(v) => set("install_enabled", v)} />
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving} className="gradient-emerald text-white shadow-soft">
              <Save className="h-4 w-4 mr-1.5" />{saving ? "Saving…" : "Save settings"}
            </Button>
            <Button variant="outline" onClick={async () => {
              const ok = await promptInstall();
              if (!ok && !canInstall) toast.info(installed ? "Already installed" : "Your browser hasn't offered the install prompt yet");
            }}>
              <Download className="h-4 w-4 mr-1.5" />Test install
            </Button>
          </div>
        </div>

        <Card className="p-5 space-y-4 h-fit lg:sticky lg:top-20">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Smartphone className="h-4 w-4" />Preview</h2>
          <div className="overflow-hidden border" style={{ backgroundColor: form.background_color }}>
            <div className="mx-auto flex w-full flex-col items-center gap-3">
              {form.splash_url ? (
                <img src={form.splash_url} alt="Splash preview" className="block w-full object-cover" />
              ) : null}
              <div className="pb-6" />

              <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-[22%] shadow-elevated"
                style={{ backgroundColor: form.theme_color }}>
                {form.icon_url
                  ? <img src={form.icon_url} alt="App icon preview" className="h-full w-full object-cover" />
                  : <span className="text-2xl font-bold text-white">SI</span>}
              </div>
              <div className="text-center text-xs font-semibold" style={{ color: form.theme_color }}>
                {form.short_name || form.app_name}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Installed apps cache the icon and start page — users who already installed may need to reinstall to see changes.
          </p>
        </Card>
      </div>
    </div>
  );
}
