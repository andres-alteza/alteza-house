import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

function rewriteSpecifier(specifier, parentURL) {
  if (specifier.startsWith("@/")) {
    const absolute = join(process.cwd(), specifier.slice(2))
    if (existsSync(absolute)) return pathToFileURL(absolute).href
    if (existsSync(`${absolute}.ts`)) return pathToFileURL(`${absolute}.ts`).href
    if (existsSync(`${absolute}.tsx`)) return pathToFileURL(`${absolute}.tsx`).href
    return null
  }

  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return null
  if (!parentURL || !parentURL.startsWith("file:")) return null

  const parentDir = dirname(fileURLToPath(parentURL))
  const absolute = join(parentDir, specifier)
  if (existsSync(absolute) && !absolute.endsWith("/")) return pathToFileURL(absolute).href
  if (existsSync(`${absolute}.ts`)) return pathToFileURL(`${absolute}.ts`).href
  if (existsSync(`${absolute}.tsx`)) return pathToFileURL(`${absolute}.tsx`).href
  return null
}

export async function resolve(specifier, context, nextResolve) {
  const rewritten = rewriteSpecifier(specifier, context.parentURL)
  if (rewritten) {
    return nextResolve(rewritten, context)
  }
  return nextResolve(specifier, context)
}
