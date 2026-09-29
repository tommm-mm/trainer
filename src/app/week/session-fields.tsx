import { SESSION_TYPES } from "@/lib/sessions";
import { inputCls, labelCls } from "@/components/ui";

export type TemplateOption = { id: string; name: string };

type Defaults = {
  session_type?: string;
  template_id?: string | null;
  target_distance_km?: number | null;
  target_sets?: number | null;
  notes?: string | null;
};

// Inputs shared by the "add session" and "edit session" forms.
export function SessionFields({
  defaults = {},
  templates = [],
}: {
  defaults?: Defaults;
  templates?: TemplateOption[];
}) {
  return (
    <>
      <label className={labelCls}>
        Session type
        <input
          name="session_type"
          list="session-types"
          required
          defaultValue={defaults.session_type ?? ""}
          placeholder="easy_run"
          className={inputCls}
        />
        <datalist id="session-types">
          {SESSION_TYPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </datalist>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelCls}>
          Target km
          <input
            name="target_distance_km"
            inputMode="decimal"
            defaultValue={defaults.target_distance_km ?? ""}
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          Target sets
          <input
            name="target_sets"
            inputMode="numeric"
            defaultValue={defaults.target_sets ?? ""}
            className={inputCls}
          />
        </label>
      </div>
      {templates.length > 0 && (
        <label className={labelCls}>
          Gym workout (optional)
          <select name="template_id" defaultValue={defaults.template_id ?? ""} className={inputCls}>
            <option value="">None</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={labelCls}>
        Notes
        <textarea
          name="notes"
          rows={2}
          defaultValue={defaults.notes ?? ""}
          className={inputCls}
        />
      </label>
    </>
  );
}
