import { useCallback, useReducer } from "react";

export type ModalId = "import" | "export" | "budget" | "hedge" | "simulate" | "backtest" | "drift" | "slips" | "match";

export interface ModalState {
  open: ModalId | null;
  fixtureId: string | null;
}

export type ModalAction = { type: "open"; id: ModalId; fixtureId?: string } | { type: "close" };

export function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "open":
      if ((action.id === "match" || action.id === "drift") && !action.fixtureId && !state.fixtureId) return state;
      return { open: action.id, fixtureId: action.fixtureId ?? state.fixtureId };
    case "close":
      return { open: null, fixtureId: state.fixtureId };
  }
}

export function useModals() {
  const [state, dispatch] = useReducer(modalReducer, { open: null, fixtureId: null });
  const open = useCallback((id: ModalId, fixtureId?: string) => dispatch({ type: "open", id, fixtureId }), []);
  const close = useCallback(() => dispatch({ type: "close" }), []);
  return { ...state, open, close, isOpen: (id: ModalId) => state.open === id };
}
