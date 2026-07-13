// Runs once when the Next.js server starts. The actual work (filesystem watcher
// + daily auto-scan) lives in ./lib/serverStartup, imported dynamically only in
// the Node.js runtime so its `fs`/better-sqlite3 usage never reaches the Edge
// bundle (Next compiles this file for every runtime).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startup } = await import("./lib/serverStartup");
  startup();
}
