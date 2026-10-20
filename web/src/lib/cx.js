/** Joins truthy class names. Nested arrays are flattened. */
export function cx(...classes) {
  return classes.flat(Infinity).filter(Boolean).join(' ')
}
