"use client";

import { FormEvent, useState } from "react";
import { CrmButton } from "../shared/crm-button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCOUNT_STATUSES, INTERNET_PLANS } from "../../_lib/constants";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import type { ClientAccountStatus, CreateClientInput } from "../../_lib/types";

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateClient: (input: CreateClientInput) => Promise<void>;
}

export const ClientFormDialog = ({
  open,
  onOpenChange,
  onCreateClient,
}: ClientFormDialogProps) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState(INTERNET_PLANS[2]);
  const [zone, setZone] = useState("");
  const [account, setAccount] = useState<ClientAccountStatus>("Al día");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    await onCreateClient({
      name: name.trim(),
      phone: phone.trim(),
      plan,
      zone: zone.trim() || "Sin asignar",
      account,
    });
    setName("");
    setPhone("");
    setZone("");
    setAccount("Al día");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={CRM_DIALOG}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
          </DialogHeader>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client-name">Nombre</Label>
              <Input id="client-name" value={name} onChange={(event) => setName(event.target.value)} className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-phone">Teléfono</Label>
              <Input id="client-phone" value={phone} onChange={(event) => setPhone(event.target.value)} className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`} />
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger className={`w-full ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERNET_PLANS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-zone">Zona / Nodo</Label>
              <Input id="client-zone" value={zone} onChange={(event) => setZone(event.target.value)} className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Estado de cuenta</Label>
              <Select value={account} onValueChange={(value) => setAccount(value as ClientAccountStatus)}>
                <SelectTrigger className={`w-full ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_STATUSES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-5">
            <CrmButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </CrmButton>
            <CrmButton type="submit">Guardar</CrmButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
