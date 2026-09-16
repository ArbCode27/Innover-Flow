export const PAYMENT_SUCCESS_MONTH_TOKEN = "{{mes}}";
export const PAYMENT_SUCCESS_MESSAGE_MAX_LENGTH = 4096;

export const DEFAULT_PAYMENT_SUCCESS_MESSAGE = `Su pago fue recibido y verificado con éxito 👍🏻 y su servicio ha sido renovado para el mes de {{mes}}. Su comprobante será enviado vía correo electrónico.

Si todavía no formas parte de nuestra comunidad te invitamos a través del siguiente enlace. Allí compartimos información importante como reportes, promociones, caídas, o cualquier tema de su interés.

No es un grupo de WhatsApp, solo recibirá información.

El enlace para nuestro canal es:
https://whatsapp.com/channel/0029VbCSiefId7nGWlH4md3M

¡Gracias por preferirnos!
CONEXIONES INNOVER 🚀`;

const MONTH_FORMATTER = new Intl.DateTimeFormat("es-VE", {
  timeZone: "America/Caracas",
  month: "long",
});

const resolvePaymentMonth = (paymentDate: string | null | undefined) => {
  const dateOnly = String(paymentDate || "").slice(0, 10);
  const validDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateOnly);
  const targetDate = validDateOnly
    ? new Date(`${dateOnly}T12:00:00-04:00`)
    : new Date();

  return MONTH_FORMATTER.format(targetDate).toUpperCase();
};

export const buildPaymentSuccessMessage = (input: {
  template: string | null | undefined;
  paymentDate: string | null | undefined;
}) => {
  const month = resolvePaymentMonth(input.paymentDate);
  const baseTemplate = String(input.template || "").trim() || DEFAULT_PAYMENT_SUCCESS_MESSAGE;
  return baseTemplate.split(PAYMENT_SUCCESS_MONTH_TOKEN).join(month);
};
