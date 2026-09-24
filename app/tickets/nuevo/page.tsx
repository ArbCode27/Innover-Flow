import { Metadata } from "next";
import { WisproTicketOrderPanel } from "@/app/crm/_components/wispro/wispro-ticket-order-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nuevo Ticket y Orden Wispro | Innover Flow",
  description: "Panel de generación de tickets y órdenes de trabajo en Wispro desde reportes de soporte.",
};

export default function NuevoTicketPage() {
  return (
    <main className="h-screen w-screen overflow-hidden">
      <WisproTicketOrderPanel />
    </main>
  );
}
