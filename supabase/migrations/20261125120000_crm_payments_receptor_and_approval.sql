-- Cuenta receptora normalizada y fecha de aprobación para la bandeja de pagos.

ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS receptor_bank text;

COMMENT ON COLUMN public.crm_payments.approved_at IS
  'Momento en que el comprobante quedó APROBADO. Nulo si no está aprobado.';
COMMENT ON COLUMN public.crm_payments.receptor_bank IS
  'Cuenta receptora normalizada. Venezuela y BDV se guardan, pero la bandeja no los ofrece como filtro.';

CREATE INDEX IF NOT EXISTS crm_payments_org_receptor_bank_idx
  ON public.crm_payments (organization_id, receptor_bank);

CREATE INDEX IF NOT EXISTS crm_payments_approved_at_idx
  ON public.crm_payments (approved_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.normalize_receptor_bank(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  candidate text;
  clean text;
  lowered text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;

  candidate := btrim(raw);

  IF candidate ~* '(?:->|=>|→|\mhacia\M|\mpara\M|\ma\M)\s+.+$' THEN
    candidate := btrim(substring(
      candidate
      FROM '(?:->|=>|→|\mhacia\M|\mpara\M|\ma\M)\s+(.+)$'
    ));
  ELSIF candidate ~* '(?:destino|receptor|destinatario|acreditado|cuenta[[:space:]]+destino)' THEN
    candidate := btrim(regexp_replace(
      candidate,
      '^.*(?:banco[[:space:]]+)?(?:destino|receptor|destinatario|acreditado[[:space:]]+(?:a|en)|cuenta[[:space:]]+destino)[[:space:]]*[:\-]?[[:space:]]*',
      '',
      'i'
    ));
  END IF;

  IF candidate IS NULL OR btrim(candidate) = '' THEN
    candidate := btrim(raw);
  END IF;

  clean := btrim(regexp_replace(
    regexp_replace(candidate, '[.,:;()_]', ' ', 'g'),
    '[[:space:]]+',
    ' ',
    'g'
  ));
  lowered := translate(lower(clean), 'áéíóúàèìòùüñ', 'aeiouaeiouun');

  IF lowered ~ '(banco de venezuela|\mvenezuela\M|\mbdv\M)' THEN
    RETURN 'Venezuela';
  END IF;
  IF lowered LIKE '%bancamiga%' OR lowered ~ '\mamiga\M' THEN
    RETURN 'Bancamiga';
  END IF;
  IF lowered LIKE '%banplus%' THEN
    RETURN 'Banplus';
  END IF;
  IF lowered LIKE '%binance%' OR lowered ~ '\musdt\M' THEN
    RETURN 'Binance';
  END IF;
  IF lowered LIKE '%tarjeta%'
     OR lowered LIKE '%debito%'
     OR lowered LIKE '%punto de venta%'
     OR lowered ~ '\mpos\M' THEN
    RETURN 'Tarjeta de Débito';
  END IF;
  IF lowered LIKE '%zelle%' THEN
    RETURN 'Zelle';
  END IF;
  IF lowered LIKE '%paypal%' THEN
    RETURN 'PayPal';
  END IF;
  IF lowered LIKE '%banesco%' THEN
    RETURN 'Banesco';
  END IF;
  IF lowered LIKE '%mercantil%' THEN
    RETURN 'Mercantil';
  END IF;
  IF lowered LIKE '%provincial%' OR lowered LIKE '%bbva%' THEN
    RETURN 'Provincial';
  END IF;

  IF char_length(clean) >= 2 THEN
    RETURN clean;
  END IF;

  RETURN NULL;
END;
$$;

UPDATE public.crm_payments
SET receptor_bank = public.normalize_receptor_bank(bank)
WHERE receptor_bank IS NULL
  AND bank IS NOT NULL
  AND btrim(bank) <> '';

UPDATE public.crm_payments
SET approved_at = updated_at
WHERE status = 'APROBADO'
  AND approved_at IS NULL
  AND updated_at IS NOT NULL;
