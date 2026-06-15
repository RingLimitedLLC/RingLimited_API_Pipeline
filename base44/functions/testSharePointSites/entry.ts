import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("share_point");

    // List all sites
    const sitesRes = await fetch("https://graph.microsoft.com/v1.0/sites?search=*", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const sitesData = await sitesRes.json();

    // Also get root site info
    const rootRes = await fetch("https://graph.microsoft.com/v1.0/sites/root", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const rootData = await rootRes.json();

    return Response.json({
      root: { id: rootData.id, name: rootData.displayName, url: rootData.webUrl },
      sites: (sitesData.value || []).map(s => ({ id: s.id, name: s.displayName, url: s.webUrl })),
      error: sitesData.error || null
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});