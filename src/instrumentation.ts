// Runs once when the Next.js server starts. The actual work (filesystem watcher
// + daily auto-scan + self-update background tasks) lives in ./lib/serverStartup,
// imported dynamically only in the Node.js runtime so its `fs`/better-sqlite3
// usage never reaches the Edge bundle (Next compiles this file for every runtime).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Boot probation for staged self-update releases: if a staged release fails to
  // load/boot (e.g. a broken bundle whose native module won't resolve), exit so
  // the container restarts and docker-entrypoint.sh can count the failure toward
  // its 3-strike auto-revert to the baked-in image. Without this a crashing
  // release can hang on an unhandledRejection and never trigger the revert.
  // Never armed for the image itself; disarmed once confirmed healthy
  // (src/lib/update/background.ts).
  armBootProbation();

  try {
    const { startup } = await import("./lib/serverStartup");
    startup();
  } catch (e) {
    // Surface + rethrow so probation (if armed) exits for auto-revert.
    console.error("gamehub: server startup failed:", e);
    throw e;
  }
}

function armBootProbation() {
  const rel = process.env.GAMEHUB_RELEASE;
  if (!rel || rel === "image" || !process.env.GAMEHUB_DATA_DIR) return;
  const g = globalThis as unknown as { __ghProbation?: { disarm: () => void }; __ghProbationOff?: boolean };
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
