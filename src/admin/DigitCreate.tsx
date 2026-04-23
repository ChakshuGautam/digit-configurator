import React from 'react';
import { CreateBase, useCreateContext, Form, useResourceContext, type TransformData, type RaRecord } from 'ra-core';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, RefreshCw } from 'lucide-react';
import { DigitCard } from '@/components/digit/DigitCard';
import { ActionBar } from '@/components/digit/ActionBar';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  useMutationError,
  MutationErrorBanner,
  type MutationErrorInfo,
} from './mutationError';

/** Pull a human-facing label off a just-created record for the toast copy. */
function pickRecordLabel(data: RaRecord | undefined): string {
  if (!data) return 'Record';
  const rec = data as unknown as Record<string, unknown>;
  for (const key of ['name', 'code', 'userName', 'id']) {
    const v = rec[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return 'Record';
}

/** Prettify a resource name for toast copy: 'boundary-hierarchies' → 'Boundary hierarchy'. */
function prettyResourceSingular(resource: string | undefined): string {
  if (!resource) return 'Record';
  const head = resource.replace(/-/g, ' ').replace(/s$/, '');
  return head.charAt(0).toUpperCase() + head.slice(1);
}

export interface DigitCreateProps {
  /** Page title */
  title?: string;
  /** Form fields (DigitFormInput components) */
  children: React.ReactNode;
  /** Resource name (optional, from ResourceContext by default) */
  resource?: string;
  /** Default values for the new record */
  record?: Record<string, unknown>;
  /** Where to redirect after successful creation (default: "list") */
  redirect?: 'list' | 'edit' | 'show' | false;
  /** Optional pre-submit transform (stamp server-required nested fields, etc.) */
  transform?: TransformData;
}

function DigitCreateContent({
  title,
  children,
  errorInfo,
  onDismissError,
}: {
  title?: string;
  children: React.ReactNode;
  errorInfo: MutationErrorInfo | null;
  onDismissError: () => void;
}) {
  const { saving, defaultTitle } = useCreateContext();
  const navigate = useNavigate();

  const displayTitle = title || defaultTitle || 'Create';

  const handleBack = () => {
    navigate(-1);
  };

  const handleCancel = () => {
    navigate(-1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <h1 className="text-2xl sm:text-3xl font-bold font-condensed text-foreground">
          {displayTitle}
        </h1>
        {saving && (
          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      <DigitCard className="max-w-none">
        <MutationErrorBanner info={errorInfo} onDismiss={onDismissError} />
        <Form>
          <div className="space-y-4">
            {children}
          </div>

          <ActionBar>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Create
            </Button>
          </ActionBar>
        </Form>
      </DigitCard>
    </div>
  );
}

export function DigitCreate({ title, children, resource, record, redirect = 'list', transform }: DigitCreateProps) {
  const { info, capture, clear } = useMutationError();
  const contextResource = useResourceContext();
  const effectiveResource = resource ?? contextResource;
  return (
    <CreateBase
      resource={resource}
      record={record}
      redirect={redirect}
      transform={transform}
      mutationOptions={{
        onError: (err) => capture(err),
        onSuccess: (data) => {
          clear();
          // Without a toast the page silently redirects to list — operators
          // have no way to tell a 200 apart from a quietly-swallowed 500
          // (closes egovernments/CCRS#436 second half).
          const label = pickRecordLabel(data);
          toast({
            title: `${prettyResourceSingular(effectiveResource)} created`,
            description: label !== 'Record' ? label : undefined,
          });
        },
      }}
    >
      <DigitCreateContent title={title} errorInfo={info} onDismissError={clear}>
        {children}
      </DigitCreateContent>
    </CreateBase>
  );
}
