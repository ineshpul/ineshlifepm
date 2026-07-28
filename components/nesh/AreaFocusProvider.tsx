"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type AreaFocusContextValue = {
  focusAreaId: string | "all";
  setFocusAreaId: (id: string | "all") => void;
  isAllAreas: boolean;
};

const AreaFocusContext = createContext<AreaFocusContextValue | null>(null);

export function AreaFocusProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("area");
  const [local, setLocal] = useState<string | "all" | null>(null);

  const focusAreaId: string | "all" =
    local ?? (fromUrl === null || fromUrl === "all" ? "all" : fromUrl);

  const setFocusAreaId = useCallback(
    (id: string | "all") => {
      setLocal(id);
      const params = new URLSearchParams(searchParams.toString());
      if (id === "all") params.delete("area");
      else params.set("area", id);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const value = useMemo(
    () => ({
      focusAreaId,
      setFocusAreaId,
      isAllAreas: focusAreaId === "all",
    }),
    [focusAreaId, setFocusAreaId]
  );

  return <AreaFocusContext.Provider value={value}>{children}</AreaFocusContext.Provider>;
}

export function useAreaFocus() {
  const ctx = useContext(AreaFocusContext);
  if (!ctx) throw new Error("useAreaFocus must be used within AreaFocusProvider");
  return ctx;
}
