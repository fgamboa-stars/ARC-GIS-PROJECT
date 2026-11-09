import { type ReactNode, useReducer } from "react";
import { initialState, reducer } from "./appState";
import { DispatchContext, StateContext } from "./context";

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}
