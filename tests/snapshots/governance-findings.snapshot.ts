export const governanceFindingsSnapshot = [
  {
    actual: "button role=button selector=button.primary.danger",
    component: "component-button-primary",
    expected: "Component must not match forbidden DangerButton rule.",
    policy: "forbidden-component",
    severity: "critical",
  },
  {
    actual: "label === ",
    component: "component-button-primary",
    expected: "label === Submit order",
    policy: "prop-restriction",
    severity: "warning",
  },
  {
    actual: "empty label",
    component: "component-button-primary",
    expected: "component has deterministic accessible label evidence",
    policy: "accessibility-requirement",
    severity: "critical",
  },
  {
    actual: "required tokens missing from runtime evidence",
    component: "component-button-primary",
    expected: "Variant primary requires tokens: color.action.primary",
    policy: "variant-rule",
    severity: "warning",
  },
  {
    actual: "missing",
    component: "Button",
    expected: "color.action.primary (color)",
    policy: "required-design-token",
    severity: "warning",
  },
] as const;
