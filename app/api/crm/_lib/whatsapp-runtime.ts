import { AsyncLocalStorage } from "async_hooks";
import { getOrganizationIntegration } from "./organization-integrations";

type WhatsappRuntimeConfig = {
  accessToken: string;
  phoneNumberId: string;
};

const whatsappStorage = new AsyncLocalStorage<WhatsappRuntimeConfig>();

export const withOrganizationWhatsapp = async <T>(
  organizationId: string,
  callback: () => Promise<T>,
) => {
  const integration = await getOrganizationIntegration(
    organizationId,
    "whatsapp",
  );
  const phoneNumberId = String(integration.config.phone_number_id || "").trim();
  if (!phoneNumberId) {
    throw new Error("WhatsApp no tiene un Phone Number ID configurado");
  }
  return whatsappStorage.run(
    { accessToken: integration.secret, phoneNumberId },
    callback,
  );
};

export const getWhatsappRuntimeConfig = (): WhatsappRuntimeConfig => {
  const organizationConfig = whatsappStorage.getStore();
  if (organizationConfig) return organizationConfig;

  const accessToken = process.env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp Business no está configurado");
  }
  return { accessToken, phoneNumberId };
};
