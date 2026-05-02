import type {
  AttributeDefinition,
  AttributeOption,
  CanonicalCatalogSchemaRecord,
  CategoryMetadata,
  ClarificationTemplate,
  QuantityPolicy,
} from "./catalogSchema";

type SeedCategory =
  | "dairy"
  | "eggs"
  | "produce"
  | "meat"
  | "seafood"
  | "pantry"
  | "bakery"
  | "frozen"
  | "beverages"
  | "household-basics";

type SeedItemInput = {
  id: string;
  slug: string;
  displayName: string;
  category: SeedCategory;
  aliases?: string[];
  quantityPolicy: QuantityPolicy;
  attributeDefinitions: AttributeDefinition[];
  clarificationKeys?: string[];
  defaultAttributes?: Record<string, string | number | boolean>;
};

const SEED_CATEGORY_METADATA: Record<SeedCategory, CategoryMetadata> = {
  dairy: { key: "dairy", displayName: "Dairy" },
  eggs: { key: "eggs", displayName: "Eggs" },
  produce: { key: "produce", displayName: "Produce" },
  meat: { key: "meat", displayName: "Meat" },
  seafood: { key: "seafood", displayName: "Seafood" },
  pantry: { key: "pantry", displayName: "Pantry" },
  bakery: { key: "bakery", displayName: "Bakery" },
  frozen: { key: "frozen", displayName: "Frozen" },
  beverages: { key: "beverages", displayName: "Beverages" },
  "household-basics": { key: "household-basics", displayName: "Household Basics" },
};

function option(value: string | number | boolean, label?: string): AttributeOption {
  return { value, label };
}

function stringAttribute(key: string, label: string, values: string[], required = false): AttributeDefinition {
  return {
    key,
    label,
    valueType: "string",
    options: values.map((value) => option(value)),
    required,
  };
}

function numberAttribute(key: string, label: string, values: number[], required = false): AttributeDefinition {
  return {
    key,
    label,
    valueType: "number",
    options: values.map((value) => option(value)),
    required,
  };
}

function booleanAttribute(key: string, label: string, required = false): AttributeDefinition {
  return {
    key,
    label,
    valueType: "boolean",
    options: [option(true), option(false)],
    required,
  };
}

function buildAttributeSchemaJson(definitions: AttributeDefinition[]): Record<string, Array<string | number | boolean>> {
  return Object.fromEntries(definitions.map((definition) => [definition.key, definition.options.map((item) => item.value)]));
}

function buildDefaultAttributes(
  definitions: AttributeDefinition[],
  overrides: Record<string, string | number | boolean> | undefined
): Record<string, string | number | boolean> {
  const defaults: Record<string, string | number | boolean> = {};

  for (const definition of definitions) {
    if (definition.required) {
      defaults[definition.key] = overrides?.[definition.key] ?? definition.options[0].value;
    }
  }

  return defaults;
}

function buildClarificationTemplates(
  displayName: string,
  definitions: AttributeDefinition[],
  clarificationKeys?: string[]
): ClarificationTemplate[] {
  const allowedKeys = new Set(clarificationKeys ?? []);

  if (allowedKeys.size === 0) {
    return [];
  }

  return definitions
    .filter((definition) => allowedKeys.has(definition.key))
    .map((definition) => ({
      attributeKey: definition.key,
      question: `Which ${displayName.toLowerCase()} ${definition.label.toLowerCase()} do you want?`,
      options: definition.options.map((item) => String(item.value)),
    }));
}

function defineSeedItem(input: SeedItemInput): CanonicalCatalogSchemaRecord {
  const aliases = input.aliases ?? [input.slug];
  const attribute_schema_json = buildAttributeSchemaJson(input.attributeDefinitions);
  const default_attributes_json = buildDefaultAttributes(input.attributeDefinitions, input.defaultAttributes);

  return {
    id: input.id,
    slug: input.slug,
    display_name: input.displayName,
    category: input.category,
    aliases_json: aliases,
    aliases,
    quantityPolicy: input.quantityPolicy,
    attributeDefinitions: input.attributeDefinitions,
    clarificationTemplates: buildClarificationTemplates(input.displayName, input.attributeDefinitions, input.clarificationKeys),
    categoryMetadata: SEED_CATEGORY_METADATA[input.category],
    attribute_schema_json,
    default_attributes_json,
  };
}

