import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Download, CheckCircle2, Lightbulb, HelpCircle } from "lucide-react";
import jsPDF from "jspdf";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-helpers";
import { useCompanySettings } from "@/lib/company";
import { loadCompanyLogo, savePdf, hexToRgb } from "@/lib/pdf";
import { manualSections, manualBenefits, manualTips, manualFaq } from "@/lib/manual-content";

export const Route = createFileRoute("/_authenticated/manual")({
  head: () => ({
    meta: [
      { title: "User manual — Softtrack Pos" },
      {
        name: "description",
        content:
          "Step-by-step guide to running your business on Softtrack Pos: selling, stock, invoices, reports, staff and more. Download it as a PDF.",
      },
      { property: "og:title", content: "User manual — Softtrack Pos" },
      { property: "og:description", content: "Everything you need to use Softtrack Pos, from setup to reports." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManualPage,
});

function ManualPage() {
  const { data: company } = useCompanySettings();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const [r, g, b] = hexToRgb(company?.brand_color ?? null);
      const businessName = company?.company_name || "Your business";
      const logo = company ? await loadCompanyLogo(company) : null;

      const pageW = 210;
      const marginX = 16;
      const maxW = pageW - marginX * 2;
      let y = 0;

      const footer = () => {
        const page = doc.getNumberOfPages();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(140, 140, 140);
        doc.text(`${businessName} • Softtrack Pos user manual`, marginX, 289);
        doc.text(String(page), pageW - marginX, 289, { align: "right" });
      };

      const newPage = () => {
        footer();
        doc.addPage();
        y = 22;
      };

      const need = (h: number) => {
        if (y + h > 275) newPage();
      };

      const write = (text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number; indent?: number }) => {
        const size = opts.size ?? 10.5;
        doc.setFont("helvetica", opts.bold ? "bold" : "normal");
        doc.setFontSize(size);
        const c = opts.color ?? [45, 55, 72];
        doc.setTextColor(c[0], c[1], c[2]);
        const indent = opts.indent ?? 0;
        const lines = doc.splitTextToSize(text, maxW - indent) as string[];
        const lh = size * 0.46;
        need(lines.length * lh + 2);
        lines.forEach((line) => {
          doc.text(line, marginX + indent, y);
          y += lh;
        });
        y += opts.gap ?? 2;
      };

      // Cover
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, pageW, 76, "F");
      if (logo) {
        try {
          doc.addImage(logo.dataUrl, logo.format, marginX, 16, 22, 22, undefined, "FAST");
        } catch {
          /* ignore logo issues */
        }
      }
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(26);
      doc.text("User Manual", marginX, logo ? 52 : 40);
      doc.setFontSize(13);
      doc.setFont("helvetica", "normal");
      doc.text(businessName, marginX, logo ? 62 : 50);
      doc.setFontSize(10);
      doc.text("Softtrack Pos — sales, stock, invoices and reports", marginX, logo ? 69 : 58);

      y = 92;
      write("What this manual covers", { size: 15, bold: true, color: [26, 32, 44], gap: 3 });
      write(
        "This guide explains how to run your day-to-day business on Softtrack Pos, from setting up your details to selling at the counter, invoicing customers, tracking stock and reading your profit. Follow it in order the first time, then use it as a reference.",
        { gap: 5 },
      );

      write("Why businesses use Softtrack Pos", { size: 13, bold: true, color: [26, 32, 44], gap: 3 });
      manualBenefits.forEach((t) => write(`•  ${t}`, { indent: 2, gap: 1 }));
      y += 4;

      manualSections.forEach((s) => {
        need(26);
        doc.setFillColor(r, g, b);
        doc.rect(marginX, y - 4.6, 2.4, 6.4, "F");
        write(s.title, { size: 13, bold: true, color: [26, 32, 44], indent: 6, gap: 2 });
        if (s.intro) write(s.intro, { gap: 2 });
        s.steps?.forEach((step, i) => write(`${i + 1}.  ${step}`, { indent: 3, gap: 1 }));
        s.tips?.forEach((tip) => write(`Tip:  ${tip}`, { indent: 3, color: [80, 100, 120], gap: 1 }));
        y += 5;
      });

      need(30);
      write("Quick tips for getting the most out of the system", { size: 13, bold: true, color: [26, 32, 44], gap: 3 });
      manualTips.forEach((t) => write(`•  ${t}`, { indent: 2, gap: 1 }));
      y += 4;

      need(30);
      write("Common questions", { size: 13, bold: true, color: [26, 32, 44], gap: 3 });
      manualFaq.forEach((f) => {
        write(f.q, { bold: true, gap: 1 });
        write(f.a, { indent: 3, gap: 3 });
      });

      footer();
      await savePdf(doc, `${businessName.replace(/[^\w\-]+/g, "-")}-user-manual.pdf`);
      toast.success("Manual downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Could not create the manual PDF", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="User manual"
        subtitle="Everything you need to run your business here — from setup to reports."
        action={
          <Button onClick={download} disabled={busy} className="gradient-emerald text-white shadow-soft">
            <Download className="h-4 w-4 mr-1.5" />
            {busy ? "Preparing…" : "Download PDF"}
          </Button>
        }
      />

      <Card className="p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">Welcome to {useCompanyName()}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Read this guide in order the first time you set up. Afterwards use it as a reference, or download the PDF
              and give a copy to your staff.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5 mb-6">
        <h2 className="text-lg font-bold mb-3">Why businesses use this system</h2>
        <ul className="space-y-2">
          {manualBenefits.map((b) => (
            <li key={b} className="flex gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5 mb-6">
        <h2 className="text-lg font-bold mb-2">Contents</h2>
        <div className="grid gap-1 sm:grid-cols-2">
          {manualSections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-sm text-primary hover:underline">
              {s.title}
            </a>
          ))}
        </div>
      </Card>

      <div className="space-y-5">
        {manualSections.map((s) => (
          <Card key={s.id} id={s.id} className="p-5 scroll-mt-20">
            <h2 className="text-lg font-bold">{s.title}</h2>
            {s.intro && <p className="text-sm text-muted-foreground mt-1">{s.intro}</p>}
            {s.steps && (
              <ol className="mt-3 space-y-2 list-decimal pl-5 text-sm marker:text-muted-foreground">
                {s.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {s.tips?.map((tip) => (
              <div key={tip} className="mt-3 flex gap-2 rounded-lg bg-muted/60 p-3 text-sm">
                <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>{tip}</span>
              </div>
            ))}
          </Card>
        ))}
      </div>

      <Card className="p-5 mt-6">
        <h2 className="text-lg font-bold mb-3">Quick tips</h2>
        <ul className="space-y-2">
          {manualTips.map((t) => (
            <li key={t} className="flex gap-2 text-sm">
              <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5 mt-6 mb-4">
        <h2 className="text-lg font-bold mb-3">Common questions</h2>
        <div className="space-y-3">
          {manualFaq.map((f) => (
            <div key={f.q} className="flex gap-2">
              <HelpCircle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <div className="text-sm font-semibold">{f.q}</div>
                <p className="text-sm text-muted-foreground">{f.a}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-center pb-6">
        <Button onClick={download} disabled={busy} variant="outline">
          <Download className="h-4 w-4 mr-1.5" />
          {busy ? "Preparing…" : "Download this manual as PDF"}
        </Button>
      </div>
    </div>
  );
}

function useCompanyName() {
  const { data: company } = useCompanySettings();
  return company?.company_name || "your business";
}
