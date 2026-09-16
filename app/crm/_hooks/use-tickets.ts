"use client";

import { useMemo } from "react";
import type { Ticket } from "../_lib/types";

export const useTickets = (tickets: Ticket[]) => {
  const stats = useMemo(
    () => ({
      open: tickets.filter((ticket) => ticket.status === "Abierto").length,
      inProgress: tickets.filter((ticket) => ticket.status === "En proceso").length,
      resolved: tickets.filter((ticket) => ticket.status === "Resuelto").length,
      averageTime: "1.4h",
    }),
    [tickets]
  );

  return { stats };
};
