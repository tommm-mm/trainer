import { btnDanger, btnPrimary, btnSmall, cardCls } from "@/components/ui";
import { ActionButton } from "@/app/goal/goal-forms";
import { answerQuestion, approveProposal, rejectProposal } from "@/app/coach/actions";
import { SOURCE_LABELS } from "@/lib/coach/proposals";
import type { InboxItem } from "@/lib/coach/queries";
import type { Question } from "@/lib/gym/questions";

// Changes your coach wants to make (to the week or to your gym templates) and
// the app's own questions. Nothing changes until you tap Approve / Yes.

export function CoachInbox({ items, questions }: { items: InboxItem[]; questions: Question[] }) {
  if (items.length === 0 && questions.length === 0) return null;
  return (
    <section className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-wide text-amber-300">
            Proposed changes · {items.length}
          </p>
          {items.map((it) => (
            <div key={it.id} className="flex flex-col gap-1.5 border-t border-amber-500/20 pt-3 first:border-0 first:pt-0">
              <p className="font-medium">{it.title}</p>
              {it.error ? (
                <p className="text-xs text-red-300">{it.error}</p>
              ) : (
                <p className="whitespace-pre-line text-sm text-neutral-300">
                  {it.before && <span className="text-neutral-500 line-through decoration-neutral-600">{it.before}</span>}
                  {it.before && <span className="text-neutral-500"> → </span>}
                  {it.after}
                </p>
              )}
              {it.rationale && <p className="text-xs text-neutral-400">{it.rationale}</p>}
              <p className="text-[11px] text-neutral-500">from {SOURCE_LABELS[it.source] ?? it.source}</p>
              <div className="flex gap-2">
                {!it.error && (
                  <ActionButton action={approveProposal.bind(null, it.id)} className={btnPrimary}>
                    Approve
                  </ActionButton>
                )}
                <ActionButton action={rejectProposal.bind(null, it.id)} className={btnDanger}>
                  Reject
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {questions.length > 0 && (
        <div className={`flex flex-col gap-3 ${items.length ? `${cardCls} border-sky-500/30` : ""}`}>
          <p className="text-xs uppercase tracking-wide text-sky-300">Gym questions</p>
          {questions.map((q) => (
            <div key={q.key} className="flex flex-col gap-1.5">
              <p className="font-medium">{q.title}</p>
              <p className="text-xs text-neutral-400">{q.rationale}</p>
              <div className="flex gap-2">
                <ActionButton action={answerQuestion.bind(null, q, true)} className={btnSmall}>
                  Yes, change it
                </ActionButton>
                <ActionButton action={answerQuestion.bind(null, q, false)} className={btnSmall}>
                  No
                </ActionButton>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-neutral-500">A &quot;No&quot; isn&apos;t asked again for 4 weeks.</p>
        </div>
      )}
    </section>
  );
}
