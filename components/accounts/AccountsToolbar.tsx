"use client";

import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { AddAccountForm } from "@/components/accounts/AddAccountForm";
import { ImportFollowing } from "@/components/accounts/ImportFollowing";
import type { BulkAddState } from "@/app/dashboard/accounts/actions";
import { useDict } from "@/lib/i18n/I18nProvider";

type ActionState = { error?: string };
type Group = { id: string; name: string };

type AccountsToolbarProps = {
  groups: Group[];
  addAction: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  bulkAddAction: (prevState: BulkAddState, formData: FormData) => Promise<BulkAddState>;
};

export function AccountsToolbar({ groups, addAction, bulkAddAction }: AccountsToolbarProps) {
  const dict = useDict().accounts;
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button type="button" data-tour="add-account">
            <Plus className="h-4 w-4" />
            {dict.addForm.addButton}
          </Button>
        </DialogTrigger>
        <DialogContent title={dict.addForm.addButton}>
          <AddAccountForm action={addAction} groups={groups} onAdded={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" data-tour="import-following">
            <Users className="h-4 w-4" />
            {dict.import.toggleLabel}
          </Button>
        </DialogTrigger>
        <DialogContent title={dict.import.toggleLabel} description={dict.import.toggleHint}>
          <ImportFollowing
            groups={groups}
            bulkAddAction={bulkAddAction}
            onImported={() => setImportOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
