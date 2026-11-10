import { ChevronDown } from "lucide-react";
import type { Option } from "@/lib/filter-options";

type Props = { label: string; value: string; onChange: (value: string) => void; options: readonly Option[] };

export function FilterSelect({ label, value, onChange, options }: Props) {
  return (
    <label className={`filter-select ${value ? "has-value" : ""}`}>
      <select aria-label={`${label} 필터`} value={value} onChange={event => onChange(event.target.value)}>
        <option value="">{label} 전체</option>
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
      <ChevronDown size={13} />
    </label>
  );
}
