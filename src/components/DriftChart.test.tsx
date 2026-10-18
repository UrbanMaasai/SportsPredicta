import { beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DriftChart } from "./modals/DriftModal";
import { fixtureKey, recordSnapshots } from "../domain/drift";
import { saveOddsHistory } from "../lib/storage";
import { fx } from "../test/factories";

const kickoff = new Date(Date.now() + 3 * 86_400_000).toISOString();
const fixture = fx({ id: "drift-1", source: "live", kickoff, odds: { home: 1.95, draw: 3.3, away: 3.9 } });

// Each series draws one circle per point; filled circles are observed, hollow ones modelled.
const filled = (c: HTMLElement) => [...c.querySelectorAll("circle")].filter((el) => el.getAttribute("fill") !== "#fff");
const hollow = (c: HTMLElement) => [...c.querySelectorAll("circle")].filter((el) => el.getAttribute("fill") === "#fff");

describe("DriftChart", () => {
  beforeEach(() => localStorage.clear());

  it("without history only the current price is drawn as observed", () => {
    const { container, getByText } = render(<DriftChart fixture={fixture} />);
    expect(filled(container)).toHaveLength(3); // last point of each 1/X/2 series
    expect(hollow(container).length).toBeGreaterThan(0);
    expect(getByText(/Path is modelled/)).toBeInTheDocument();
  });

  it("draws recorded prices as observed points", () => {
    let h = recordSnapshots({}, [{ ...fixture, odds: { home: 2.1, draw: 3.2, away: 3.5 } }], new Date(Date.now() - 2 * 86_400_000));
    h = recordSnapshots(h, [fixture], new Date(Date.now() - 86_400_000));
    saveOddsHistory(h);
    expect(h[fixtureKey(fixture)].snapshots).toHaveLength(2);
    const { container, getByText } = render(<DriftChart fixture={fixture} />);
    expect(filled(container)).toHaveLength(2 * 3);
    expect(getByText(/2 observed prices since/)).toBeInTheDocument();
  });
});
