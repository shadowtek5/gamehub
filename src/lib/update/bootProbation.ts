// Boot probation for staged self-update releases. Lives in its own module (not
// inline in instrumentation.ts) so its Node-only `process.on`/`process.exit`
// never reaches the Edge bundle — instrumentation.ts is compiled for every
// runtime, so it only dynamic-imports this inside the nodejs branch.
//
// If a staged release fails to load/boot (e.g. a broken bundle whose native
// module won't resolve), we exit so the container restarts and
// docker-entrypoint.sh can count the failure toward its 3-strike auto-revert to
// the baked-in image. Without this a crashing release can hang on an
// unhandledRejection and never trigger the revert. Never armed for the image
// itself; disarmed once confirmed healthy (src/lib/update/background.ts).

export function armBootProbation() {
  const rel = process.env.GAMEHUB_RELEASE;
  if (!rel || rel === "image" || !process.env.GAMEHUB_DATA_DIR) return;
  const g = globalThis as unknown as {
    __ghProbation?: { disarm: () => void };
    __ghProbationOff?: boolean;
  };
  if (g.__ghProbation) return;
  const onFail = (kind: string) => (err: unknown) => {
    if (g.__ghProbationOff) return;
    console.error(`gamehub: staged release ${rel} ${kind} during boot — exiting for auto-revert:`, err);
    process.exit(1);
  };
  const ue = onFail("uncaughtException");
  const ur = onFail("unhandledRejection");
  process.on("uncaughtException", ue);
  process.on("unhandledRejection", ur);
  g.__ghProbation = {
    disarm: () => {
      g.__ghProbationOff = true;
      process.off("uncaughtException", ue);
      process.off("unhandledRejection", ur);
    },
  };
}
