// Configurable document templates for Bank NOC, Builder NOC, etc.
// Highly extensible to allow adding Possession Letters, Tripartite Agreements, etc. later.

export const documentTemplates = {
  bank_noc: {
    id: "bank_noc",
    name: "Bank NOC",
    subject: (data) => `No Objection Certificate for Home Loan - Unit ${data.unit_number || "—"}`,
    salutation: "To,\nThe Branch Manager,\n{{bank_name}},\n{{branch_name}}",
    bodyIntro: "Dear Sir/Madam,\n\nWe refer to the booking of the property details below and confirm that we have no objection to the purchaser mortgaging the property in favour of your bank for securing a home loan.",
    clauses: [
      "The above property has been allotted to the purchaser as per the unit allocation terms.",
      "The Agreement Value of the property is {{agreement_value}}, and the total amount received to date is {{amount_received}}.",
      "The title of the project land and the property is clear and free from any encumbrances.",
      "The Developer has no objection to the purchaser mortgaging the property in favour of the Bank.",
      "The Developer confirms that the said unit is not already mortgaged or charged to any other financial institution.",
      "Any nomination or transfer in favour of the financing Bank shall be accepted upon request as per company policies.",
      "The Developer will notify the cooperative society or apartment association once formed regarding the Bank's lien.",
      "All future disbursement payments by the Bank should be made directly to the Developer's designated account.",
      "In the event of cancellation of the booking, the refund of the bank loan portion shall be disbursed directly to the financing Bank."
    ]
  },
  builder_noc: {
    id: "builder_noc",
    name: "Builder NOC",
    subject: (data) => `Builder Consent and Lien Permission - Unit ${data.unit_number || "—"}`,
    salutation: "To,\nThe Branch Manager,\n{{bank_name}},\n{{branch_name}}",
    bodyIntro: "Dear Sir/Madam,\n\nThis is to certify that we have registered the home loan request of the purchaser for the unit details listed below, and we grant our permission to create a mortgage charge in your bank's favour.",
    clauses: [
      "The Developer has executed the agreement for sale in favour of the purchaser for Unit {{unit_number}}.",
      "We confirm the basic sale value is {{agreement_value}} and we have received {{amount_received}} till date.",
      "We undertake to deliver possession of the completed unit directly to the purchaser or the Bank as per agreement guidelines.",
      "We confirm that the building plans are approved by competent local development authorities.",
      "The Developer agrees to register the mortgage charge in our unit booking ledger.",
      "In case of any default or cancellation, we will coordinate with the Bank to secure the outstanding loan amount before processing refunds."
    ]
  }
};

export const companyBranding = {
  name: "PropFin Developer Projects Private Limited",
  registeredOffice: "PropFin Tech Park, Survey No. 44, Balewadi High Street, Pune - 411045",
  corporateOffice: "Unit 802, Signature Towers, Bandra Kurla Complex, Mumbai - 400051",
  cin: "U45202PN2026PTC228190",
  website: "www.propfin.com",
  phone: "+91 20 6789 0000",
  email: "support@propfin.com"
};

export function formatInrCurrency(value) {
  const num = Number(value || 0);
  // Format to Indian Currency format: e.g. ₹3,46,71,721.00
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(num);
}

export function formatDateString(dateVal) {
  if (!dateVal) return "—";
  try {
    const d = new Date(dateVal);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (err) {
    return String(dateVal);
  }
}
