"use client";
// Small pickers shared by the new-trip chat and the Edit trip dialog, so they look and behave the
// same in each place: who's travelling (adults/children), how (flight/train/road), and what they eat.
import { Bus, Minus, Plane, Plus, TrainFront, type LucideIcon } from "lucide-react";
import type { TransportMode } from "@/lib/schemas";
import { TRANSPORT_LABELS } from "@/lib/travelers";
import { DIET_BASES, DIET_NEEDS, allowedChoices, type Diet, type DietBase } from "@/lib/diet";
import { inputClass } from "@/components/ui/button";

// ---------- Who's travelling ----------

export type Travelers = { adults: number; children: number };

export function TravelerPicker({ value, onChange }: { value: Travelers; onChange: (value: Travelers) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Counter
        label="Adults"
        hint="13 and older"
        value={value.adults}
        min={1}
        onChange={(adults) => onChange({ ...value, adults })}
      />
      <Counter
        label="Children"
        hint="Under 13"
        value={value.children}
        min={0}
        onChange={(children) => onChange({ ...value, children })}
      />
    </div>
  );
}

// A "− 2 +" stepper. Buttons are easier than typing a number, especially on phones.
function Counter({
  label,
  hint,
  value,
  min,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  const max = 10;
  const stepButton =
    "flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-sand-300 text-ink-soft " +
    "transition hover:border-clay-500 hover:text-clay-700 disabled:cursor-not-allowed disabled:opacity-30";
  return (
    <div className="flex items-center justify-between rounded-2xl border border-sand-200 bg-surface px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-ink-faint">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`Fewer ${label.toLowerCase()}`}
          className={stepButton}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-5 text-center font-semibold tabular-nums" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`More ${label.toLowerCase()}`}
          className={stepButton}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------- How they want to travel ----------

const TRANSPORT_ICONS: Record<TransportMode, LucideIcon> = { flight: Plane, train: TrainFront, road: Bus };

// Pick any number of modes. None picked means "no preference".
export function TransportPicker({
  value,
  onChange,
}: {
  value: TransportMode[];
  onChange: (value: TransportMode[]) => void;
}) {
  function toggle(mode: TransportMode) {
    onChange(value.includes(mode) ? value.filter((m) => m !== mode) : [...value, mode]);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {(Object.keys(TRANSPORT_ICONS) as TransportMode[]).map((mode) => {
        const Icon = TRANSPORT_ICONS[mode];
        const selected = value.includes(mode);
        return (
          <button
            key={mode}
            type="button"
            onClick={() => toggle(mode)}
            aria-pressed={selected}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 ${
              selected
                ? "border-clay-600 bg-clay-600 text-white shadow-md"
                : "border-sand-200 bg-surface text-ink-soft hover:border-clay-500 hover:text-clay-700"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            {TRANSPORT_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}

// ---------- What they eat ----------

// A small round toggle button, ticked = sage.
function Toggle({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition ${
        selected
          ? "border-clay-600 bg-clay-600 text-white"
          : "border-sand-300 bg-surface text-ink-soft hover:border-clay-500 hover:text-clay-700"
      }`}
    >
      {label}
    </button>
  );
}

// 1. What they eat (one choice). 2. Vegetarian or "only some things": which foods are OK.
// 3. Any other needs (several), plus a box for anything else.
export function DietPicker({ value, onChange }: { value: Diet; onChange: (value: Diet) => void }) {
  const toggleIn = (list: string[], item: string) =>
    list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
  const choices = allowedChoices(value.base);
  const sectionLabel = "text-xs font-medium uppercase tracking-wider text-ink-faint";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {DIET_BASES.map((base) => (
          <Toggle
            key={base.value}
            label={base.label}
            selected={value.base === base.value}
            // A new choice starts with nothing ticked in step 2 (eggs for vegans makes no sense).
            onClick={() => onChange({ ...value, base: base.value as DietBase, allowed: [] })}
          />
        ))}
      </div>

      {choices.length > 0 && (
        <div className="space-y-2">
          <p className={sectionLabel}>{value.base === "some" ? "Which of these do you eat?" : "Are eggs OK?"}</p>
          <div className="flex flex-wrap gap-2">
            {choices.map((food) => (
              <Toggle
                key={food}
                label={food}
                selected={value.allowed.includes(food)}
                onClick={() => onChange({ ...value, allowed: toggleIn(value.allowed, food) })}
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className={sectionLabel}>Anything else?</p>
        <div className="flex flex-wrap gap-2">
          {DIET_NEEDS.map((need) => (
            <Toggle
              key={need}
              label={need}
              selected={value.needs.includes(need)}
              onClick={() => onChange({ ...value, needs: toggleIn(value.needs, need) })}
            />
          ))}
        </div>
        <input
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          maxLength={150}
          placeholder="Other needs or allergies, e.g. no mushrooms"
          className={inputClass}
        />
      </div>
    </div>
  );
}
