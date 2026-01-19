// dashboard/src/stores/activity.ts
import { create } from "zustand";

export interface ActivityEvent {
  id: string;
  type: "claim.created" | "claim.updated" | "claim.deleted" | "agent.started" | "agent.completed";
  issueId?: string;
  title?: string;
  agentId?: string;
  agentType?: string;
  message: string;
  timestamp: Date;
}

interface ActivityState {
  events: ActivityEvent[];
  maxEvents: number;

  addEvent: (event: Omit<ActivityEvent, "id" | "timestamp">) => void;
  clearEvents: () => void;
}

let eventCounter = 0;

export const useActivityStore = create<ActivityState>((set) => ({
  events: [],
  maxEvents: 50,

  addEvent: (event) =>
    set((state) => {
      const newEvent: ActivityEvent = {
        ...event,
        id: `event-${++eventCounter}`,
        timestamp: new Date(),
      };

      const events = [newEvent, ...state.events].slice(0, state.maxEvents);
      return { events };
    }),

  clearEvents: () => set({ events: [] }),
}));
