export type PlanCode = "A" | "B";

export type PlanProductRuleErrorCode =
  | "PLAN_CODE_REQUIRED"
  | "PLAN_CODE_INVALID"
  | "WATER_HEATER_TYPE_REQUIRED"
  | "ADDITIONAL_QUANTITY_REQUIRED"
  | "ADDITIONAL_EQUIPMENT_REQUIRED"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_AMBIGUOUS"
  | "PRODUCT_INACTIVE";

export type PlanProductRuleError = {
  code: PlanProductRuleErrorCode;
  field:
    | "plan_code"
    | "water_heater_type"
    | "additional_equipment"
    | "additional_quantity"
    | "product_code";
  message: string;
  currentValue: string | number | null;
  productCode?: string;
};

export type PlanProductTarget = {
  productCode: string;
  source: "water_heater" | "plan" | "additional";
  requestedValue: string;
};

export type PlanProductMasterRow = {
  id: string;
  product_code: string | null;
  product_name: string;
  is_active: boolean | null;
  sort_order?: number | null;
};

export type ResolvedPlanProduct = {
  target: PlanProductTarget;
  product: PlanProductMasterRow;
};

export type PlanProductExpansionResult = {
  planCode: PlanCode | null;
  targets: PlanProductTarget[];
  resolved: ResolvedPlanProduct[];
  errors: PlanProductRuleError[];
};

const PLAN_FIXED_PRODUCTS: Record<PlanCode, readonly PlanProductTarget[]> = {
  A: [
    { productCode: "P010", source: "plan", requestedValue: "システムキッチン" },
    { productCode: "P009", source: "plan", requestedValue: "システムバス" },
    { productCode: "P006", source: "plan", requestedValue: "換気扇" },
    { productCode: "P012", source: "plan", requestedValue: "洗面化粧台" },
    { productCode: "P008", source: "plan", requestedValue: "温水洗浄便座" },
    { productCode: "P003", source: "plan", requestedValue: "壁掛けエアコン" },
    { productCode: "P014", source: "plan", requestedValue: "24時間換気システム" },
  ],
  B: [
    { productCode: "P010", source: "plan", requestedValue: "システムキッチン" },
    { productCode: "P009", source: "plan", requestedValue: "システムバス" },
    { productCode: "P006", source: "plan", requestedValue: "換気扇" },
    { productCode: "P012", source: "plan", requestedValue: "洗面化粧台" },
    { productCode: "P008", source: "plan", requestedValue: "温水洗浄便座" },
    { productCode: "P004", source: "plan", requestedValue: "ビルトインエアコン" },
    { productCode: "P014", source: "plan", requestedValue: "24時間換気システム" },
  ],
};

const WATER_HEATER_ALIASES: Record<string, readonly string[]> = {
  P001: [
    "給湯器",
    "ガス給湯器",
    "電気温水器",
    "給湯器（エコキュート以外）",
    "給湯器(エコキュート以外)",
  ],
  P002: [
    "エコキュート",
    "給湯器（エコキュート）",
    "給湯器(エコキュート)",
  ],
  P034: ["ECO ONE", "ECOONE", "ECO ONE製品一式", "ECOONE製品一式"],
};

const ADDITIONAL_EQUIPMENT_ALIASES: Record<string, readonly string[]> = {
  P003: ["壁掛けエアコン", "エアコン（壁掛け）", "エアコン（壁掛けタイプ）"],
  P004: [
    "ビルトインエアコン",
    "エアコン（ビルトイン）",
    "エアコン（ビルトインタイプ）",
  ],
  P005: ["コンロ", "ガスコンロ", "IHコンロ", "コンロ（電気・ガス）"],
  P008: ["温水洗浄便座"],
};

