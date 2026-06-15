import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function sanitizePathSegment(name) {
  return (name || "").replace(/[\\/:*?"<>|#%]/g, "_").trim();
}

const RING_DIGITAL_SITE_ID = "ringlimited.sharepoint.com,3a74755f-fec3-4822-b35b-7322a8c940ea,9fb7a2c4-2427-44d5-989e-f639534cafd3";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("share_point");

    const clientName = "Long Home";
    const campaignName = "20251219 Lead Lift and Lead Renew";
    const filename = "test_blank.csv";

    const safeClient = sanitizePathSegment(clientName);
    const safeCampaign = sanitizePathSegment(campaignName);
    const fullPath = `Ring Clients/Current Clients/${safeClient}/${safeCampaign}/Data/Original/${filename}`;
    const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${RING_DIGITAL_SITE_ID}/drive/root:/${fullPath}:/content`;

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "text/csv",
      },
      body: "",
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`SharePoint upload failed (${uploadRes.status}): ${errText}`);
    }

    const result = await uploadRes.json();

    return Response.json({
      success: true,
      path: fullPath,
      sharepoint_url: result.webUrl,
      file_name: result.name,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});