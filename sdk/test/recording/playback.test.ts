import { describe, expect, it } from "vitest";
import { onRhythm } from "../../src/recording/playback.js";

const at = (...ts: number[]) => ts.map((t) => ({ t, data: {} }));
const times = (ms: { t: number }[]) => ms.map((m) => m.t);

describe("onRhythm", () => {
  it("keeps samples on the run's ~1 s rhythm", () => {
    expect(times(onRhythm(at(-1, 999, 2000, 3001, 3999, 5000)))).toEqual([-1, 999, 2000, 3001, 3999, 5000]);
  });

  it("drops samples that arrived late", () => {
    // From Dance2 run 0: 14847 was held up, then 16979 and 16999 came in one burst after a stall
    expect(times(onRhythm(at(12802, 13799, 14847, 16979, 16999, 17801, 18799)))).toEqual([
      12802, 13799, 17801, 18799,
    ]);
  });

  it("finds the rhythm when it shifted at the start", () => {
    // A run whose stream re-phased just after the send keeps the phase most samples share
    expect(times(onRhythm(at(-1, 26, 802, 1800, 2799, 3800, 4799)))).toEqual([802, 1800, 2799, 3800, 4799]);
  });

  it("leaves short runs alone", () => {
    expect(times(onRhythm(at(0, 1300, 2000)))).toEqual([0, 1300, 2000]);
  });
});
