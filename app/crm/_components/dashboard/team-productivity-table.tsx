"use client";

import { useMemo, useState } from "react";
import { Building2, HardHat, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Role, TeamRow } from "@/lib/scoring";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { AvatarInitials } from "../shared/avatar-initials";
import { renderRoleMetricCells } from "./team-row-cells";

type RoleFilter = "all" | Role;

const RoleBadge = ({ role }: { role: Role }) =>
  role === "office" ? (
    <Badge
      variant="outline"
      className="border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400">
      Oficina
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400">
      Campo
    </Badge>
  );

export const TeamProductivityTable = ({
  team,
  isLoading = false,
}: {
  team: TeamRow[];
  isLoading?: boolean;
}) => {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const officeCount = team.filter((row) => row.role === "office").length;
  const fieldCount = team.filter((row) => row.role === "field").length;

  const filtered = useMemo(() => {
    if (roleFilter === "all") return team;
    return team.filter((row) => row.role === roleFilter);
  }, [roleFilter, team]);

  return (
    <Card className={`mt-5 rounded-2xl border-0 ${CRM_SURFACES.elevated}`}>
      <CardHeader className="flex flex-col gap-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">
            Productividad y Rendimiento del Equipo
          </CardTitle>
          <p className={`mt-0.5 text-xs ${CRM_SURFACES.textMuted}`}>
            Ranking por rol: oficina y campo usan escalas distintas
          </p>
        </div>
        <Tabs
          value={roleFilter}
          onValueChange={(value) => setRoleFilter(value as RoleFilter)}
          className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-3 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.05] sm:inline-flex sm:w-auto">
            <TabsTrigger
              value="all"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-crm-accent data-[state=active]:shadow-sm dark:data-[state=active]:bg-white/10">
              <Users className="size-3.5" />
              Todos ({team.length})
            </TabsTrigger>
            <TabsTrigger
              value="office"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-blue-400">
              <Building2 className="size-3.5" />
              Oficina ({officeCount})
            </TabsTrigger>
            <TabsTrigger
              value="field"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow-sm dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-amber-400">
              <HardHat className="size-3.5" />
              Campo ({fieldCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 sm:p-4 sm:pt-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium text-foreground">
              No hay personas en este filtro
            </p>
            <p className="text-xs text-muted-foreground">
              Los agentes de oficina salen de asesores activos; los de campo, de técnicos.
            </p>
          </div>
        ) : (
          <Table className="min-w-[760px] text-xs sm:text-sm">
            <TableHeader className={CRM_SURFACES.textMuted}>
              <TableRow className="border-b border-black/5 hover:bg-transparent dark:border-white/10">
                <TableHead className="pb-3 pl-4 font-medium">Asesor</TableHead>
                <TableHead className="pb-3 font-medium">Rol</TableHead>
                <TableHead className="pb-3 font-medium">Gestión de Entrada</TableHead>
                <TableHead className="pb-3 font-medium">Gestión de Salida</TableHead>
                <TableHead className="pb-3 font-medium">Calidad / Tiempos</TableHead>
                <TableHead className="pb-3 text-center font-medium">Score (Ranking)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-black/5 dark:divide-white/5">
              {filtered.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-b border-black/5 transition-colors hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.02]">
                  <TableCell className="py-3 pl-4">
                    <div className="flex items-center gap-2.5">
                      <AvatarInitials name={row.name} size="sm" />
                      <div>
                        <span className={`block font-medium ${CRM_SURFACES.textPrimary}`}>
                          {row.name}
                        </span>
                        <span className={`block text-[11px] ${CRM_SURFACES.textMuted}`}>
                          {row.role === "office"
                            ? row.status === "online"
                              ? "Disponible"
                              : row.status === "busy"
                                ? "Ocupado"
                                : "Desconectado"
                            : "Técnico de campo"}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <RoleBadge role={row.role} />
                  </TableCell>
                  {renderRoleMetricCells(row)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
