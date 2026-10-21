import {
  closeOrder,
  finalizeOrder,
  updateIssue,
} from "@/lib/wispro";
import {
  isLegacyWisproIssueId,
  isLegacyWisproOrderId,
} from "@/lib/wispro-rules";
import { getOrganizationIntegration } from "./organization-integrations";

const LOG_PREFIX = "[WISPRO_LEGACY_CLOSE]";

/**
 * Close Wispro issue/order only when the stored id is legacy.
 * New tickets use UUID issue ids and ord-{id} orders — those stay local.
 */
export const closeLegacyWisproTicket = async (input: {
  organizationId: string;
  wisproIssueId?: string | null;
  wisproOrderId?: string | null;
}): Promise<void> => {
  const issueId = String(input.wisproIssueId || "").trim();
  const orderId = String(input.wisproOrderId || "").trim();
  const shouldCloseIssue = isLegacyWisproIssueId(issueId);
  const shouldCloseOrder = isLegacyWisproOrderId(orderId);
  if (!shouldCloseIssue && !shouldCloseOrder) return;

  let override: { apiKey?: string; baseUrl?: string } | undefined;
  try {
    const integration = await getOrganizationIntegration(
      input.organizationId,
      "wispro",
    );
    override = {
      apiKey: integration.secret,
      baseUrl: String(
        integration.config.base_url || "https://www.cloud.wispro.co/api/v1",
      ),
    };
  } catch (error) {
    console.warn(`${LOG_PREFIX} skipped_no_credentials`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (shouldCloseIssue) {
    try {
      await updateIssue(issueId, { state: "closed" }, override);
    } catch (error) {
      console.warn(`${LOG_PREFIX} issue_close_failed`, {
        issueId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (shouldCloseOrder) {
    try {
      await finalizeOrder(orderId, {}, override);
    } catch (error) {
      console.warn(`${LOG_PREFIX} order_finalize_failed`, {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      await closeOrder(orderId, {}, override);
    } catch (error) {
      console.warn(`${LOG_PREFIX} order_close_failed`, {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
