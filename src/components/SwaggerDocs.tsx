"use client";

// Swagger UI over /api/openapi.json (swagger-ui-dist from unpkg).

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    SwaggerUIBundle?: (opts: Record<string, unknown>) => unknown;
  }
}

const CSS_URL = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css";
const JS_URL = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";

export default function SwaggerDocs() {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CSS_URL;
      document.head.appendChild(link);
    }

    let cancelled = false;
    function init() {
      if (cancelled || !window.SwaggerUIBundle || !mount.current) return;
      window.SwaggerUIBundle({
        url: "/api/openapi.json",
        domNode: mount.current,
        deepLinking: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
      });
    }

    if (window.SwaggerUIBundle) {
      init();
    } else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${JS_URL}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = JS_URL;
        document.head.appendChild(script);
      }
      script.addEventListener("load", init);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Swagger UI is a light-theme component — give it a light island
  return (
    <div className="mx-auto max-w-[1200px] rounded-[4px] bg-[#fafafa] p-2 text-black shadow-2xl">
      <div ref={mount} />
    </div>
  );
}
