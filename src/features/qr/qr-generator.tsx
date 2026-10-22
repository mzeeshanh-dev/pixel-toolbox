"use client";

import { useState } from "react";
import { Library, PencilRuler } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { QrCodeRecord, QrVersionRecord } from "@/lib/db";
import { useLibraryQuery } from "./hooks";
import { QrLibrary } from "./library/qr-library";
import { QrEditor, type EditingTarget, type EditorDraft, type Notice } from "./qr-editor";
import { defaultStyle, isHttpUrl, pickStyle } from "./lib/validation";

const emptyDraft: EditorDraft = {
  mode: "single",
  contentMode: "url",
  content: "",
  name: "",
  batchText: "",
  style: defaultStyle,
  folderId: null,
};

export function QrGenerator() {
  const [tab, setTab] = useState<"create" | "library">("create");
  const [draft, setDraftState] = useState<EditorDraft>(emptyDraft);
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const count = useLibraryQuery((db) => db.qrCodes.count(), []);

  const setDraft = (update: (draft: EditorDraft) => EditorDraft) => setDraftState(update);

  const startEditing = (code: QrCodeRecord, version: QrVersionRecord) => {
    setDraftState({
      mode: "single",
      contentMode: isHttpUrl(version.content) ? "url" : "text",
      content: version.content,
      name: code.name,
      batchText: "",
      style: pickStyle(version),
      folderId: code.folderId,
    });
    setEditing({ id: code.id, name: code.name, versionNumber: version.versionNumber });
    setNotice(null);
    setTab("create");
  };

  const stopEditing = () => {
    setEditing(null);
    setDraftState(emptyDraft);
    setNotice(null);
  };

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="gap-5">
      <TabsList className="h-11 w-full rounded-xl p-1 sm:w-auto">
        <TabsTrigger value="create" className="h-9 flex-1 rounded-lg px-4 sm:flex-none">
          <PencilRuler aria-hidden /> {editing ? "Edit" : "Create"}
        </TabsTrigger>
        <TabsTrigger value="library" className="h-9 flex-1 rounded-lg px-4 sm:flex-none">
          <Library aria-hidden /> Library
          {count?.data !== undefined && count.data !== null && (
            <span className="rounded-full bg-muted px-1.5 text-xs tabular text-muted-foreground">{count.data}</span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="create" forceMount className="data-[state=inactive]:hidden">
        <QrEditor
          draft={draft}
          setDraft={setDraft}
          editing={editing}
          onStopEditing={stopEditing}
          onSaved={(target) => setEditing(target)}
          notice={notice}
          setNotice={setNotice}
        />
      </TabsContent>
      <TabsContent value="library">
        <QrLibrary
          onEdit={startEditing}
          onCreateNew={(folderId) => {
            stopEditing();
            setDraftState({ ...emptyDraft, folderId });
            setTab("create");
          }}
        />
      </TabsContent>
    </Tabs>
  );
}
