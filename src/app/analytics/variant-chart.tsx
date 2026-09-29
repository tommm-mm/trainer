"use client";

import { useState } from "react";
import { StatChart } from "./charts";
import type { Variant } from "./model";
import { NumbersTable } from "./numbers-table";

/** One chart at a time with a chip per variant (e.g. per lift): one series, one colour, no clutter. */
export function VariantChart({ variants }: { variants: Variant[] }) {
  const [key, setKey] = useState(variants[0]?.key);
  const v = variants.find((x) => x.key === key) ?? variants[0];
  if (!v) return null;
  return (
    <div>
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {variants.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={x.key === v.key}
            onClick={() => setKey(x.key)}
            className={`h-8 shrink-0 rounded-full px-3 text-xs ${
              x.key === v.key ? "bg-neutral-200 font-medium text-neutral-950" : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {v.note && <p className="mb-1 text-xs text-neutral-300">{v.note}</p>}
      <StatChart {...v.chart} />
      {v.table && <NumbersTable table={v.table} partialNote={false} />}
    </div>
  );
}
