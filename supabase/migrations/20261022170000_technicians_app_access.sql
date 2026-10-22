-- Acceso de técnicos/supervisores a la app móvil + documento único por org.

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS app_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.technicians.app_enabled IS
  'Si false, el técnico no puede iniciar sesión en la app aunque exista en el catálogo.';

-- Índice para búsqueda por dígitos de cédula/documento (login app).
CREATE INDEX IF NOT EXISTS technicians_org_document_digits_idx
  ON public.technicians (
    organization_id,
    regexp_replace(coalesce(document, ''), '[^0-9]', '', 'g')
  )
  WHERE document IS NOT NULL
    AND regexp_replace(coalesce(document, ''), '[^0-9]', '', 'g') <> '';

-- Un documento (dígitos) por organización cuando hay documento.
CREATE UNIQUE INDEX IF NOT EXISTS technicians_org_document_digits_uidx
  ON public.technicians (
    organization_id,
    regexp_replace(coalesce(document, ''), '[^0-9]', '', 'g')
  )
  WHERE document IS NOT NULL
    AND regexp_replace(coalesce(document, ''), '[^0-9]', '', 'g') <> '';
