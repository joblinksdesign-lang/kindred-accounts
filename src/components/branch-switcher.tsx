import { Building } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranchContext } from "@/lib/branches";

const ALL = "__all__";

/** Lets staff pick which branch they are working in (or shows the branch they are tied to). */
export function BranchSwitcher() {
  const { enabled, branches, activeBranch, locked, setBranch } = useBranchContext();

  if (!enabled || branches.length === 0) return null;

  if (locked) {
    return (
      <Badge variant="outline" className="gap-1.5 text-xs">
        <Building className="h-3 w-3" />
        {activeBranch?.name ?? "Branch"}
      </Badge>
    );
  }

  return (
    <Select
      value={activeBranch?.id ?? ALL}
      onValueChange={(v) => setBranch(v === ALL ? null : v)}
    >
      <SelectTrigger className="h-9 w-[150px] text-xs sm:w-[190px]" aria-label="Branch">
        <Building className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All branches</SelectItem>
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
            {!b.is_active ? " (closed)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
