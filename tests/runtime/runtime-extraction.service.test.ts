import { describe, expect, it } from "vitest";
import { RuntimeExtractionService } from "../../src/runtime/extraction/runtime-extraction.service.js";
import type { RuntimeDomSnapshot } from "../../src/governance/contracts/runtime.js";

describe("RuntimeExtractionService component names", () => {
  it("assigns deterministic industry-standard component names", () => {
    const domSnapshot: RuntimeDomSnapshot = {
      url: "https://example.test",
      title: "Naming",
      capturedAt: "2026-05-28T00:00:00.000Z",
      elements: [
        {
          tagName: "button",
          role: null,
          text: "Approve",
          attributes: [],
          selectorHint: "button",
          boundingBox: { x: 0, y: 0, width: 80, height: 32 },
        },
        {
          tagName: "input",
          role: null,
          text: "",
          attributes: [{ name: "type", value: "email" }],
          selectorHint: "input",
          boundingBox: { x: 0, y: 40, width: 180, height: 36 },
        },
        {
          tagName: "a",
          role: null,
          text: "Docs",
          attributes: [],
          selectorHint: "a",
          boundingBox: { x: 0, y: 84, width: 80, height: 24 },
        },
        {
          tagName: "div",
          role: "dialog",
          text: "Confirm",
          attributes: [],
          selectorHint: "div",
          boundingBox: { x: 0, y: 120, width: 280, height: 160 },
        },
      ],
    };

    const inventory = new RuntimeExtractionService().buildComponentInventory(domSnapshot);

    expect(inventory.components.map((component) => component.name)).toEqual([
      "Button",
      "TextField",
      "Link",
      "Dialog",
    ]);
  });
});
