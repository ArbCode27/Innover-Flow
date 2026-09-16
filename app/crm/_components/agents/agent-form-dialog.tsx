"use client";

import { FormEvent, useEffect, useState } from "react";
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
import { getInitials } from "../../_lib/formatters";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import type { Agent, AgentRole, UpsertAgentInput } from "../../_lib/types";

interface AgentFormDialogProps {
  open: boolean;
  editingAgent: Agent | null;
  onOpenChange: (open: boolean) => void;
  onSaveAgent: (input: UpsertAgentInput) => Promise<void>;
}

export const AgentFormDialog = ({
  open,
  editingAgent,
  onOpenChange,
  onSaveAgent,
}: AgentFormDialogProps) => {
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AgentRole>("agent");
  const [maxConversations, setMaxConversations] = useState("5");

  useEffect(() => {
    if (!open) return;

    setName(editingAgent?.name || "");
    setInitials(editingAgent?.initials || "");
    setEmail(editingAgent?.email || "");
    setPassword("");
    setRole(editingAgent?.role || "agent");
    setMaxConversations(String(editingAgent?.max_conversations || 5));
  }, [editingAgent, open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedEmail = email.trim();
    if (!normalizedName || !normalizedEmail) return;
    if (!editingAgent && !password) return;

    await onSaveAgent({
      id: editingAgent?.id,
      name: normalizedName,
      email: normalizedEmail,
      password: password || undefined,
      role,
      initials: (initials.trim() || getInitials(normalizedName)).slice(0, 2).toUpperCase(),
      maxConversations: Number(maxConversations) || 5,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={CRM_DIALOG}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editingAgent ? "Editar agente" : "Nuevo agente"}</DialogTitle>
          </DialogHeader>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Nombre completo</Label>
              <Input id="agent-name" value={name} onChange={(event) => setName(event.target.value)} className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-initials">Iniciales</Label>
              <Input id="agent-initials" value={initials} onChange={(event) => setInitials(event.target.value)} maxLength={2} className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="agent-email">Correo electrónico</Label>
              <Input id="agent-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="agent-password">Contraseña</Label>
              <Input id="agent-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={editingAgent ? "Deja vacío para mantenerla" : "Mínimo 6 caracteres"} className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`} />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={role} onValueChange={(value) => setRole(value as AgentRole)}>
                <SelectTrigger className={`w-full ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="agent">Agente básico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-max">Máx. conversaciones</Label>
              <Input id="agent-max" type="number" min={1} max={20} value={maxConversations} onChange={(event) => setMaxConversations(event.target.value)} className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`} />
            </div>
          </div>
          <DialogFooter className="mt-5">
            <CrmButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </CrmButton>
            <CrmButton type="submit">Guardar agente</CrmButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
