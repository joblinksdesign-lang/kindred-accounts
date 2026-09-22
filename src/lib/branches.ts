import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenantId } from "@/lib/tenant";
import { useCurrentUser } from "@/lib/use-current-user";
import { useTenantModules } from "@/lib/modules";

export type Branch = {
  id: string;
  tenant_id: string;
  name: string;
  code: string | null;
  phone: string | null;
  address: string | null;
  is_default: boolean;
  is_active: boolean;
};

const storageKey = (tenantId: string) => `softtrack.active_branch.${tenantId}`;

/**
 * Shared, app-wide selection so every screen reacts the moment the branch is
 * switched in the top bar (per-component state only updated the switcher).
 */
const branchSelection = new Map<string, string | null>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribeBranch(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function readBranch(tenantId: string | null | undefined): string | null {
  if (!tenantId) return null;
  if (!branchSelection.has(tenantId)) {
    const fromStorage = typeof window === "undefined" ? null : localStorage.getItem(storageKey(tenantId));
    branchSelection.set(tenantId, fromStorage);
  }
  return branchSelection.get(tenantId) ?? null;
}

function writeBranch(tenantId: string, id: string | null) {
  branchSelection.set(tenantId, id);
  if (typeof window !== "undefined") {
    if (id) localStorage.setItem(storageKey(tenantId), id);
    else localStorage.removeItem(storageKey(tenantId));
  }
  emit();
}

export function useBranches() {
  const tenantId = useActiveTenantId();
  return useQuery<Branch[]>({
    queryKey: ["branches", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, tenant_id, name, code, phone, address, is_default, is_active")
        .eq("tenant_id", tenantId!)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });
}

/** The branch this user is tied to, or null when they can work across all branches. */
export function useMyBranchId() {
  const tenantId = useActiveTenantId();
  const { user } = useCurrentUser();
  return useQuery<string | null>({
    queryKey: ["my_branch", tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select("branch_id")
        .eq("tenant_id", tenantId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.branch_id as string | null) ?? null;
    },
  });
}

export type BranchContext = {
  /** Branches module unlocked on the plan. */
  enabled: boolean;
  branches: Branch[];
  activeBranch: Branch | null;
  /** Branch new records should be written to (never null once branches exist). */
  branchId: string | null;
  /** Branch to filter lists by — null means "all branches". */
  filterBranchId: string | null;
  /** True when the user is tied to a single branch and cannot switch. */
  locked: boolean;
  setBranch: (id: string | null) => void;
  isLoading: boolean;
};

export function useBranchContext(): BranchContext {
  const tenantId = useActiveTenantId();
  const { data: branches = [], isLoading: loadingBranches } = useBranches();
  const { data: myBranchId = null, isLoading: loadingMine } = useMyBranchId();
  const { data: modules } = useTenantModules();
  const enabled = modules?.has("branches") ?? false;

  const stored = useSyncExternalStore(
    subscribeBranch,
    () => readBranch(tenantId),
    () => null,
  );

  const setBranch = useCallback(
    (id: string | null) => {
      if (!tenantId) return;
      writeBranch(tenantId, id);
    },
    [tenantId],
  );

  const locked = !!myBranchId;
  const selectedId = locked ? myBranchId : stored;
  const activeBranch = branches.find((b) => b.id === selectedId) ?? null;
  const defaultBranch = branches.find((b) => b.is_default) ?? branches[0] ?? null;

  return {
    enabled,
    branches,
    activeBranch,
    branchId: activeBranch?.id ?? defaultBranch?.id ?? null,
    filterBranchId: enabled ? activeBranch?.id ?? null : null,
    locked,
    setBranch,
    isLoading: loadingBranches || loadingMine,
  };
}

/** Quantities of every product at one branch (or across all branches when branchId is null). */
export function useBranchStock(branchId: string | null) {
  const tenantId = useActiveTenantId();
  return useQuery<Record<string, number>>({
    queryKey: ["branch_stock", tenantId, branchId],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase.from("branch_stock").select("product_id, quantity").eq("tenant_id", tenantId!);
      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        map[row.product_id] = (map[row.product_id] ?? 0) + Number(row.quantity ?? 0);
      }
      return map;
    },
  });
}
