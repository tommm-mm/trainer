import type { Table } from "./model";

// Plain markup (no hooks) so both the server Stats view and client
// components (lift chips) render the same "numbers" table.
export function NumbersTable({ table, open = false, partialNote = true }: { table: Table; open?: boolean; partialNote?: boolean }) {
  const body = (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-neutral-500">
          <tr>
            {table.headers.map((h) => (
              <th key={h} className="px-1 py-1 text-right font-normal first:text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-neutral-300">
          {table.rows.map((r, i) => (
            <tr key={i} className="border-t border-neutral-800">
              {r.map((c, j) => (
                <td key={j} className="px-1 py-1 text-right first:text-left">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {partialNote && table.rows.some((r) => r[0]?.endsWith("*")) && (
        <p className="mt-1 text-[11px] text-neutral-600">* week in progress</p>
      )}
    </div>
  );
  if (open) return body;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-neutral-500">Show numbers</summary>
      {body}
    </details>
  );
}
