import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import CollapsibleCard from "@/components/ui/CollapsibleCard";

export default function TeamAssignment({ client, onUpdate }) {
  const [accounts, setAccounts] = useState(client.accounts_rep || "");
  const [adops, setAdops] = useState(client.adops_rep || "");
  const [dataops, setDataops] = useState(client.dataops_rep || "");
  const [saving, setSaving] = useState(false);
  const [notionUsers, setNotionUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const fetchNotionUsers = async () => {
    setLoadingUsers(true);
    const res = await base44.functions.invoke("getNotionUsers", {});
    setNotionUsers(res.data.users || []);
    setLoadingUsers(false);
  };

  useEffect(() => {
    fetchNotionUsers();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Clients.update(client.id, {
      accounts_rep: accounts,
      adops_rep: adops,
      dataops_rep: dataops,
    });
    toast.success("Team assignment saved");
    onUpdate();
    setSaving(false);
  };

  const UserSelect = ({ value, onChange, placeholder }) => (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={loadingUsers ? "Loading…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {notionUsers.length === 0 && !loadingUsers && (
          <div className="px-3 py-2 text-xs text-slate-400">No users found in Notion</div>
        )}
        {notionUsers.map(name => (
          <SelectItem key={name} value={name}>{name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <CollapsibleCard title="Team Assignment" icon={Users} defaultOpen={false}>
      <CardContent className="pt-5">
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={fetchNotionUsers}
            disabled={loadingUsers}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${loadingUsers ? "animate-spin" : ""}`} />
            Refresh from Notion
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">Accounts Rep</Label>
            <UserSelect value={accounts} onChange={setAccounts} placeholder="Select accounts rep…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">AdOps Rep</Label>
            <UserSelect value={adops} onChange={setAdops} placeholder="Select AdOps rep…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">DataOps Rep</Label>
            <UserSelect value={dataops} onChange={setDataops} placeholder="Select DataOps rep…" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-4">
        <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Assignment
        </Button>
      </CardFooter>
    </CollapsibleCard>
  );
}