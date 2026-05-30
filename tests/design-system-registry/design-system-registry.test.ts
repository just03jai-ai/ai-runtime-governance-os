import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  DesignSystemContractGenerator,
  DesignSystemRegistryLoader,
  DesignSystemRegistryValidator,
  type DesignSystemRegistry,
} from "../../src/design-system-registry/index.js";

let tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
  tempDirectories = [];
});

describe("Design System Registry", () => {
  it("validates registry semantics and generates governance contracts", () => {
    const registry = registryFixture();
    const validation = new DesignSystemRegistryValidator().validate(registry);
    const generated = new DesignSystemContractGenerator().generate(registry);

    expect(validation).toEqual({ valid: true, issues: [] });
    expect(generated.registryId).toBe("acme");
    expect(generated.registryVersion).toBe("1.2.0");
    expect(generated.contracts).toHaveLength(1);
    expect(generated.contracts[0]).toEqual(
      expect.objectContaining({
        contractId: "acme.button",
        version: "1.2.0",
        componentType: "Button",
        description: "Primary action component. Owner: Design Systems (design@example.test).",
        allowedComponents: [
          {
            componentType: "Button",
            tagName: "button",
            role: "button",
            selectorIncludes: ".btn",
          },
        ],
        requiredDesignTokens: expect.arrayContaining([
          { name: "color.action.primary.background", category: "color" },
          { name: "radius.control.default", category: "radius" },
        ]),
        variantRules: [
          {
            id: "button.variant.primary",
            componentType: "Button",
            variant: "primary",
            selectorIncludes: ".primary",
            requiredTokens: ["color.action.primary.background"],
          },
        ],
        propRestrictions: [
          {
            id: "button.state.enabled.visible",
            componentType: "Button",
            property: "visible",
            requiredValue: true,
          },
        ],
        accessibilityRequirements: [
          {
            id: "button.accessibility",
            componentType: "Button",
            requireAccessibleLabel: true,
            requireRole: "button",
          },
        ],
      }),
    );
    expect(generated.contracts[0]?.severityMapping.accessibilityViolation).toBe("critical");
  });

  it("reports semantic validation errors for unknown tokens", () => {
    const registry: DesignSystemRegistry = {
      ...registryFixture(),
      components: [
        {
          ...registryFixture().components[0]!,
          requiredTokens: ["missing.token"],
        },
      ],
    };

    expect(new DesignSystemRegistryValidator().validate(registry)).toEqual({
      valid: false,
      issues: [
        {
          path: "components.button.requiredTokens",
          message: "Unknown token: missing.token",
        },
      ],
    });
  });

  it("loads registry JSON from disk", async () => {
    const directory = await mkdtemp(join(tmpdir(), "registry-"));
    tempDirectories.push(directory);
    const registryPath = join(directory, "registry.json");
    await writeFile(registryPath, JSON.stringify(registryFixture()), "utf8");

    const registry = await new DesignSystemRegistryLoader().loadFromFile(registryPath);

    expect(registry.registryId).toBe("acme");
    expect(registry.version.version).toBe("1.2.0");
    expect(registry.components[0]?.name).toBe("Button");
  });
});

function registryFixture(): DesignSystemRegistry {
  return {
    registryId: "acme",
    name: "Acme Design System",
    version: {
      version: "1.2.0",
      createdAt: "2026-05-29T00:00:00.000Z",
    },
    owner: {
      team: "Design Systems",
      contact: "design@example.test",
    },
    tokens: [
      {
        name: "color.action.primary.background",
        category: "color",
        value: "#635bff",
      },
      {
        name: "radius.control.default",
        category: "radius",
        value: "8px",
      },
    ],
    components: [
      {
        id: "button",
        name: "Button",
        description: "Primary action component.",
        allowedMatchers: [
          {
            tagName: "button",
            role: "button",
            selectorIncludes: ".btn",
          },
        ],
        requiredTokens: ["radius.control.default"],
        variants: [
          {
            name: "primary",
            selectorIncludes: ".primary",
            requiredTokens: ["color.action.primary.background"],
          },
        ],
        states: [
          {
            name: "enabled",
            requireVisible: true,
          },
        ],
        accessibility: {
          requireAccessibleLabel: true,
          requireRole: "button",
        },
      },
    ],
    defaultSeverityMapping: {
      accessibilityViolation: "critical",
    },
  };
}
