import type { Page } from "playwright";
import type {
  DomElementSnapshot,
  RuntimeComponentInventory,
  RuntimeComponentInventoryItem,
  RuntimeDomSnapshot,
} from "../../governance/contracts/runtime.js";

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
      name: this.componentNameFor(element),
      tagName: element.tagName,
      role: element.role,
      label: this.labelFor(element),
      selectorHint: element.selectorHint,
      attributes: Object.fromEntries(element.attributes.map((attribute) => [attribute.name, attribute.value])),
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

  private componentNameFor(element: DomElementSnapshot): string {
    const dataComponent = element.attributes.find((attribute) => attribute.name === "data-component")?.value;

    if (dataComponent) {
      return this.toPascalCase(dataComponent);
    }

    const roleName = element.role ? this.roleComponentName(element.role) : undefined;

    if (roleName) {
      return roleName;
    }

    if (element.tagName === "input") {
      const inputType = element.attributes.find((attribute) => attribute.name === "type")?.value ?? "text";
      return this.inputComponentName(inputType);
    }

    const tagNameMap: Readonly<Record<string, string>> = {
      a: "Link",
      button: "Button",
      select: "Select",
      textarea: "TextArea",
    };

    return tagNameMap[element.tagName] ?? "Component";
  }

  private roleComponentName(role: string): string | undefined {
    const roleNameMap: Readonly<Record<string, string>> = {
      alert: "Alert",
      button: "Button",
      checkbox: "Checkbox",
      combobox: "Combobox",
      dialog: "Dialog",
      link: "Link",
      menu: "Menu",
      menuitem: "MenuItem",
      navigation: "Navigation",
      radio: "RadioButton",
      searchbox: "SearchBox",
      switch: "Switch",
      tab: "Tab",
      tablist: "Tabs",
      textbox: "TextField",
    };

    return roleNameMap[role];
  }

  private inputComponentName(inputType: string): string {
    const inputNameMap: Readonly<Record<string, string>> = {
      checkbox: "Checkbox",
      email: "TextField",
      number: "NumberField",
      password: "PasswordField",
      radio: "RadioButton",
      range: "Slider",
      search: "SearchField",
      tel: "TextField",
      text: "TextField",
      url: "TextField",
    };

    return inputNameMap[inputType] ?? "TextField";
  }

  private toPascalCase(value: string): string {
    const normalized = value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");

    return normalized || "Component";
  }
}
