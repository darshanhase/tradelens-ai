import { useSyncExternalStore } from "react";
import * as store from "@/services/store";

export function useApp(): store.AppState {
  return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
}
