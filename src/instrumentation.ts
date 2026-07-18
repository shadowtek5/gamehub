// Runs once when the Next.js server starts. The actual work (filesystem watcher
// + daily auto-scan + self-update background tasks) lives in ./lib/serverStartup,
// and the staged-release boot probation in ./lib/update/bootProbation — both
// imported dynamically only in the Node.js runtime so their `fs`/better-sqlite3/
// `process.on` usage never reaches the Edge bundle (Next compiles this file for
// every runtime).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Boot probation for staged self-update releases: if a staged release fails to
  // load/boot, exit so the container restarts and docker-entrypoint.sh can count
  // the failure toward its 3-strike auto-revert. Armed before startup so a
  // failure during startup() is caught. See ./lib/update/bootProbation.
  const { armBootProbation } = await import("./lib/update/bootProbation");
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
