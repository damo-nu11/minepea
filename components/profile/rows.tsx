/**
 * Identity/portfolio row primitives shared by the ProfilePanel drawer and
 * the /profile page (extracted from the panel, Convention 5).
 */

import { PeaIcon } from "@/components/icons";

export function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-10 items-center gap-4">
      <span className="shrink-0 text-[15px] text-fg-muted">{label}</span>
      {/* The value slot owns the remaining width and is allowed to shrink.
          Without this the label was shrink-0 and the value sized to its
          own content, so anything with a fixed width inside it simply hung
          past the row (the username editor did, by 29px in the 272px
          /profile card). Rows read the same as before — the value still
          sits hard right — but a value can no longer escape its row. */}
      <span className="flex min-w-0 flex-1 items-center justify-end">
        {children}
      </span>
    </div>
  );
}

export function PeaRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <Row label={label}>
      <span className="flex items-center gap-2">
        <PeaIcon size={15} className="text-accent" />
        <span
          className={`tnum text-[15px] text-fg ${strong ? "font-bold" : "font-semibold"}`}
        >
          {value}
        </span>
      </span>
    </Row>
  );
}
