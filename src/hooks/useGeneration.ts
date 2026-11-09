import { type DependencyList, useState } from "react";

function same(a: DependencyList, b: DependencyList): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/**
 * Returns a new token object whenever any dependency changes. Used to tell a
 * settled async result apart from the request currently in flight. Uses the
 * documented "adjust state during render" pattern rather than an effect.
 */
export function useGeneration(deps: DependencyList): object {
  const [gen, setGen] = useState(() => ({ deps, token: {} }));
  if (!same(gen.deps, deps)) {
    const next = { deps, token: {} };
    setGen(next);
    return next.token;
  }
  return gen.token;
}