const countableItem = (defaultUnit: "item" | "dozen" | "bunch" = "item"): QuantityPolicy => ({
  kind: "countable_item",
  defaultUnit,
  bareNumberInterpretation: "count",
});

const weightAmbiguousItem = (allowedUnits: string[]): QuantityPolicy => ({
  kind: "ambiguous_bare_number_item",
  allowedUnits,
  bareNumberInterpretation: "ambiguous",
});

const volumeItem = (defaultUnit: "ml" | "l" = "l"): QuantityPolicy => ({
  kind: "volume_based_item",
  defaultUnit,
  bareNumberInterpretation: "ambiguous",
});

export const SEED_CANONICAL_CATALOG: CanonicalCatalogSchemaRecord[] = [
  defineSeedItem({
    id: "seed-dairy-001",
    slug: "milk",
    displayName: "Milk",
    category: "dairy",
    quantityPolicy: volumeItem("l"),
    attributeDefinitions: [stringAttribute("fat", "Fat", ["skim", "1%", "2%", "whole"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { fat: "2%", organic: false },
  }),
  defineSeedItem({
    id: "seed-dairy-002",
    slug: "whole-milk",
    displayName: "Whole Milk",
    category: "dairy",
    aliases: ["whole-milk", "homo-milk"],
    quantityPolicy: volumeItem("l"),
    attributeDefinitions: [booleanAttribute("organic", "Organic", true), booleanAttribute("lactoseFree", "Lactose Free", true)],
    defaultAttributes: { organic: false, lactoseFree: false },
  }),
  defineSeedItem({
    id: "seed-dairy-003",
    slug: "greek-yogurt",
    displayName: "Greek Yogurt",
    category: "dairy",
    aliases: ["greek-yogurt"],
    quantityPolicy: weightAmbiguousItem(["tub", "g", "kg"]),
    attributeDefinitions: [stringAttribute("flavor", "Flavor", ["plain", "vanilla", "strawberry"], true), stringAttribute("fat", "Fat", ["non-fat", "low-fat", "whole"], true)],
    defaultAttributes: { flavor: "plain", fat: "whole" },
    clarificationKeys: ["flavor"],
  }),
  defineSeedItem({
    id: "seed-dairy-007",
    slug: "yogurt",
    displayName: "Yogurt",
    category: "dairy",
    quantityPolicy: weightAmbiguousItem(["cup", "tub", "g", "kg"]),
    attributeDefinitions: [
      stringAttribute("type", "Type", ["regular", "greek", "drinkable"], true),
      stringAttribute("flavor", "Flavor", ["plain", "vanilla", "strawberry"], true),
      stringAttribute("fat", "Fat", ["non-fat", "low-fat", "whole"], true),
      stringAttribute("size", "Size", ["cup", "tub", "multi-pack"], true),
    ],
    defaultAttributes: { type: "regular", flavor: "plain", fat: "whole", size: "cup" },
    clarificationKeys: ["type", "flavor", "fat", "size"],
  }),
  defineSeedItem({
    id: "seed-dairy-004",
    slug: "cheddar-cheese",
    displayName: "Cheddar Cheese",
    category: "dairy",
    quantityPolicy: weightAmbiguousItem(["block", "package", "g", "kg"]),
    attributeDefinitions: [stringAttribute("form", "Form", ["block", "shredded", "slices"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { form: "block", organic: false },
  }),
  defineSeedItem({
    id: "seed-dairy-005",
    slug: "butter",
    displayName: "Butter",
    category: "dairy",
    quantityPolicy: weightAmbiguousItem(["package", "g", "lb"]),
    attributeDefinitions: [booleanAttribute("salted", "Salted", true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { salted: true, organic: false },
  }),
  defineSeedItem({
    id: "seed-dairy-006",
    slug: "sour-cream",
    displayName: "Sour Cream",
    category: "dairy",
    quantityPolicy: weightAmbiguousItem(["tub", "g", "ml"]),
    attributeDefinitions: [stringAttribute("fat", "Fat", ["light", "regular"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { fat: "regular", organic: false },
  }),

  defineSeedItem({
    id: "seed-eggs-001",
    slug: "eggs",
    displayName: "Eggs",
    category: "eggs",
    quantityPolicy: countableItem("dozen"),
    attributeDefinitions: [stringAttribute("size", "Size", ["small", "large", "jumbo"], true), numberAttribute("eggCount", "Egg Count", [6, 12, 18], true)],
    defaultAttributes: { size: "large", eggCount: 12 },
    clarificationKeys: ["eggCount"],
  }),
  defineSeedItem({
    id: "seed-eggs-002",
    slug: "egg-whites",
    displayName: "Egg Whites",
    category: "eggs",
    quantityPolicy: volumeItem("ml"),
    attributeDefinitions: [stringAttribute("cartonSize", "Carton Size", ["500ml", "1l"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { cartonSize: "500ml", organic: false },
  }),
  defineSeedItem({
    id: "seed-eggs-003",
    slug: "liquid-eggs",
    displayName: "Liquid Eggs",
    category: "eggs",
    quantityPolicy: volumeItem("ml"),
    attributeDefinitions: [stringAttribute("cartonSize", "Carton Size", ["500ml", "1l"], true), booleanAttribute("cageFree", "Cage Free", true)],
    defaultAttributes: { cartonSize: "500ml", cageFree: false },
  }),
  defineSeedItem({
    id: "seed-eggs-004",
    slug: "quail-eggs",
    displayName: "Quail Eggs",
    category: "eggs",
    quantityPolicy: countableItem("dozen"),
    attributeDefinitions: [numberAttribute("eggCount", "Egg Count", [12, 18, 24], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { eggCount: 12, organic: false },
  }),
  defineSeedItem({
    id: "seed-eggs-005",
    slug: "duck-eggs",
    displayName: "Duck Eggs",
    category: "eggs",
    quantityPolicy: countableItem("dozen"),
    attributeDefinitions: [numberAttribute("eggCount", "Egg Count", [6, 12], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { eggCount: 6, organic: false },
  }),
  defineSeedItem({
    id: "seed-eggs-006",
    slug: "egg-substitute",
    displayName: "Egg Substitute",
    category: "eggs",
    quantityPolicy: volumeItem("ml"),
    attributeDefinitions: [stringAttribute("cartonSize", "Carton Size", ["500ml", "1l"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { cartonSize: "500ml", organic: false },
  }),

  defineSeedItem({
    id: "seed-produce-001",
    slug: "bananas",
    displayName: "Bananas",
    category: "produce",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [stringAttribute("ripeness", "Ripeness", ["green", "yellow", "ripe"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { ripeness: "yellow", organic: false },
  }),
  defineSeedItem({
    id: "seed-produce-002",
    slug: "apples",
    displayName: "Apples",
    category: "produce",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [stringAttribute("variety", "Variety", ["gala", "fuji", "honeycrisp"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { variety: "gala", organic: false },
  }),
  defineSeedItem({
    id: "seed-produce-003",
    slug: "lettuce",
    displayName: "Lettuce",
    category: "produce",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [stringAttribute("type", "Type", ["romaine", "iceberg", "leaf"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { type: "romaine", organic: false },
  }),
  defineSeedItem({
    id: "seed-produce-004",
    slug: "tomatoes",
    displayName: "Tomatoes",
    category: "produce",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [stringAttribute("variety", "Variety", ["vine", "roma", "cherry"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { variety: "vine", organic: false },
  }),
  defineSeedItem({
    id: "seed-produce-005",
    slug: "onions",
    displayName: "Onions",
    category: "produce",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [stringAttribute("color", "Color", ["yellow", "red", "white"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { color: "yellow", organic: false },
  }),
  defineSeedItem({
    id: "seed-produce-006",
    slug: "potatoes",
    displayName: "Potatoes",
    category: "produce",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "bag", "item"]),
    attributeDefinitions: [stringAttribute("type", "Type", ["russet", "yukon", "red"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { type: "russet", organic: false },
  }),

  defineSeedItem({
    id: "seed-meat-001",
    slug: "chicken-breast",
    displayName: "Chicken Breast",
    category: "meat",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "package"]),
    aliases: ["chicken-breast", "boneless-chicken-breast"],
    attributeDefinitions: [booleanAttribute("boneless", "Boneless", true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { boneless: true, organic: false },
  }),
  defineSeedItem({
    id: "seed-meat-002",
    slug: "chicken-thigh",
    displayName: "Chicken Thigh",
    category: "meat",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "package"]),
    aliases: ["chicken-thigh", "skinless-chicken-thigh"],
    attributeDefinitions: [booleanAttribute("skinless", "Skinless", true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { skinless: true, organic: false },
  }),
  defineSeedItem({
    id: "seed-meat-003",
    slug: "ground-beef",
    displayName: "Ground Beef",
    category: "meat",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "package"]),
    attributeDefinitions: [numberAttribute("leanPercent", "Lean Percent", [80, 85, 90], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { leanPercent: 85, organic: false },
  }),
  defineSeedItem({
    id: "seed-meat-004",
    slug: "steak",
    displayName: "Steak",
    category: "meat",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "package"]),
    attributeDefinitions: [stringAttribute("cut", "Cut", ["sirloin", "ribeye", "striploin"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { cut: "sirloin", organic: false },
  }),
  defineSeedItem({
    id: "seed-meat-005",
    slug: "bacon",
    displayName: "Bacon",
    category: "meat",
    quantityPolicy: weightAmbiguousItem(["package", "lb"]),
    attributeDefinitions: [stringAttribute("cure", "Cure", ["smoked", "uncured"], true), stringAttribute("thickness", "Thickness", ["regular", "thick"], true)],
    defaultAttributes: { cure: "smoked", thickness: "regular" },
  }),
  defineSeedItem({
    id: "seed-meat-006",
    slug: "sausage",
    displayName: "Sausage",
    category: "meat",
    quantityPolicy: weightAmbiguousItem(["package", "lb"]),
    attributeDefinitions: [stringAttribute("variety", "Variety", ["italian", "breakfast", "chorizo"], true), booleanAttribute("spicy", "Spicy", true)],
    defaultAttributes: { variety: "italian", spicy: false },
  }),

  defineSeedItem({
    id: "seed-seafood-001",
    slug: "salmon",
    displayName: "Salmon",
    category: "seafood",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "fillet", "package"]),
    attributeDefinitions: [stringAttribute("form", "Form", ["fillet", "portion"], true), booleanAttribute("wildCaught", "Wild Caught", true)],
    defaultAttributes: { form: "fillet", wildCaught: true },
  }),
  defineSeedItem({
    id: "seed-seafood-002",
    slug: "shrimp",
    displayName: "Shrimp",
    category: "seafood",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "bag"]),
    attributeDefinitions: [stringAttribute("size", "Size", ["medium", "large", "jumbo"], true), booleanAttribute("peeled", "Peeled", true)],
    defaultAttributes: { size: "large", peeled: true },
  }),
  defineSeedItem({
    id: "seed-seafood-003",
    slug: "tuna-fillet",
    displayName: "Tuna Fillet",
    category: "seafood",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "package"]),
    attributeDefinitions: [stringAttribute("cut", "Cut", ["steak", "loin"], true), booleanAttribute("wildCaught", "Wild Caught", true)],
    defaultAttributes: { cut: "steak", wildCaught: true },
  }),
  defineSeedItem({
    id: "seed-seafood-004",
    slug: "cod",
    displayName: "Cod",
    category: "seafood",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "fillet", "package"]),
    attributeDefinitions: [stringAttribute("form", "Form", ["fillet", "loin"], true), booleanAttribute("wildCaught", "Wild Caught", true)],
    defaultAttributes: { form: "fillet", wildCaught: true },
  }),
  defineSeedItem({
    id: "seed-seafood-005",
    slug: "tilapia",
    displayName: "Tilapia",
    category: "seafood",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "fillet", "package"]),
    attributeDefinitions: [stringAttribute("form", "Form", ["fillet", "portion"], true), booleanAttribute("fresh", "Fresh", true)],
    defaultAttributes: { form: "fillet", fresh: true },
  }),
  defineSeedItem({
    id: "seed-seafood-006",
    slug: "scallops",
    displayName: "Scallops",
    category: "seafood",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "package"]),
    attributeDefinitions: [stringAttribute("size", "Size", ["small", "medium", "large"], true), booleanAttribute("wildCaught", "Wild Caught", true)],
    defaultAttributes: { size: "medium", wildCaught: true },
  }),

  defineSeedItem({
    id: "seed-pantry-001",
    slug: "rice",
    displayName: "Rice",
    category: "pantry",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "bag", "package"]),
    attributeDefinitions: [stringAttribute("type", "Type", ["white", "brown", "basmati", "jasmine"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { type: "white", organic: false },
  }),
  defineSeedItem({
    id: "seed-pantry-002",
    slug: "pasta",
    displayName: "Pasta",
    category: "pantry",
    quantityPolicy: weightAmbiguousItem(["box", "bag", "package"]),
    attributeDefinitions: [stringAttribute("shape", "Shape", ["spaghetti", "penne", "fusilli"], true), booleanAttribute("wholeWheat", "Whole Wheat", true)],
    defaultAttributes: { shape: "spaghetti", wholeWheat: false },
  }),
  defineSeedItem({
    id: "seed-pantry-003",
    slug: "flour",
    displayName: "Flour",
    category: "pantry",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "bag"]),
    attributeDefinitions: [stringAttribute("type", "Type", ["all-purpose", "bread", "whole-wheat"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { type: "all-purpose", organic: false },
  }),
  defineSeedItem({
    id: "seed-pantry-004",
    slug: "sugar",
    displayName: "Sugar",
    category: "pantry",
    quantityPolicy: weightAmbiguousItem(["lb", "kg", "bag"]),
    attributeDefinitions: [stringAttribute("type", "Type", ["white", "brown", "cane"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { type: "white", organic: false },
  }),
  defineSeedItem({
    id: "seed-pantry-005",
    slug: "olive-oil",
    displayName: "Olive Oil",
    category: "pantry",
    quantityPolicy: volumeItem("ml"),
    attributeDefinitions: [stringAttribute("grade", "Grade", ["extra-virgin", "virgin", "light"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { grade: "extra-virgin", organic: false },
  }),
  defineSeedItem({
    id: "seed-pantry-006",
    slug: "peanut-butter",
    displayName: "Peanut Butter",
    category: "pantry",
    quantityPolicy: weightAmbiguousItem(["jar", "oz", "g"]),
    attributeDefinitions: [stringAttribute("style", "Style", ["smooth", "crunchy"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { style: "smooth", organic: false },
  }),

  defineSeedItem({
    id: "seed-bakery-001",
    slug: "bread",
    displayName: "Bread",
    category: "bakery",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [stringAttribute("style", "Style", ["white", "whole-wheat", "sourdough"], true), booleanAttribute("sliced", "Sliced", true)],
    defaultAttributes: { style: "whole-wheat", sliced: true },
  }),
  defineSeedItem({
    id: "seed-bakery-002",
    slug: "bagels",
    displayName: "Bagels",
    category: "bakery",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [stringAttribute("flavor", "Flavor", ["plain", "everything", "cinnamon-raisin"], true), numberAttribute("packSize", "Pack Size", [4, 6, 12], true)],
    defaultAttributes: { flavor: "plain", packSize: 6 },
  }),
  defineSeedItem({
    id: "seed-bakery-003",
    slug: "tortillas",
    displayName: "Tortillas",
    category: "bakery",
    quantityPolicy: weightAmbiguousItem(["package", "count"]),
    attributeDefinitions: [stringAttribute("base", "Base", ["flour", "corn"], true), stringAttribute("size", "Size", ["small", "large"], true)],
    defaultAttributes: { base: "flour", size: "large" },
  }),
  defineSeedItem({
    id: "seed-bakery-004",
    slug: "hamburger-buns",
    displayName: "Hamburger Buns",
    category: "bakery",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [stringAttribute("style", "Style", ["classic", "brioche", "potato"], true), numberAttribute("packSize", "Pack Size", [4, 8], true)],
    defaultAttributes: { style: "classic", packSize: 8 },
  }),
  defineSeedItem({
    id: "seed-bakery-005",
    slug: "sandwich-wraps",
    displayName: "Sandwich Wraps",
    category: "bakery",
    quantityPolicy: weightAmbiguousItem(["package", "count"]),
    attributeDefinitions: [stringAttribute("base", "Base", ["flour", "whole-wheat", "spinach"], true), stringAttribute("size", "Size", ["regular", "large"], true)],
    defaultAttributes: { base: "whole-wheat", size: "regular" },
  }),
  defineSeedItem({
    id: "seed-bakery-006",
    slug: "croissants",
    displayName: "Croissants",
    category: "bakery",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [stringAttribute("style", "Style", ["classic", "all-butter", "mini"], true), numberAttribute("packSize", "Pack Size", [4, 6, 8], true)],
    defaultAttributes: { style: "classic", packSize: 4 },
  }),

  defineSeedItem({
    id: "seed-frozen-001",
    slug: "frozen-pizza",
    displayName: "Frozen Pizza",
    category: "frozen",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [stringAttribute("style", "Style", ["cheese", "pepperoni", "vegetable"], true), stringAttribute("size", "Size", ["personal", "family"], true)],
    defaultAttributes: { style: "cheese", size: "family" },
  }),
  defineSeedItem({
    id: "seed-frozen-002",
    slug: "frozen-vegetables",
    displayName: "Frozen Vegetables",
    category: "frozen",
    quantityPolicy: weightAmbiguousItem(["bag", "package", "lb"]),
    attributeDefinitions: [stringAttribute("mix", "Mix", ["peas", "corn", "mixed"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { mix: "mixed", organic: false },
  }),
  defineSeedItem({
    id: "seed-frozen-003",
    slug: "frozen-berries",
    displayName: "Frozen Berries",
    category: "frozen",
    quantityPolicy: weightAmbiguousItem(["bag", "package", "lb"]),
    attributeDefinitions: [stringAttribute("blend", "Blend", ["strawberries", "blueberries", "mixed"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { blend: "mixed", organic: false },
  }),
  defineSeedItem({
    id: "seed-frozen-004",
    slug: "ice-cream",
    displayName: "Ice Cream",
    category: "frozen",
    quantityPolicy: volumeItem("ml"),
    attributeDefinitions: [stringAttribute("flavor", "Flavor", ["vanilla", "chocolate", "strawberry"], true), booleanAttribute("dairyFree", "Dairy Free", true)],
    defaultAttributes: { flavor: "vanilla", dairyFree: false },
  }),
  defineSeedItem({
    id: "seed-frozen-005",
    slug: "frozen-fries",
    displayName: "Frozen Fries",
    category: "frozen",
    quantityPolicy: weightAmbiguousItem(["bag", "package"]),
    attributeDefinitions: [stringAttribute("cut", "Cut", ["straight", "crinkle", "wedge"], true), booleanAttribute("seasoned", "Seasoned", true)],
    defaultAttributes: { cut: "straight", seasoned: false },
  }),
  defineSeedItem({
    id: "seed-frozen-006",
    slug: "chicken-nuggets",
    displayName: "Chicken Nuggets",
    category: "frozen",
    quantityPolicy: weightAmbiguousItem(["bag", "package"]),
    attributeDefinitions: [stringAttribute("breading", "Breading", ["classic", "gluten-free"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { breading: "classic", organic: false },
  }),

  defineSeedItem({
    id: "seed-beverages-001",
    slug: "coffee",
    displayName: "Coffee",
    category: "beverages",
    quantityPolicy: weightAmbiguousItem(["bag", "can", "package"]),
    attributeDefinitions: [stringAttribute("format", "Format", ["ground", "whole-bean", "pods"], true), stringAttribute("roast", "Roast", ["light", "medium", "dark"], true)],
    defaultAttributes: { format: "ground", roast: "medium" },
    clarificationKeys: ["format", "roast"],
  }),
  defineSeedItem({
    id: "seed-beverages-002",
    slug: "tea",
    displayName: "Tea",
    category: "beverages",
    quantityPolicy: weightAmbiguousItem(["box", "bag", "package"]),
    attributeDefinitions: [stringAttribute("type", "Type", ["black", "green", "herbal"], true), booleanAttribute("caffeineFree", "Caffeine Free", true)],
    defaultAttributes: { type: "black", caffeineFree: false },
  }),
  defineSeedItem({
    id: "seed-beverages-003",
    slug: "orange-juice",
    displayName: "Orange Juice",
    category: "beverages",
    quantityPolicy: volumeItem("l"),
    attributeDefinitions: [stringAttribute("pulp", "Pulp", ["none", "some", "high"], true), booleanAttribute("organic", "Organic", true)],
    defaultAttributes: { pulp: "some", organic: false },
  }),
  defineSeedItem({
    id: "seed-beverages-004",
    slug: "soda",
    displayName: "Soda",
    category: "beverages",
    quantityPolicy: volumeItem("l"),
    attributeDefinitions: [stringAttribute("type", "Type", ["cola", "lemon-lime", "orange"], true), booleanAttribute("sugarFree", "Sugar Free", true)],
    defaultAttributes: { type: "cola", sugarFree: false },
  }),
  defineSeedItem({
    id: "seed-beverages-005",
    slug: "sparkling-water",
    displayName: "Sparkling Water",
    category: "beverages",
    quantityPolicy: volumeItem("l"),
    aliases: ["sparkling-water", "seltzer-water"],
    attributeDefinitions: [stringAttribute("flavor", "Flavor", ["plain", "lime", "berry"], true), stringAttribute("packFormat", "Pack Format", ["cans", "bottles"], true)],
    defaultAttributes: { flavor: "plain", packFormat: "cans" },
  }),
  defineSeedItem({
    id: "seed-beverages-006",
    slug: "bottled-water",
    displayName: "Bottled Water",
    category: "beverages",
    quantityPolicy: volumeItem("l"),
    attributeDefinitions: [stringAttribute("size", "Size", ["500ml", "1l", "1.5l"], true), stringAttribute("packFormat", "Pack Format", ["single", "multi-pack"], true)],
    defaultAttributes: { size: "1l", packFormat: "single" },
  }),

  defineSeedItem({
    id: "seed-household-001",
    slug: "dish-soap",
    displayName: "Dish Soap",
    category: "household-basics",
    quantityPolicy: volumeItem("ml"),
    attributeDefinitions: [stringAttribute("scent", "Scent", ["lemon", "unscented"], true), booleanAttribute("antibacterial", "Antibacterial", true)],
    defaultAttributes: { scent: "lemon", antibacterial: false },
  }),
  defineSeedItem({
    id: "seed-household-002",
    slug: "laundry-detergent",
    displayName: "Laundry Detergent",
    category: "household-basics",
    quantityPolicy: weightAmbiguousItem(["bottle", "box", "pack"]),
    attributeDefinitions: [stringAttribute("format", "Format", ["liquid", "pods", "powder"], true), stringAttribute("scent", "Scent", ["fresh", "unscented"], true)],
    defaultAttributes: { format: "liquid", scent: "fresh" },
  }),
  defineSeedItem({
    id: "seed-household-003",
    slug: "paper-towels",
    displayName: "Paper Towels",
    category: "household-basics",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [numberAttribute("packSize", "Pack Size", [2, 6, 12], true), numberAttribute("ply", "Ply", [1, 2, 3], true)],
    defaultAttributes: { packSize: 6, ply: 2 },
  }),
  defineSeedItem({
    id: "seed-household-004",
    slug: "toilet-paper",
    displayName: "Toilet Paper",
    category: "household-basics",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [numberAttribute("packSize", "Pack Size", [4, 12, 24], true), numberAttribute("ply", "Ply", [1, 2, 3], true)],
    defaultAttributes: { packSize: 12, ply: 2 },
  }),
  defineSeedItem({
    id: "seed-household-005",
    slug: "trash-bags",
    displayName: "Trash Bags",
    category: "household-basics",
    quantityPolicy: countableItem("item"),
    attributeDefinitions: [stringAttribute("size", "Size", ["13gal", "30gal", "45gal"], true), booleanAttribute("drawstring", "Drawstring", true)],
    defaultAttributes: { size: "13gal", drawstring: true },
  }),
  defineSeedItem({
    id: "seed-household-006",
    slug: "aluminum-foil",
    displayName: "Aluminum Foil",
    category: "household-basics",
    quantityPolicy: weightAmbiguousItem(["roll", "package"]),
    attributeDefinitions: [stringAttribute("strength", "Strength", ["standard", "heavy-duty"], true), stringAttribute("width", "Width", ["12in", "18in"], true)],
    defaultAttributes: { strength: "standard", width: "12in" },
  }),
];

export function getSeedCanonicalCatalog(): CanonicalCatalogSchemaRecord[] {
  return SEED_CANONICAL_CATALOG.slice();
}