import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("share_point");

    // Try to resolve the tenant root site — lightweight check
    const res = await fetch("https://graph.microsoft.com/v1.0/sites/root", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ healthy: false, error: `Graph API error (${res.status}): ${text}` });
    }

    const data = await res.json();
    return Response.json({
      healthy: true,
      tenant: data.siteCollection?.hostname || new URL(data.webUrl).hostname,
      site_name: data.displayName,
    });

  } catch (error) {
    return Response.json({ healthy: false, error: error.message }, { status: 500 });
  }
});