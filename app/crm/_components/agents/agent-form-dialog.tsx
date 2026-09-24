"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { CrmButton } from "../shared/crm-button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { Agent, AgentDepartment, AgentRole, AgentStatus, UpsertAgentInput } from "../../_lib/types";

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
  const [department, setDepartment] = useState<AgentDepartment>("soporte");
  const [status, setStatus] = useState<AgentStatus>("offline");
  const [maxConversations, setMaxConversations] = useState("5");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    setName(editingAgent?.name || "");
    setInitials(editingAgent?.initials || "");
    setEmail(editingAgent?.email || "");
    setPassword("");
    setRole(editingAgent?.role || "agent");
    setDepartment(editingAgent?.department || "soporte");
    setStatus(editingAgent?.status || "offline");
    setMaxConversations(String(editingAgent?.max_conversations || 5));
    setIsSubmitting(false);
  }, [editingAgent, open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName) {
      toast.error("El nombre del agente es requerido");
      return;
    }
    if (!normalizedEmail) {
      toast.error("El correo electrónico es requerido");
      return;
    }
    if (!editingAgent && !password) {
      toast.error("Debes definir una contraseña para el nuevo asesor");
      return;
    }
    if (password && password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveAgent({
        id: editingAgent?.id,
        name: normalizedName,
        email: normalizedEmail,
        password: password || undefined,
        role,
        department,
        status: editingAgent ? status : "offline",
        initials: (initials.trim() || getInitials(normalizedName)).slice(0, 2).toUpperCase(),
        maxConversations: Number(maxConversations) || 5,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar asesor");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={CRM_DIALOG}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editingAgent ? "Editar asesor de oficina" : "Nuevo asesor de oficina"}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {editingAgent
                ? "Actualiza los datos, rol o restablece la contraseña del asesor."
                : "Se creará el usuario en Supabase Auth y se asociará inmediatamente a esta organización."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Nombre completo</Label>
              <Input
                id="agent-name"
                value={name}
                placeholder="Ej. Carlos Mendoza"
                onChange={(event) => setName(event.target.value)}
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-initials">Iniciales</Label>
              <Input
                id="agent-initials"
                value={initials}
                placeholder="CM"
                onChange={(event) => setInitials(event.target.value)}
                maxLength={2}
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="agent-email">Correo electrónico de acceso</Label>
              <Input
                id="agent-email"
                type="email"
                value={email}
                placeholder="asesor@empresa.com"
                onChange={(event) => setEmail(event.target.value)}
                disabled={Boolean(editingAgent)}
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
                required
              />
              {editingAgent ? (
                <p className="text-[11px] text-muted-foreground">
                  El correo identifica la cuenta en Supabase Auth y no se puede modificar directamente.
                </p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="agent-password">
                {editingAgent ? "Restablecer contraseña (opcional)" : "Contraseña de acceso"}
              </Label>
              <Input
                id="agent-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={editingAgent ? "Dejar en blanco para mantener la actual" : "Mínimo 6 caracteres"}
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
                required={!editingAgent}
              />
            </div>

            <div className="space-y-2">
              <Label>Rol en la oficina</Label>
              <Select value={role} onValueChange={(value) => setRole(value as AgentRole)}>
                <SelectTrigger className={`w-full ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador (Control total)</SelectItem>
                  <SelectItem value="agent">Asesor (Solo atención)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Especialidad / Departamento</Label>
              <Select value={department} onValueChange={(value) => setDepartment(value as AgentDepartment)}>
                <SelectTrigger className={`w-full ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="soporte">🛠️ Soporte Técnico</SelectItem>
                  <SelectItem value="cobranza">💳 Cobranza y Pagos</SelectItem>
                  <SelectItem value="general">🌐 General / Polivalente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="agent-max">Capacidad máx. (chats concurrentes)</Label>
              <Input
                id="agent-max"
                type="number"
                min={1}
                max={25}
                value={maxConversations}
                onChange={(event) => setMaxConversations(event.target.value)}
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
              />
              <p className="text-[11px] text-muted-foreground">
                Determina el cálculo del porcentaje de saturación y carga operativa en el Dashboard.
              </p>
            </div>

            {editingAgent ? (
              <div className="space-y-2 sm:col-span-2">
                <Label>Estado de disponibilidad</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as AgentStatus)}>
                  <SelectTrigger className={`w-full ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">En línea (Disponible)</SelectItem>
                    <SelectItem value="busy">Ocupado</SelectItem>
                    <SelectItem value="offline">Desconectado</SelectItem>
                    <SelectItem value="inactive">Inactivo (Suspendido)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <DialogFooter className="mt-6 gap-2">
            <CrmButton
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}>
              Cancelar
            </CrmButton>
            <CrmButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Guardando…
                </>
              ) : editingAgent ? (
                "Guardar cambios"
              ) : (
                "Crear asesor"
              )}
            </CrmButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
