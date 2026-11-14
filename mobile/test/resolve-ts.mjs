export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.')) throw err;
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(specifier + suffix, context);
      } catch {
        // try the next one
      }
    }
    throw err;
  }
}