export function normalizePlanProductKey(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function clean(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function resolvePlanCode(value: unknown): PlanCode | null {
  const normalized = normalizePlanProductKey(value).toUpperCase();
  return normalized === "A" || normalized === "B" ? normalized : null;
}

function resolveAlias(
  value: string,
  aliases: Record<string, readonly string[]>,
  field: "water_heater_type" | "additional_equipment",
  label: string
) {
  const key = normalizePlanProductKey(value);
  const candidates = Object.entries(aliases)
    .filter(([, values]) =>
      values.some((candidate) => normalizePlanProductKey(candidate) === key)
    )
    .map(([productCode]) => productCode);

  if (candidates.length === 0) {
    return {
      productCode: null,
      error: {
        code: "PRODUCT_NOT_FOUND" as const,
        field,
        message: `${label}「${value}」を保証商品へ解決できません。`,
        currentValue: value,
      },
    };
  }
  if (candidates.length > 1) {
    return {
      productCode: null,
      error: {
        code: "PRODUCT_AMBIGUOUS" as const,
        field,
        message: `${label}「${value}」が複数の商品コードに一致します。`,
        currentValue: value,
      },
    };
  }
  return { productCode: candidates[0], error: null };
}

function deduplicateTargets(targets: PlanProductTarget[]) {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = normalizePlanProductKey(target.productCode);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function expandPlanProductTargets(input: {
  planCode: unknown;
  waterHeaterType: unknown;
  additionalEquipment?: unknown;
  additionalQuantity?: unknown;
}) {
  const errors: PlanProductRuleError[] = [];
  const targets: PlanProductTarget[] = [];
  const rawPlanCode = clean(input.planCode);
  const planCode = resolvePlanCode(input.planCode);
  if (!rawPlanCode) {
    errors.push({
      code: "PLAN_CODE_REQUIRED",
      field: "plan_code",
      message: "プランコードが入力されていません。",
      currentValue: null,
    });
  } else if (!planCode) {
    errors.push({
      code: "PLAN_CODE_INVALID",
      field: "plan_code",
      message: `プランコード「${rawPlanCode}」はA/Bではありません。`,
      currentValue: rawPlanCode,
    });
  }

  const waterHeaterType = clean(input.waterHeaterType);
  if (!waterHeaterType) {
    errors.push({
      code: "WATER_HEATER_TYPE_REQUIRED",
      field: "water_heater_type",
      message: "給湯器種類が入力されていません。",
      currentValue: null,
    });
  } else {
    const resolved = resolveAlias(
      waterHeaterType,
      WATER_HEATER_ALIASES,
      "water_heater_type",
      "給湯器種類"
    );
    if (resolved.error) {
      errors.push(resolved.error);
    } else if (resolved.productCode) {
      targets.push({
        productCode: resolved.productCode,
        source: "water_heater",
        requestedValue: waterHeaterType,
      });
    }
  }

  if (planCode) {
    targets.push(...PLAN_FIXED_PRODUCTS[planCode]);
  }

  const additionalEquipment = clean(input.additionalEquipment);
  const numericAdditionalQuantity = Number(input.additionalQuantity);
  const hasAdditionalQuantity =
    Number.isFinite(numericAdditionalQuantity) && numericAdditionalQuantity > 0;
  if (additionalEquipment && !hasAdditionalQuantity) {
    errors.push({
      code: "ADDITIONAL_QUANTITY_REQUIRED",
      field: "additional_quantity",
      message: "追加機器が入力されていますが追加台数がありません。",
      currentValue:
        input.additionalQuantity === null || input.additionalQuantity === undefined
          ? null
          : Number(input.additionalQuantity),
    });
  } else if (!additionalEquipment && hasAdditionalQuantity) {
    errors.push({
      code: "ADDITIONAL_EQUIPMENT_REQUIRED",
      field: "additional_equipment",
      message: "追加台数が入力されていますが追加機器がありません。",
      currentValue: numericAdditionalQuantity,
    });
  } else if (additionalEquipment && hasAdditionalQuantity) {
    const resolved = resolveAlias(
      additionalEquipment,
      ADDITIONAL_EQUIPMENT_ALIASES,
      "additional_equipment",
      "追加機器"
    );
    if (resolved.error) {
      errors.push(resolved.error);
    } else if (resolved.productCode) {
      targets.push({
        productCode: resolved.productCode,
        source: "additional",
        requestedValue: additionalEquipment,
      });
    }
  }

  return {
    planCode,
    targets: deduplicateTargets(targets),
    errors,
  };
}

export function resolvePlanProducts(input: {
  planCode: unknown;
  waterHeaterType: unknown;
  additionalEquipment?: unknown;
  additionalQuantity?: unknown;
  products: PlanProductMasterRow[];
}): PlanProductExpansionResult {
  const expanded = expandPlanProductTargets(input);
  const errors = [...expanded.errors];
  const resolved: ResolvedPlanProduct[] = [];

  for (const target of expanded.targets) {
    const targetKey = normalizePlanProductKey(target.productCode);
    const matches = input.products.filter(
      (product) => normalizePlanProductKey(product.product_code) === targetKey
    );
    if (matches.length === 0) {
      errors.push({
        code: "PRODUCT_NOT_FOUND",
        field: "product_code",
        message: `対象商品${target.productCode}が商品マスタに見つかりません。`,
        currentValue: target.requestedValue,
        productCode: target.productCode,
      });
      continue;
    }
    if (matches.length > 1) {
      errors.push({
        code: "PRODUCT_AMBIGUOUS",
        field: "product_code",
        message: `対象商品${target.productCode}が商品マスタに複数登録されています。`,
        currentValue: target.requestedValue,
        productCode: target.productCode,
      });
      continue;
    }
    if (matches[0].is_active !== true) {
      errors.push({
        code: "PRODUCT_INACTIVE",
        field: "product_code",
        message: `対象商品${target.productCode}は無効です。`,
        currentValue: target.requestedValue,
        productCode: target.productCode,
      });
      continue;
    }
    resolved.push({ target, product: matches[0] });
  }

  return {
    planCode: expanded.planCode,
    targets: expanded.targets,
    resolved,
    errors,
  };
}
