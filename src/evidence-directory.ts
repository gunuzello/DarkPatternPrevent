import { join } from "node:path";

export function evidenceDirectory(id: string) {
  // Evidence is written at runtime and is outside the application bundle.
  return join(/* turbopackIgnore: true */ process.env.SCAN_RESULTS_DIR ?? join(process.cwd(), "scan-results"), id);
}
