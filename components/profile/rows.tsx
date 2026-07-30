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
    <div className="flex h-10 items-center justify-between gap-4">
      <span className="shrink-0 text-[15px] text-fg-muted">{label}</span>
      {children}
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
