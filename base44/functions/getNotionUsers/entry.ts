import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("notion");

    const res = await fetch("https://api.notion.com/v1/users", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
      },
    });

    const data = await res.json();

    // Only return real people (not bots)
    const people = (data.results || [])
      .filter(u => u.type === "person" && u.name)
      .map(u => u.name);

    return Response.json({ users: people });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});