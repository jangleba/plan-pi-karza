import { createBillingWebhookHandler } from "../_shared/billing/handler.ts";
import { billingDependencies } from "../_shared/billing/runtime.ts";
Deno.serve(createBillingWebhookHandler(billingDependencies()));
