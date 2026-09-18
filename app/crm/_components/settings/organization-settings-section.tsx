"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Camera, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Organization, OrganizationRole } from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";

type OrganizationDraft = Pick<
  Organization,
  | "name"
  | "legal_name"
  | "tax_id"
  | "email"
  | "phone"
  | "address"
  | "timezone"
  | "currency"
  | "logo_url"
>;

export const OrganizationSettingsSection = ({
  organization,
  organizationRole,
  onUpdated,
}: {
  organization: Organization;
  organizationRole: OrganizationRole | null;
  onUpdated: (organization: Organization) => void;
}) => {
  const [draft, setDraft] = useState<OrganizationDraft>(organization);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newOrganizationName, setNewOrganizationName] = useState("");
  const [newOrganizationSlug, setNewOrganizationSlug] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = organizationRole === "owner" || organizationRole === "admin";

  useEffect(() => {
    setDraft({
      name: organization.name,
      legal_name: organization.legal_name || "",
      tax_id: organization.tax_id || "",
      email: organization.email || "",
      phone: organization.phone || "",
      address: organization.address || "",
      timezone: organization.timezone || "America/Caracas",
      currency: organization.currency || "USD",
      logo_url: organization.logo_url || null,
    });
  }, [organization]);

  const handleChange = (field: keyof OrganizationDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleLogoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !canEdit) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no debe superar los 5 MB");
      return;
    }

    setIsUploadingLogo(true);
    const formData = new FormData();
    formData.append("logo", file);

    try {
      const response = await fetch("/api/crm/organization/logo", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo subir el logo");
      }

      setDraft((current) => ({ ...current, logo_url: payload.logo_url }));
      if (payload.organization) {
        onUpdated(payload.organization);
      }
      toast.success("Logo actualizado correctamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al subir el logo");
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveLogo = async () => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/crm/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, logo_url: null }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo eliminar el logo");
      }
      setDraft((current) => ({ ...current, logo_url: null }));
      onUpdated(payload.organization);
      toast.success("Logo eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/crm/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo guardar la organización");
      }
      onUpdated(payload.organization);
      toast.success("Organización actualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!canEdit || isCreating) return;
    setIsCreating(true);
    try {
      const createResponse = await fetch("/api/crm/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newOrganizationName,
          slug: newOrganizationSlug,
        }),
      });
      const createPayload = await createResponse.json();
      if (!createResponse.ok) {
        throw new Error(createPayload.error || "No se pudo crear");
      }
      const switchResponse = await fetch("/api/crm/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: createPayload.organization.id }),
      });
      if (!switchResponse.ok) {
        throw new Error("La organización se creó, pero no se pudo abrir");
      }
      toast.success("Organización creada");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card className={`rounded-2xl border-0 ${CRM_SURFACES.elevated}`}>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="size-4 text-crm-accent" aria-hidden="true" />
          Perfil de la organización
        </CardTitle>
        {canEdit ? (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="size-4" />
                Nueva sucursal / empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nueva organización</DialogTitle>
                <DialogDescription>
                  Se creará un espacio totalmente independiente con sus propios asesores y clientes.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-organization-name">Nombre</Label>
                  <Input
                    id="new-organization-name"
                    value={newOrganizationName}
                    placeholder="Ej. Conexiones Los Teques"
                    onChange={(event) => {
                      const name = event.target.value;
                      setNewOrganizationName(name);
                      setNewOrganizationSlug(
                        name
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, ""),
                      );
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-organization-slug">Identificador (Slug)</Label>
                  <Input
                    id="new-organization-slug"
                    value={newOrganizationSlug}
                    placeholder="conexiones-los-teques"
                    onChange={(event) => setNewOrganizationSlug(event.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => void handleCreateOrganization()}
                  disabled={
                    isCreating ||
                    newOrganizationName.trim().length < 2 ||
                    newOrganizationSlug.trim().length < 2
                  }>
                  {isCreating ? "Creando…" : "Crear y abrir"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </CardHeader>
      <CardContent>
        {/* Sección de Logo */}
        <div className="mb-6 flex flex-col gap-4 border-b border-border/40 pb-6 sm:flex-row sm:items-center">
          <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-muted/40 shadow-sm">
            {draft.logo_url ? (
              <img
                src={draft.logo_url}
                alt={`Logo de ${draft.name}`}
                className="size-full object-cover"
              />
            ) : (
              <Building2 className="size-8 text-muted-foreground/60" aria-hidden="true" />
            )}
            {isUploadingLogo ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <Loader2 className="size-5 animate-spin text-crm-accent" />
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <h4 className="text-sm font-medium">Logo corporativo</h4>
            <p className="text-xs text-muted-foreground">
              Se mostrará en la barra lateral del CRM y membretes del equipo. Formatos recomendados: PNG o SVG (máx. 5 MB).
            </p>
            {canEdit ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoFileChange}
                  className="hidden"
                  id="logo-upload-input"
                  disabled={isUploadingLogo || isSaving}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploadingLogo || isSaving}
                  onClick={() => fileInputRef.current?.click()}>
                  <Camera className="mr-1.5 size-3.5" />
                  {draft.logo_url ? "Cambiar logo" : "Subir logo"}
                </Button>
                {draft.logo_url ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isUploadingLogo || isSaving}
                    onClick={() => void handleRemoveLogo()}
                    className="text-destructive hover:bg-destructive/10">
                    <Trash2 className="mr-1.5 size-3.5" />
                    Quitar
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="organization-name">Nombre comercial</Label>
            <Input
              id="organization-name"
              value={draft.name}
              onChange={(event) => handleChange("name", event.target.value)}
              disabled={!canEdit || isSaving}
              className={CRM_SURFACES.input}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization-legal-name">Razón social</Label>
            <Input
              id="organization-legal-name"
              value={draft.legal_name || ""}
              placeholder="Ej. Inversiones y Conexiones C.A."
              onChange={(event) => handleChange("legal_name", event.target.value)}
              disabled={!canEdit || isSaving}
              className={CRM_SURFACES.input}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization-tax-id">RIF / identificación fiscal</Label>
            <Input
              id="organization-tax-id"
              value={draft.tax_id || ""}
              placeholder="Ej. J-12345678-9"
              onChange={(event) => handleChange("tax_id", event.target.value)}
              disabled={!canEdit || isSaving}
              className={CRM_SURFACES.input}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization-email">Correo de contacto</Label>
            <Input
              id="organization-email"
              type="email"
              value={draft.email || ""}
              placeholder="contacto@empresa.com"
              onChange={(event) => handleChange("email", event.target.value)}
              disabled={!canEdit || isSaving}
              className={CRM_SURFACES.input}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization-phone">Teléfono de oficina</Label>
            <Input
              id="organization-phone"
              value={draft.phone || ""}
              placeholder="+58 412 0000000"
              onChange={(event) => handleChange("phone", event.target.value)}
              disabled={!canEdit || isSaving}
              className={CRM_SURFACES.input}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization-address">Dirección de sede / oficina</Label>
            <Input
              id="organization-address"
              value={draft.address || ""}
              placeholder="Ej. Av. Principal, Edificio Central, Piso 2"
              onChange={(event) => handleChange("address", event.target.value)}
              disabled={!canEdit || isSaving}
              className={CRM_SURFACES.input}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization-timezone">Zona horaria</Label>
            <Input
              id="organization-timezone"
              value={draft.timezone}
              onChange={(event) => handleChange("timezone", event.target.value)}
              disabled={!canEdit || isSaving}
              className={CRM_SURFACES.input}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization-currency">Moneda de facturación</Label>
            <Input
              id="organization-currency"
              value={draft.currency}
              maxLength={3}
              placeholder="USD"
              onChange={(event) => handleChange("currency", event.target.value)}
              disabled={!canEdit || isSaving}
              className={CRM_SURFACES.input}
            />
          </div>
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            {!canEdit ? (
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                Tu rol permite consultar, pero no editar esta información.
              </p>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={!canEdit || isSaving}>
              <Save className="size-4" />
              {isSaving ? "Guardando…" : "Guardar organización"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
