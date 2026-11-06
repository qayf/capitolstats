import { progressSteps, STAGE_LABELS, type Stage } from "@/lib/billStage";

// Six-step progress bar. Compact form hides the labels for use in table rows.
export function BillProgress({ stage, type, compact = false }: { stage: Stage; type: string; compact?: boolean }) {
  const steps = progressSteps(stage, type);
  const summary = `${STAGE_LABELS[stage]}. Steps: ${steps.map((s) => `${s.label} ${s.state}`).join(", ")}.`;
  return (
    <ol className={`progress ${compact ? "compact" : ""}`} aria-label={summary}>
      {steps.map((s) => (
        <li key={s.label} className={s.state} title={compact ? s.label : undefined}>
          {!compact && <span>{s.label}</span>}
        </li>
      ))}
    </ol>
  );
}
