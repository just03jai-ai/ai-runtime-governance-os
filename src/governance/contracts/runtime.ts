export interface DomAttributeSnapshot {
  readonly name: string;
  readonly value: string;
}

export interface DomElementSnapshot {
  readonly tagName: string;
  readonly role: string | null;
  readonly text: string;
  readonly attributes: readonly DomAttributeSnapshot[];
  readonly selectorHint: string;
  readonly boundingBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
}

export interface RuntimeDomSnapshot {
  readonly url: string;
  readonly title: string;
  readonly capturedAt: string;
  readonly elements: readonly DomElementSnapshot[];
}

export interface RuntimeComponentInventoryItem {
  readonly id: string;
  readonly name: string;
  readonly tagName: string;
  readonly role: string | null;
  readonly label: string;
  readonly selectorHint: string;
  readonly attributes?: Readonly<Record<string, string>> | undefined;
  readonly visible: boolean;
  readonly source: "dom";
}

export interface RuntimeComponentInventory {
  readonly capturedAt: string;
  readonly components: readonly RuntimeComponentInventoryItem[];
}
