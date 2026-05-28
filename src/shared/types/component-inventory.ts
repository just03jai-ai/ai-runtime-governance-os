export interface ComponentBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ComponentInventoryItem {
  readonly id: string;
  readonly tagName: string;
  readonly role: string | null;
  readonly label: string;
  readonly selectorHint: string;
  readonly visible: boolean;
  readonly boundingBox?: ComponentBoundingBox | undefined;
  readonly source: "dom";
}

export interface ComponentInventory {
  readonly capturedAt: string;
  readonly components: readonly ComponentInventoryItem[];
}
