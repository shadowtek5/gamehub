"use client";

// "Scan to connect" QR shown once, right after an API token is created. Encodes
// a small JSON payload — { url, token, name } — so a companion/external app can
// scan it and configure itself with this server's address and access token in
// one step, instead of the user copy-pasting a URL and token by hand.

import QRCode from "react-qr-code";

export default function ConnectQr({
  token,
  name,
  hint,
}: {
  token: string;
  name?: string;
  hint: string;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const payload = JSON.stringify({ url: origin, token, ...(name ? { name } : {}) });
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="shrink-0 rounded bg-white p-2">
        <QRCode value={payload} size={112} />
      </div>
      <div className="text-xs leading-relaxed text-dim">{hint}</div>
    </div>
  );
}
