import { describe, expect, it } from "vitest";
import { parseUsd } from "../src/lib/units.js";
import { pricePath, scenarioTarget } from "../src/prices/path.js";

const ANCHOR = parseUsd("150");

describe("scenarioTarget", () => {
  it("lands the demo prices exactly", () => {
    expect(scenarioTarget("miss", ANCHOR)).toBe(parseUsd("120"));
    expect(scenarioTarget("beat", ANCHOR)).toBe(parseUsd("187.5"));
    expect(scenarioTarget("weekendGap", ANCHOR)).toBe(parseUsd("132"));
    expect(scenarioTarget("reset", ANCHOR)).toBe(ANCHOR);
  });
});

describe("pricePath", () => {
  it("steps evenly and ends on the target", () => {
    const path = pricePath(parseUsd("150"), parseUsd("190"), 8);
    expect(path).toHaveLength(8);
    expect(path[0]).toBe(parseUsd("155"));
    expect(path.at(-1)).toBe(parseUsd("190"));
  });

  it("handles downward moves", () => {
    const path = pricePath(parseUsd("150"), parseUsd("120"), 3);
    expect(path).toEqual([parseUsd("140"), parseUsd("130"), parseUsd("120")]);
  });

  it("a gap is a single update", () => {
    expect(pricePath(parseUsd("150"), parseUsd("132"), 1)).toEqual([parseUsd("132")]);
  });
});
