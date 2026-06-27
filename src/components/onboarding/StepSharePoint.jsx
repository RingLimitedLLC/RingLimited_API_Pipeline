import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, FolderOpen } from "lucide-react";
import SharePointFolderPicker from "@/components/client/SharePointFolderPicker";

export default function StepSharePoint({ form, update, onNext, onBack }) {
  const selected = form.sharepoint_folder;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[#afd741]">
          <FolderOpen className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">SharePoint Delivery</h2>
          <p className="text-sm text-slate-500">
            Browse and select the folder where synced data will be delivered
          </p>
        </div>
      </div>

      <SharePointFolderPicker
        value={selected}
        onChange={(folder) => update({ sharepoint_folder: folder })}
      />

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="text-slate-500">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onNext} className="text-slate-600">
            Skip
          </Button>
          <Button
            onClick={onNext}
            disabled={!selected}
            style={{ backgroundColor: "#afd741" }}
            className="text-white"
          >
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
