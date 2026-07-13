"use client";

import { usePathname } from "next/navigation";
import { recordPath } from "@/lib/routePath";

// Records the current path during render (before effects), so browse views can
// read the previous path on mount to decide whether to restore or clear filters.
export default function RoutePathTracker() {
  recordPath(usePathname());
  return null;
}
