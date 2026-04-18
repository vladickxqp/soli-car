import { TicketPriority, TicketStatus } from "../types";

export const getTicketStatusTone = (status: TicketStatus) => {
  switch (status) {
    case "OPEN":
      return "blue" as const;
    case "IN_PROGRESS":
      return "yellow" as const;
    case "CLOSED":
      return "slate" as const;
    default:
      return "slate" as const;
  }
};

export const getTicketPriorityTone = (priority: TicketPriority) => {
  switch (priority) {
    case "HIGH":
      return "red" as const;
    case "MEDIUM":
      return "yellow" as const;
    case "LOW":
      return "green" as const;
    default:
      return "slate" as const;
  }
};
