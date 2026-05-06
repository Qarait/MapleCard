import { getCatalogSource } from "./catalogSourceConfig";

export type HealthMetadata = {
  ok: true;
  service: "maplecard-api";
  environment: string;
  catalogSource: ReturnType<typeof getCatalogSource>;
  parserMode: "deterministic_only" | "llm_assisted";
};

function getParserMode(): HealthMetadata["parserMode"] {
  const rawMode = (process.env.MAPLECARD_PARSER_MODE ?? "deterministic_only").trim();

  if (rawMode === "llm_assisted") {
    return "llm_assisted";
  }

  return "deterministic_only";
}

export function getHealthMetadata(): HealthMetadata {
  return {
    ok: true,
    service: "maplecard-api",
    environment: process.env.NODE_ENV ?? "development",
    catalogSource: getCatalogSource(),
    parserMode: getParserMode(),
  };
}