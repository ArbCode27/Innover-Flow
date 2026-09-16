"use client";

import { useMemo } from "react";
import type { Client, Ticket } from "../_lib/types";

export const useClients = (clients: Client[], tickets: Ticket[]) => {
  const stats = useMemo(
    () => ({
      total: clients.length,
      active: clients.filter((client) => client.account === "Al día").length,
      debt: clients.filter((client) => client.account === "Con deuda").length,
      openTickets: tickets.filter((ticket) => ticket.status !== "Resuelto").length,
    }),
    [clients, tickets]
  );

  return { stats };
};
