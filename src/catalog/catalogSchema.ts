import type { CanonicalItem } from "../matchParsedLineToCanonical";

export type AttributeOptionValue = string | number | boolean;

export type AttributeOption = {
  value: AttributeOptionValue;
  label?: string;
};

export type AttributeValueType = "string" | "number" | "boolean";

export type AttributeDefinition = {
  key: string;
  label: string;
  valueType: AttributeValueType;
  options: AttributeOption[];
  required?: boolean;
};

export type QuantityPolicy =
  | {
      kind: "countable_item";
      defaultUnit: "item" | "dozen" | "bunch";
      bareNumberInterpretation: "count";
    }
  | {
      kind: "weight_based_item";
      defaultUnit: "g" | "kg" | "lb";
      bareNumberInterpretation: "ambiguous" | "package_count";
    }
  | {
      kind: "volume_based_item";
      defaultUnit: "ml" | "l";
      bareNumberInterpretation: "volume" | "ambiguous";
    }
  | {
      kind: "ambiguous_bare_number_item";
      allowedUnits: string[];
      bareNumberInterpretation: "ambiguous";
    };

export type ClarificationTemplate = {
  attributeKey: string;
  question: string;
  options?: string[];
};

export type ItemAliases = string[];

export type CategoryMetadata = {
  key: string;
  displayName: string;
};

export type CanonicalCatalogSchemaRecord = Pick<
  CanonicalItem,
  "id" | "slug" | "display_name" | "category" | "default_attributes_json" | "attribute_schema_json" | "aliases_json"
> & {
  aliases: ItemAliases;
  attributeDefinitions: AttributeDefinition[];
  quantityPolicy: QuantityPolicy;
  clarificationTemplates: ClarificationTemplate[];
  categoryMetadata: CategoryMetadata;
};

export type CatalogSchemaValidationResult = {
  isValid: boolean;
  errors: string[];
};

export const SYNTHETIC_QUANTITY_POLICIES: Record<string, QuantityPolicy> = {
  milk: {
    kind: "volume_based_item",
    defaultUnit: "l",
    bareNumberInterpretation: "volume",
  },
  eggs: {
    kind: "countable_item",
    defaultUnit: "dozen",
    bareNumberInterpretation: "count",
  },
  banana: {
    kind: "countable_item",
    defaultUnit: "item",
    bareNumberInterpretation: "count",
  },
  chicken: {
    kind: "ambiguous_bare_number_item",
    allowedUnits: ["lb", "kg", "package"],
    bareNumberInterpretation: "ambiguous",
  },
  rice: {
    kind: "ambiguous_bare_number_item",
    allowedUnits: ["lb", "kg", "bag", "package"],
    bareNumberInterpretation: "ambiguous",
  },
};

export const CATEGORY_METADATA: Record<string, CategoryMetadata> = {
  dairy: { key: "dairy", displayName: "Dairy" },
  protein: { key: "protein", displayName: "Protein" },
  produce: { key: "produce", displayName: "Produce" },
  meat: { key: "meat", displayName: "Meat" },
  pantry: { key: "pantry", displayName: "Pantry" },
};

function inferAttributeValueType(options: AttributeOptionValue[]): AttributeValueType {
  if (options.every((value) => typeof value === "boolean")) return "boolean";
  if (options.every((value) => typeof value === "number")) return "number";
  return "string";
}

function toAttributeOptions(values: unknown[]): AttributeOption[] {
  return values
    .filter(
      (value): value is AttributeOptionValue =>
        typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    )
    .map((value) => ({ value }));
}

export function buildAttributeDefinitions(item: CanonicalItem): AttributeDefinition[] {
  return Object.entries(item.attribute_schema_json ?? {}).map(([key, values]) => {
    const options = toAttributeOptions(Array.isArray(values) ? values : []);
    return {
      key,
      label: key,
      valueType: inferAttributeValueType(options.map((option) => option.value)),
      options,
      required: key in (item.default_attributes_json ?? {}),
    };
  });
}

