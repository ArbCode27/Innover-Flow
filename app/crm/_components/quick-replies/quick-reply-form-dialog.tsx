"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as UiLabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CrmButton } from "../shared/crm-button";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import type { CreateQuickReplyInput, QuickReply, UpdateQuickReplyInput } from "../../_lib/types";

interface QuickReplyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingQuickReply: QuickReply | null;
  onCreateQuickReply: (input: CreateQuickReplyInput) => Promise<void>;
  onUpdateQuickReply: (quickReplyId: number, input: UpdateQuickReplyInput) => Promise<void>;
}

export const QuickReplyFormDialog = ({
  open,
  onOpenChange,
  editingQuickReply,
  onCreateQuickReply,
  onUpdateQuickReply,
}: QuickReplyFormDialogProps) => {
  const [title, setTitle] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!open) return;

    setTitle(editingQuickReply?.title ?? "");
    setShortcut(editingQuickReply?.shortcut ?? "");
    setCategory(editingQuickReply?.category ?? "");
    setContent(editingQuickReply?.content ?? "");
  }, [editingQuickReply, open]);

  const resetForm = () => {
    setTitle("");
    setShortcut("");
    setCategory("");
    setContent("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      title,
      shortcut,
      category,
      content,
    };

    if (editingQuickReply) {
      await onUpdateQuickReply(editingQuickReply.id, payload);
    } else {
      await onCreateQuickReply(payload);
    }

    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={CRM_DIALOG}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editingQuickReply ? "Editar respuesta rápida" : "Nueva respuesta rápida"}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <UiLabel htmlFor="quick-reply-title">Título</UiLabel>
              <Input
                id="quick-reply-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ej: saludo inicial"
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <UiLabel htmlFor="quick-reply-shortcut">Atajo (opcional)</UiLabel>
                <Input
                  id="quick-reply-shortcut"
                  value={shortcut}
                  onChange={(event) => setShortcut(event.target.value)}
                  placeholder="saludo"
                  className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
                />
              </div>
              <div className="space-y-2">
                <UiLabel htmlFor="quick-reply-category">Categoría (opcional)</UiLabel>
                <Input
                  id="quick-reply-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Atención"
                  className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
                />
              </div>
            </div>
            <div className="space-y-2">
              <UiLabel htmlFor="quick-reply-content">Contenido</UiLabel>
              <Textarea
                id="quick-reply-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Mensaje que se insertará en el chat..."
                className={`min-h-28 ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
              />
            </div>
          </div>
          <DialogFooter className="mt-5">
            <CrmButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </CrmButton>
            <CrmButton type="submit">
              {editingQuickReply ? "Guardar cambios" : "Crear respuesta"}
            </CrmButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
