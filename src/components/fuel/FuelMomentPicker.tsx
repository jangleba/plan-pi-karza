import type { FuelMoment } from "@/lib/fuel/assistant";
import { ChoiceGroup } from "@/components/ui/app-ui";

export function FuelMomentPicker({
  value,
  onChange,
}: {
  value: FuelMoment;
  onChange: (value: FuelMoment) => void;
}) {
  return (
    <ChoiceGroup
      className="fuel-moment"
      label="Moment posiłku"
      value={value}
      onChange={onChange}
      options={[
        { value: "before", label: "Przed" },
        { value: "after", label: "Po" },
        { value: "ordinary", label: "Zwykły posiłek" },
      ]}
    />
  );
}