export function buildClarificationTemplates(item: CanonicalItem): ClarificationTemplate[] {
  return buildAttributeDefinitions(item)
    .filter((definition) => definition.options.length > 0)
    .map((definition) => ({
      attributeKey: definition.key,
      question: `Which ${item.display_name.toLowerCase()} ${definition.key} do you want?`,
      options: definition.options.map((option) => String(option.value)),
    }));
}

export function toCatalogSchemaRecord(item: CanonicalItem): CanonicalCatalogSchemaRecord {
  const aliases = Array.isArray(item.aliases_json)
    ? item.aliases_json.filter((value): value is string => typeof value === "string")
    : [];

  return {
    ...item,
    aliases,
    attributeDefinitions: buildAttributeDefinitions(item),
    quantityPolicy: SYNTHETIC_QUANTITY_POLICIES[item.slug] ?? {
      kind: "ambiguous_bare_number_item",
      allowedUnits: ["item"],
      bareNumberInterpretation: "ambiguous",
    },
    clarificationTemplates: buildClarificationTemplates(item),
    categoryMetadata: CATEGORY_METADATA[item.category] ?? {
      key: item.category,
      displayName: item.category,
    },
  };
}

function validateAttributeOptions(definition: AttributeDefinition, errors: string[]) {
  if (!definition.key || !definition.label) {
    errors.push("Attribute definitions must include a key and label.");
  }

  if (!Array.isArray(definition.options) || definition.options.length === 0) {
    errors.push(`Attribute definition '${definition.key}' must define at least one option.`);
    return;
  }

  for (const option of definition.options) {
    const valueType = typeof option.value;
    if (!["string", "number", "boolean"].includes(valueType)) {
      errors.push(`Attribute definition '${definition.key}' contains an invalid option value type.`);
    }
  }
}

export function validateQuantityPolicy(policy: QuantityPolicy): string[] {
  const errors: string[] = [];

  if (policy.kind === "countable_item") {
    if (policy.bareNumberInterpretation !== "count") {
      errors.push("Countable items must interpret bare numbers as counts.");
    }
  }

  if (policy.kind === "ambiguous_bare_number_item" && (!policy.allowedUnits || policy.allowedUnits.length === 0)) {
    errors.push("Ambiguous bare-number items must declare allowed units.");
  }

  return errors;
}

export function findUnsafeAliasCollisions(records: CanonicalCatalogSchemaRecord[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();

  for (const record of records) {
    const reserved = new Set([record.slug.toLowerCase(), record.display_name.toLowerCase()]);
    const aliases = record.aliases.map((alias) => alias.trim().toLowerCase()).filter(Boolean);

    for (const alias of aliases) {
      const owner = seen.get(alias);
      if (owner && owner !== record.id) {
        errors.push(`Alias '${alias}' collides across canonical items.`);
      }
      seen.set(alias, record.id);

      if (reserved.has(alias) && alias !== record.slug.toLowerCase()) {
        errors.push(`Alias '${alias}' dangerously overlaps with a canonical item name.`);
      }
    }
  }

  return errors;
}

export function validateCatalogSchemaRecord(record: CanonicalCatalogSchemaRecord): CatalogSchemaValidationResult {
  const errors: string[] = [];

  if (!record.id) errors.push("Canonical item id is required.");
  if (!record.display_name) errors.push("Canonical display name is required.");
  if (!record.category) errors.push("Canonical category is required.");
  if (!record.attributeDefinitions || record.attributeDefinitions.length === 0) {
    errors.push("Canonical items must define attribute definitions.");
  }

  for (const definition of record.attributeDefinitions ?? []) {
    validateAttributeOptions(definition, errors);
  }

  errors.push(...validateQuantityPolicy(record.quantityPolicy));

  return {
    isValid: errors.length === 0,
    errors,
  };
}