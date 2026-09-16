import type { SupabaseClient } from "@supabase/supabase-js";

const LOG_PREFIX = "[AI_AGENT]";

export const auditToolInvocation = async (
  supabase: SupabaseClient,
  input: {
    conversationId: number;
    runId: string;
    toolName: string;
    args: unknown;
    result: unknown;
    ok: boolean;
    durationMs: number;
    error?: string | null;
  },
) => {
  try {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("organization_id")
      .eq("id", input.conversationId)
      .maybeSingle();
    const organizationId = String(
      conversation?.organization_id || "",
    ).trim();
    if (!organizationId) {
      console.warn(`${LOG_PREFIX} audit_skipped_missing_organization`, {
        conversationId: input.conversationId,
        toolName: input.toolName,
      });
      return;
    }

    const { error } = await supabase.from("ai_tool_invocations").insert({
      organization_id: organizationId,
      conversation_id: input.conversationId,
      run_id: input.runId,
      tool_name: input.toolName,
      args: input.args ?? {},
      result: input.result ?? {},
      ok: input.ok,
      duration_ms: input.durationMs,
      error: input.error ?? null,
    });

    if (error) {
      // Table may not exist yet; never block the agent.
      console.warn(`${LOG_PREFIX} insert_failed`, {
        conversationId: input.conversationId,
        toolName: input.toolName,
        message: error.message,
      });
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} unexpected_error`, {
      conversationId: input.conversationId,
      toolName: input.toolName,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
};
