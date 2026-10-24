-- Expand payment methods: keep pago_movil + transferencia, add zelle/binance/paypal.
-- Remove legacy deposito / deposito_usd rows and widen destination columns.

DELETE FROM public.organization_payment_methods
WHERE method_key IN ('deposito', 'deposito_usd');

ALTER TABLE public.organization_payment_methods
  DROP CONSTRAINT IF EXISTS organization_payment_methods_method_key_check;

ALTER TABLE public.organization_payment_methods
  ADD CONSTRAINT organization_payment_methods_method_key_check
  CHECK (
    method_key IN (
      'pago_movil',
      'transferencia',
      'zelle',
      'binance',
      'paypal'
    )
  );

ALTER TABLE public.organization_payment_methods
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS binance_pay_id text,
  ADD COLUMN IF NOT EXISTS binance_uid text,
  ADD COLUMN IF NOT EXISTS wallet_address text,
  ADD COLUMN IF NOT EXISTS crypto_network text;

COMMENT ON COLUMN public.organization_payment_methods.email IS
  'Correo de contacto (Zelle / Binance / PayPal).';
COMMENT ON COLUMN public.organization_payment_methods.link_url IS
  'Enlace público (ej. PayPal.Me).';
COMMENT ON COLUMN public.organization_payment_methods.binance_pay_id IS
  'Binance Pay ID.';
COMMENT ON COLUMN public.organization_payment_methods.binance_uid IS
  'Binance User ID (UID).';
COMMENT ON COLUMN public.organization_payment_methods.wallet_address IS
  'Dirección de billetera crypto.';
COMMENT ON COLUMN public.organization_payment_methods.crypto_network IS
  'Red blockchain (TRC20, BEP20, Polygon, etc.).';
