import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

export default async function cleanup() {
  const directory = process.env.PLAYWRIGHT_RUN_DIRECTORY;
  if (directory && dirname(resolve(directory)) === resolve(tmpdir()) && /^darkpattern-test-[a-zA-Z0-9]{6}$/.test(basename(directory))) {
    await rm(directory, { recursive: true, force: true });
  }
}
