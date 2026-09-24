import { Droplets, Waves } from "lucide-react";

import type { FuelCoreState } from "../engine/fuelEngine";

interface FuelCoreProps {
  state: FuelCoreState;
  label: string;
}

export function FuelCore({ state, label }: FuelCoreProps) {
  return (
    <div className={`bw-fuel-core bw-fuel-core--${state}`} aria-label={label} role="img">
      <div className="bw-fuel-core__orbit bw-fuel-core__orbit--outer" />
      <div className="bw-fuel-core__orbit bw-fuel-core__orbit--middle" />
      <div className="bw-fuel-core__orbit bw-fuel-core__orbit--inner" />
      <span className="bw-fuel-core__dot bw-fuel-core__dot--one" />
      <span className="bw-fuel-core__dot bw-fuel-core__dot--two" />
      <span className="bw-fuel-core__dot bw-fuel-core__dot--three" />
      <div className="bw-fuel-core__center">
        {state === "recovery" ? <Droplets aria-hidden="true" /> : <Waves aria-hidden="true" />}
      </div>
    </div>
  );
}

