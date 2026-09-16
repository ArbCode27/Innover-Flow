"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CRM_FOCUS_RING, CRM_SURFACES } from "../../_lib/crm-theme";
import type { Label } from "../../_lib/types";

interface ConversationLabelFilterProps {
  labels: Label[];
  selectedLabelId: number | null;
  onLabelChange: (value: number | null) => void;
}

export const ConversationLabelFilter = ({
  labels,
  selectedLabelId,
  onLabelChange,
}: ConversationLabelFilterProps) => {
  const [isLabelMenuOpen, setIsLabelMenuOpen] = useState(false);
  const selectedLabel = useMemo(
    () => labels.find((label) => label.id === selectedLabelId) || null,
    [labels, selectedLabelId],
  );

  return (
    <Popover open={isLabelMenuOpen} onOpenChange={setIsLabelMenuOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filtrar por etiqueta"
          className={cn(
            CRM_FOCUS_RING,
            "inline-flex h-9 w-full items-center justify-between rounded-2xl border px-3 text-sm font-medium transition",
            "border-slate-700/70 bg-[#111827] text-slate-100 hover:border-slate-500/80",
          )}>
          <span className="truncate">
            {selectedLabel
              ? `Etiqueta: ${selectedLabel.name}`
              : "Todas las etiquetas"}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-slate-400"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className={`w-[min(22rem,calc(100vw-2rem))] border p-0 ${CRM_SURFACES.border} ${CRM_SURFACES.elevated} ${CRM_SURFACES.textPrimary}`}>
        <Command>
          <CommandInput placeholder="Buscar etiqueta..." />
          <CommandList>
            <CommandEmpty>Sin coincidencias</CommandEmpty>
            <CommandGroup heading="Etiquetas">
              <CommandItem
                value="todas"
                className="data-[selected=true]:bg-crm-accent/25 data-[selected=true]:text-crm-accent-foreground"
                onSelect={() => {
                  onLabelChange(null);
                  setIsLabelMenuOpen(false);
                }}>
                <Check
                  className={cn(
                    "size-4",
                    selectedLabelId === null ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
                Todas las etiquetas
              </CommandItem>
              {labels.map((label) => (
                <CommandItem
                  key={label.id}
                  value={label.name}
                  className="data-[selected=true]:bg-crm-accent/25 data-[selected=true]:text-crm-accent-foreground"
                  onSelect={() => {
                    onLabelChange(label.id);
                    setIsLabelMenuOpen(false);
                  }}>
                  <Check
                    className={cn(
                      "size-4",
                      selectedLabelId === label.id ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                    aria-hidden="true"
                  />
                  {label.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
