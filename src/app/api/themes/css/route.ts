import { compiledThemeCss } from "@/lib/themes";

export const dynamic = "force-dynamic";

/** The compiled CSS of all enabled themes — public, it's just styling */
export async function GET() {
  return new Response(compiledThemeCss(), {
    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" },
  });
}
