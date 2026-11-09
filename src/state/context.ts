import { type Dispatch, createContext, useContext } from "react";
import type { Action, AppState } from "./appState";

export const StateContext = createContext<AppState | null>(null);
export const DispatchContext = createContext<Dispatch<Action> | null>(null);

export function useAppState(): AppState {
  const s = useContext(StateContext);
  if (!s) throw new Error("useAppState must be used inside AppStateProvider");
  return s;
}

export function useDispatch(): Dispatch<Action> {
  const d = useContext(DispatchContext);
  if (!d) throw new Error("useDispatch must be used inside AppStateProvider");
  return d;
}
