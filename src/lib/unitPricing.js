export function resolvePricingField(
  unitValue,
  projectDefault,
  fallback = 0,
  { treatZeroAsUnset = false } = {},
) {
  const hasUnitValue = unitValue != null && unitValue !== "";
  const unitNum = hasUnitValue ? Number(unitValue) : null;

  if (hasUnitValue && (!treatZeroAsUnset || unitNum !== 0)) {
    return unitNum;
  }
  if (projectDefault != null && projectDefault !== "") {
    return Number(projectDefault);
  }
  if (hasUnitValue) {
    return unitNum;
  }
  return Number(fallback);
}

/**
 * Unit pricing: discount reduces gross BSV (SBA × rate), CAIC is added to form
 * agreement value, GST applies on agreement value, then maintenance deposit is added.
 */
export function calculateUnitPricing({
  sba,
  rate_per_sqft,
  caic_charges = 0,
  maintenance_deposit = 300000,
  discount_per_sqft = 0,
  discount = 0,
  gst_rate = 5,
}) {
  const gross_bsv = Number(sba) * Number(rate_per_sqft);
  const discountFromSba = Math.max(0, Number(discount_per_sqft) || 0) * Number(sba);
  const discountAmount =
    discountFromSba > 0 ? discountFromSba : Math.max(0, Number(discount) || 0);
  const net_bsv = Math.max(0, gross_bsv - discountAmount);
  const caicAmount = Number(caic_charges) || 0;
  const agreement_value = net_bsv + caicAmount;
  const gstRate = Number(gst_rate) || 5;
  const gst_amount = agreement_value * (gstRate / 100);
  const total_sale_value =
    agreement_value + gst_amount + Number(maintenance_deposit);

  return {
    gross_bsv: gross_bsv.toFixed(2),
    discount_per_sqft: (Number(discount_per_sqft) || 0).toFixed(2),
    discount: discountAmount.toFixed(2),
    basic_sale_value: agreement_value.toFixed(2),
    net_bsv: net_bsv.toFixed(2),
    gst_rate: gstRate.toFixed(2),
    gst_amount: gst_amount.toFixed(2),
    maintenance_deposit: Number(maintenance_deposit).toFixed(2),
    caic_charges: Number(caic_charges).toFixed(2),
    total_sale_value: total_sale_value.toFixed(2),
  };
}
