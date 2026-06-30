import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Copy, Check, Globe, Key, ShieldCheck, FolderOpen, AlertTriangle } from "lucide-react";
import SharePointFolderPicker from "@/components/client/SharePointFolderPicker";
import { toast } from "sonner";

export default function WebhookEndpointCard({ connection, onUpdate }) {
  const [copied, setCopied] = useState(null);
  const [savingFolder, setSavingFolder] = useState(false);

  const isHmac = connection.connection_type === "webhook_only";

  // Derive the webhook URL from the current origin so it works in both
  // dev (localhost:5174) and production (pipeline.ring.digital).
  const webhookUrl = `${window.location.origin}/webhooks/${connection.id}`;

  const copy = async (text, label) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleFolderChange = async (folder) => {
    setSavingFolder(true);
    try {
      await base44.entities.Connections.update(connection.id, {
        sharepoint_folder_id: folder?.id || "",
        sharepoint_folder_path: folder?.path || folder?.name || "",
      });
      toast.success("SharePoint output folder saved");
      onUpdate?.();
    } catch (err) {
      toast.error(`Failed to save folder: ${err.message}`);
    } finally {
      setSavingFolder(false);
    }
  };

  const buildInstructions = () => {
    const authBlock = isHmac
      ? `x-signature: sha256=<HMAC-SHA256 of raw request body computed with the webhook secret>
Content-Type: application/json`
      : `Authorization: Bearer <api_key>
Content-Type: application/json`;

    return `=== Inbound Webhook — Integration Instructions ===
Client: ${connection.client_name || ""}
Connection: ${connection.platform_label || connection.connection_type}

ENDPOINT
POST ${webhookUrl}

AUTHENTICATION
${authBlock}

REQUEST BODY
Send a JSON object or array of objects:

  Single record:
  { "field1": "value1", "field2": "value2" }

  Batch:
  [
    { "field1": "value1", "field2": "value2" },
    { "field1": "value3", "field2": "value4" }
  ]

SUCCESS RESPONSE (200)
  { "received": true, "records": N, "status": "Success" }

ERROR RESPONSES
  401  — missing or invalid ${isHmac ? "signature" : "API key"}
  400  — invalid JSON
  404  — connection not found
  500  — internal error (check credentials are configured)

For questions, contact your DataOps representative.`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" />
          Webhook Endpoint
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => copy(buildInstructions(), "instructions")}
        >
          {copied === "instructions"
            ? <Check className="h-3 w-3 text-emerald-500" />
            : <Copy className="h-3 w-3" />}
          {copied === "instructions" ? "Copied!" : "Copy Instructions"}
        </Button>
      </div>

      {/* URL */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-slate-500">Client POSTs data to:</p>
        <div className="flex items-center gap-2">
          <code className="text-xs bg-slate-50 border border-slate-200 rounded px-3 py-2 flex-1 font-mono text-slate-700 break-all select-all">
            {webhookUrl}
          </code>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => copy(webhookUrl, "url")}
            title="Copy URL"
          >
            {copied === "url"
              ? <Check className="h-3.5 w-3.5 text-emerald-500" />
              : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Auth method explanation */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 flex items-start gap-2.5">
        {isHmac
          ? <ShieldCheck className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
          : <Key className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />}
        <div className="text-xs text-slate-600 space-y-1.5">
          <p className="font-medium text-slate-700">
            {isHmac ? "HMAC-SHA256 Signature" : "Bearer Token (API Key)"}
          </p>
          {isHmac ? (
            <>
              <p>Client computes <code className="font-mono bg-white border rounded px-1">HMAC-SHA256(raw_body, webhook_secret)</code> and sends it as:</p>
              <code className="block font-mono bg-white border border-slate-200 rounded px-2 py-1 text-slate-700">
                x-signature: sha256={"<hex_digest>"}
              </code>
              <p className="text-slate-400 text-[11px]">Also accepted: <code className="font-mono">x-hub-signature-256</code> (GitHub-compatible format)</p>
            </>
          ) : (
            <>
              <p>Client sends the API key as:</p>
              <code className="block font-mono bg-white border border-slate-200 rounded px-2 py-1 text-slate-700">
                Authorization: Bearer {"<api_key>"}
              </code>
            </>
          )}
          <p className="text-slate-400 text-[11px]">
            {isHmac ? "Set the webhook_secret" : "Set the inbound_api_key"} in the Credentials section below, then share it with the client.
          </p>
        </div>
      </div>

      {/* SharePoint output folder */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5" />
          SharePoint Output Folder
        </p>
        <p className="text-xs text-slate-400">
          Each push from this client will be written as a CSV to this folder immediately on receipt.
        </p>
        <SharePointFolderPicker
          value={
            connection.sharepoint_folder_id
              ? { id: connection.sharepoint_folder_id, path: connection.sharepoint_folder_path }
              : null
          }
          onChange={handleFolderChange}
        />
        {!connection.sharepoint_folder_id && (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            No folder selected — pushes will be received and logged but not forwarded to SharePoint.
          </div>
        )}
      </div>
    </div>
  );
}
