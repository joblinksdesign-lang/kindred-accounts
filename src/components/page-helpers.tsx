import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";

export function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ListToolbar({
  query, onQuery, onAdd, addLabel = "Add", placeholder = "Search…",
}: {
  query: string;
  onQuery: (v: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} className="pl-8 h-9" />
      </div>
      {onAdd && (
        <Button onClick={onAdd} className="gradient-emerald text-white shadow-soft h-9">
          <Plus className="h-4 w-4 mr-1.5" />{addLabel}
        </Button>
      )}
    </div>
  );
}

export function useSearch() {
  return useState("");
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Plus className="h-5 w-5" />
      </div>
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-muted-foreground mt-1">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
