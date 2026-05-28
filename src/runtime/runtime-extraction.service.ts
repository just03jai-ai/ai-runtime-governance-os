import type { Page } from "playwright";
import type {
  DomElementSnapshot,
  RuntimeComponentInventory,
  RuntimeComponentInventoryItem,
  RuntimeDomSnapshot,
} from "../contracts/runtime.js";

export class RuntimeExtractionService {
  async extractDom(page: Page): Promise<RuntimeDomSnapshot> {
    const script = `(() => {
      const selectorFor = (element) => {
        if (element.id) {
          return "#" + element.id;
        }

        const testId = element.getAttribute("data-testid");
        if (testId) {
          return '[data-testid="' + testId + '"]';
        }

        const className = Array.from(element.classList).slice(0, 2).join(".");
        const classSelector = className ? "." + className : "";
        return element.tagName.toLowerCase() + classSelector;
      };

      const elements = Array.from(
        document.querySelectorAll("button, a, input, select, textarea, [role], [data-testid], [data-component]"),
      );

      const snapshots = elements.slice(0, 500).map((element) => {
        const rect = element.getBoundingClientRect();
        const attributes = Array.from(element.attributes).map((attribute) => ({
          name: attribute.name,
          value: attribute.value,
        }));

        return {
          tagName: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          text: (element.textContent ?? "").trim().slice(0, 160),
          attributes,
          selectorHint: selectorFor(element),
          boundingBox:
            rect.width > 0 || rect.height > 0
              ? {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                }
              : null,
        };
      });

      return {
        url: window.location.href,
        title: document.title,
        capturedAt: new Date().toISOString(),
        elements: snapshots,
      };
    })()`;

    return page.evaluate(script) as Promise<RuntimeDomSnapshot>;
  }

  buildComponentInventory(domSnapshot: RuntimeDomSnapshot): RuntimeComponentInventory {
    const components: RuntimeComponentInventoryItem[] = domSnapshot.elements.map((element, index) => ({
      id: `component-${index + 1}`,
      tagName: element.tagName,
      role: element.role,
      label: this.labelFor(element),
      selectorHint: element.selectorHint,
      visible: Boolean(element.boundingBox),
      source: "dom",
    }));

    return {
      capturedAt: new Date().toISOString(),
      components,
    };
  }

  private labelFor(element: DomElementSnapshot): string {
    const ariaLabel = element.attributes.find((attribute) => attribute.name === "aria-label")?.value;
    const name = element.attributes.find((attribute) => attribute.name === "name")?.value;
    const testId = element.attributes.find((attribute) => attribute.name === "data-testid")?.value;

    return ariaLabel ?? element.text ?? name ?? testId ?? element.selectorHint;
  }
}
