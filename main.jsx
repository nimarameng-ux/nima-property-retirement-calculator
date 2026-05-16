import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import logo from "./logo.png";

const money = (value) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const pct = (value) => `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;
const toNum = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const futureValue = (value, growthPct, years) => value * Math.pow(1 + growthPct / 100, years);

function pmt(principal, annualRatePct, years) {
  const monthlyRate = annualRatePct / 100 / 12;
  const months = years * 12;
  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

function estimatedLmi(purchasePrice, propertyLoan, manualOverride) {
  const override = toNum(manualOverride);
  if (override > 0) return override;
  if (purchasePrice <= 0) return 0;
  const lvr = (propertyLoan / purchasePrice) * 100;
  if (lvr <= 80) return 0;
  let rate = 0;
  if (lvr <= 85) rate = 0.012;
  else if (lvr <= 90) rate = 0.022;
  else if (lvr <= 95) rate = 0.038;
  else rate = 0.05;
  return propertyLoan * rate;
}

function estimateAnnualLandTax({ state, landValue, manualOverride }) {
  const override = toNum(manualOverride);
  if (override > 0) return override;
  const lv = toNum(landValue);
  if (lv <= 0) return 0;

  // Planning estimate only. Check the relevant State Revenue Office before purchase.
  if (state === "QLD") return 0;
  if (state === "VIC") return lv > 50000 ? Math.max(0, (lv - 50000) * 0.0065 + 500) : 0;
  if (state === "NSW") return lv > 1075000 ? Math.max(0, (lv - 1075000) * 0.016 + 100) : 0;
  if (state === "WA") return lv > 300000 ? Math.max(0, (lv - 300000) * 0.0025 + 300) : 0;
  if (state === "SA") return lv > 450000 ? Math.max(0, (lv - 450000) * 0.005 + 400) : 0;
  if (state === "ACT") return lv * 0.004;
  if (state === "TAS") return lv > 100000 ? Math.max(0, (lv - 100000) * 0.004 + 200) : 0;
  if (state === "NT") return 0;
  return 0;
}

function estimateStampDuty({ state, purchasePrice }) {
  const price = toNum(purchasePrice);
  if (price <= 0) return 0;

  // Automatic investment-property transfer duty estimate by state and purchase price.
  // Excludes concessions, foreign purchaser surcharge and special entity rules.
  if (state === "QLD") {
    if (price <= 5000) return 0;
    if (price <= 75000) return (price - 5000) * 0.015;
    if (price <= 540000) return 1050 + (price - 75000) * 0.035;
    if (price <= 1000000) return 17325 + (price - 540000) * 0.045;
    return 38025 + (price - 1000000) * 0.0575;
  }
  if (state === "NSW") {
    if (price <= 17000) return Math.max(20, price * 0.0125);
    if (price <= 37000) return 212 + (price - 17000) * 0.015;
    if (price <= 99000) return 512 + (price - 37000) * 0.0175;
    if (price <= 372000) return 1597 + (price - 99000) * 0.035;
    if (price <= 1240000) return 11152 + (price - 372000) * 0.045;
    if (price <= 3721000) return 50212 + (price - 1240000) * 0.055;
    return 186667 + (price - 3721000) * 0.07;
  }
  if (state === "VIC") {
    if (price <= 25000) return price * 0.014;
    if (price <= 130000) return 350 + (price - 25000) * 0.024;
    if (price <= 960000) return 2870 + (price - 130000) * 0.06;
    if (price <= 2000000) return price * 0.055;
    return 110000 + (price - 2000000) * 0.065;
  }
  if (state === "WA") {
    if (price <= 120000) return price * 0.019;
    if (price <= 150000) return 2280 + (price - 120000) * 0.0285;
    if (price <= 360000) return 3135 + (price - 150000) * 0.038;
    if (price <= 725000) return 11115 + (price - 360000) * 0.0475;
    return 28453 + (price - 725000) * 0.0515;
  }
  if (state === "SA") return price * 0.055;
  if (state === "TAS") return price * 0.045;
  if (state === "ACT") return price * 0.05;
  if (state === "NT") return price * 0.05;
  return price * 0.05;
}

function oldCgtTax({ purchasePrice, salePrice, buyingCosts, sellingCosts, marginalTaxRatePct }) {
  const capitalGain = Math.max(0, salePrice - purchasePrice - buyingCosts - sellingCosts);
  const taxableGain = capitalGain * 0.5;
  const tax = taxableGain * (marginalTaxRatePct / 100);
  return { capitalGain, taxableGain, tax };
}

function newIndexedCgtTax({ purchasePrice, salePrice, buyingCosts, sellingCosts, inflationPct, marginalTaxRatePct, minimumTaxRatePct, yearsHeld, deferredLoss }) {
  const indexedCostBase = (purchasePrice + buyingCosts) * Math.pow(1 + inflationPct / 100, yearsHeld);
  const netSaleProceeds = salePrice - sellingCosts;
  const realGainBeforeDeferredLoss = Math.max(0, netSaleProceeds - indexedCostBase);
  const realGain = Math.max(0, realGainBeforeDeferredLoss - deferredLoss);
  const effectiveRate = Math.max(minimumTaxRatePct, marginalTaxRatePct);
  const tax = realGain * (effectiveRate / 100);
  return { indexedCostBase, netSaleProceeds, realGainBeforeDeferredLoss, realGain, effectiveRate, tax };
}

function blendedTaxRate(nimaOwnershipPct, nimaRatePct, azadehRatePct) {
  const nimaShare = toNum(nimaOwnershipPct) / 100;
  const azadehShare = Math.max(0, 1 - nimaShare);
  return nimaShare * toNum(nimaRatePct) + azadehShare * toNum(azadehRatePct);
}

function calculateScenario({ data, scenarioType, horizonYears }) {
  const state = data.state || "QLD";
  const purchasePrice = toNum(data.purchasePrice);
  const startingValue = toNum(data.currentValue);
  const targetLvrPct = toNum(data.targetLvrPct || "80.00");
  const manualPropertyLoan = toNum(data.loanAmount || data.loanCba || "0.00");
  const autoCalculateLoan = data.autoCalculateLoan === "yes";
  const propertyLoan = autoCalculateLoan && scenarioType !== "old" ? purchasePrice * (targetLvrPct / 100) : manualPropertyLoan;

  const cashoutLoan = toNum(data.cashoutLoanBalance || data.loanBankwest || "0.00");
  const propertyRate = toNum(data.interestRate || data.rateCba || "0.00");
  const propertyTerm = toNum(data.loanTermYears || data.termCbaYears || "30.00");
  const repaymentType = data.repaymentType || data.repaymentTypeCba || "io";
  const propertyMonthlyPayment = repaymentType === "pi" ? pmt(propertyLoan, propertyRate, propertyTerm) : (propertyLoan * propertyRate) / 100 / 12;

  const cashoutRate = toNum(data.cashoutInterestRate || data.rateBankwest || "0.00");
  const cashoutMonthlyPayment = toNum(data.cashoutMonthlyRepayment || data.repaymentBankwest || "0.00") || ((cashoutLoan * cashoutRate) / 100 / 12);

  const propertyLoanLvr = purchasePrice > 0 ? (propertyLoan / purchasePrice) * 100 : 0;
  const totalStrategyDebt = propertyLoan + cashoutLoan;
  const totalStrategyDebtRatio = purchasePrice > 0 ? (totalStrategyDebt / purchasePrice) * 100 : 0;
  const depositRequired = Math.max(0, purchasePrice - propertyLoan);

  const lmi = estimatedLmi(purchasePrice, propertyLoan, data.lmiOverride);
  const lmiCapitalised = data.lmiTreatment === "capitalised";
  const upfrontLmiRequired = lmiCapitalised ? 0 : lmi;
  const totalDebtIncludingLmi = totalStrategyDebt + (lmiCapitalised ? lmi : 0);

  const stampDuty = estimateStampDuty({ state, purchasePrice });
  const otherPurchaseCosts = toNum(data.otherPurchaseCosts || data.otherBuyingCosts || "0.00");
  const totalPurchaseCosts = stampDuty + otherPurchaseCosts;
  const upfrontCashRequired = depositRequired + totalPurchaseCosts + upfrontLmiRequired;

  const weeklyRent = toNum(data.weeklyRent);
  const annualRentStart = weeklyRent * 52;
  const monthlyRentStart = annualRentStart / 12;
  const rentGrowthPct = toNum(data.rentalGrowthRate || "3.00");
  const expenseInflationPct = toNum(data.expenseInflationRate || "3.00");
  const landTaxGrowthPct = toNum(data.landTaxGrowthRate || "3.00");
  const pmPct = toNum(data.propertyManagementPct);
  const vacancyWeeks = toNum(data.vacancyWeeks || "2.00");
  const lettingFeeWeeks = toNum(data.lettingFeeWeeks || "1.00");
  const leaseRenewalFeeAnnual = toNum(data.leaseRenewalFeeAnnual || "0.00");
  const complianceAnnual = toNum(data.complianceAnnual || "250.00");
  const adminAnnual = toNum(data.adminAnnual || "300.00");
  const bankAnnualFee = toNum(data.bankAnnualFee || data.cashoutAnnualFee || data.feeBankwestAnnual || "0.00");
  const fixedCostsAnnualStart = (toNum(data.councilMonthly) + toNum(data.waterMonthly) + toNum(data.insuranceMonthly) + toNum(data.maintenanceMonthly) + toNum(data.strataMonthly || "0.00")) * 12;
  const annualLandTaxStart = estimateAnnualLandTax({ state, landValue: data.landValue, manualOverride: data.landTaxAnnualOverride });

  const purchaseDate = new Date(data.purchaseDate || "2026-06-15");
  const holdingStartDate = new Date(data.holdingStartDate || data.purchaseDate || "2026-06-15");
  const purchaseYear = purchaseDate.getFullYear();
  const buildYear = toNum(data.buildYear || "0");
  const reformCutoff = new Date("2026-05-12T19:30:00+10:00");
  const ngEndDate = new Date("2027-07-01T00:00:00+10:00");
  const isEligibleNewBuild = data.propertyClass === "newBuild" && buildYear === purchaseYear;
  const isGrandfathered = scenarioType === "old" || data.propertyClass === "grandfathered" || purchaseDate < reformCutoff;
  const isPostCutoffEstablished = !isGrandfathered && !isEligibleNewBuild && purchaseDate >= reformCutoff;
  const taxRate = scenarioType === "old" ? toNum(data.marginalTaxRate || "47.00") : blendedTaxRate(data.ownershipNimaPct, data.marginalTaxRateNima, data.marginalTaxRateAzadeh);

  let totalImmediateTaxBenefit = 0;
  let totalDeferredLoss = 0;
  let totalBurnBeforeTax = 0;
  let firstYearBurnBeforeTax = 0;
  let firstYearTaxBenefit = 0;
  let firstYearDeferredLoss = 0;
  let firstPostNgMonthlyBurnAfterTax = 0;
  let firstPostNgMonthCaptured = false;

  for (let month = 0; month < horizonYears * 12; month++) {
    const monthDate = new Date(holdingStartDate);
    monthDate.setMonth(monthDate.getMonth() + month);
    const yearFraction = month / 12;
    const monthlyRent = (annualRentStart / 12) * Math.pow(1 + rentGrowthPct / 100, yearFraction);
    const monthlyPm = monthlyRent * (pmPct / 100);
    const monthlyVacancy = (weeklyRent * vacancyWeeks / 12) * Math.pow(1 + rentGrowthPct / 100, yearFraction);
    const monthlyLetting = (weeklyRent * lettingFeeWeeks / 12) * Math.pow(1 + rentGrowthPct / 100, yearFraction);
    const monthlyFixedCosts = (fixedCostsAnnualStart / 12) * Math.pow(1 + expenseInflationPct / 100, yearFraction);
    const monthlyLandTax = (annualLandTaxStart / 12) * Math.pow(1 + landTaxGrowthPct / 100, yearFraction);
    const monthlyOtherAnnualised = (leaseRenewalFeeAnnual + complianceAnnual + adminAnnual + bankAnnualFee) / 12;
    const monthlyLoanPayments = propertyMonthlyPayment + cashoutMonthlyPayment;

    const monthlyBurnBeforeTax = Math.max(0, monthlyLoanPayments + monthlyPm + monthlyVacancy + monthlyLetting + monthlyFixedCosts + monthlyLandTax + monthlyOtherAnnualised - monthlyRent);
    const immediateNgAllowed = isGrandfathered || isEligibleNewBuild || (isPostCutoffEstablished && monthDate < ngEndDate);
    const immediateTaxBenefit = immediateNgAllowed ? monthlyBurnBeforeTax * (taxRate / 100) : 0;
    const deferredLoss = immediateNgAllowed ? 0 : monthlyBurnBeforeTax;

    totalBurnBeforeTax += monthlyBurnBeforeTax;
    totalImmediateTaxBenefit += immediateTaxBenefit;
    totalDeferredLoss += deferredLoss;

    if (month < 12) {
      firstYearBurnBeforeTax += monthlyBurnBeforeTax;
      firstYearTaxBenefit += immediateTaxBenefit;
      firstYearDeferredLoss += deferredLoss;
    }

    if (!firstPostNgMonthCaptured && isPostCutoffEstablished && monthDate >= ngEndDate) {
      firstPostNgMonthlyBurnAfterTax = monthlyBurnBeforeTax;
      firstPostNgMonthCaptured = true;
    }
  }

  const value = futureValue(startingValue, toNum(data.growthRate), horizonYears);
  const sellingCosts = toNum(data.sellingCosts || "0.00");
  const buyingCosts = totalPurchaseCosts;
  const cgt = scenarioType === "old"
    ? oldCgtTax({ purchasePrice, salePrice: value, buyingCosts, sellingCosts, marginalTaxRatePct: taxRate })
    : newIndexedCgtTax({
        purchasePrice,
        salePrice: value,
        buyingCosts,
        sellingCosts,
        inflationPct: toNum(data.inflationRate || "3.00"),
        marginalTaxRatePct: taxRate,
        minimumTaxRatePct: toNum(data.minimumCgtRate || "30.00"),
        yearsHeld: horizonYears,
        deferredLoss: totalDeferredLoss,
      });

  const cashAfterCgt = value - totalDebtIncludingLmi - sellingCosts - cgt.tax;
  const netAfterHoldingAndTaxBenefit = cashAfterCgt - totalBurnBeforeTax + totalImmediateTaxBenefit;

  return {
    state,
    purchasePrice,
    startingValue,
    autoCalculateLoan,
    targetLvrPct,
    propertyLoan,
    cashoutLoan,
    propertyLoanLvr,
    totalStrategyDebt,
    totalStrategyDebtRatio,
    depositRequired,
    lmi,
    upfrontLmiRequired,
    totalDebtIncludingLmi,
    stampDuty,
    otherPurchaseCosts,
    totalPurchaseCosts,
    upfrontCashRequired,
    monthlyRentStart,
    propertyMonthlyPayment,
    cashoutMonthlyPayment,
    annualLandTaxStart,
    firstYearBurnBeforeTax,
    firstYearMonthlyBurnAfterTax: (firstYearBurnBeforeTax - firstYearTaxBenefit) / 12,
    firstYearTaxBenefit,
    firstYearDeferredLoss,
    firstPostNgMonthlyBurnAfterTax,
    totalBurnBeforeTax,
    averageMonthlyBurnBeforeTax: totalBurnBeforeTax / horizonYears / 12,
    totalImmediateTaxBenefit,
    totalDeferredLoss,
    value,
    cgt,
    cashAfterCgt,
    netAfterHoldingAndTaxBenefit,
    taxRate,
    purchaseYear,
    buildYear,
    isEligibleNewBuild,
    isGrandfathered,
    isPostCutoffEstablished,
  };
}

function Input({ label, value, onChange, type = "number", step = "0.01", suffix = "" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input type={type} step={step} value={value} onChange={(event) => onChange(event.target.value)} />
        {suffix && <b>{suffix}</b>}
      </div>
    </label>
  );
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

function Card({ title, children }) {
  return <section className="card"><h2>{title}</h2>{children}</section>;
}

function Row({ label, value }) {
  return <div className="row"><span>{label}</span><strong>{value}</strong></div>;
}

function ScenarioTable({ rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Metric</th><th>Armstrong What-If Hold</th><th>New Purchase</th><th>Difference</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.oldValue}</td><td>{row.newValue}</td><td className="diff">{row.diff}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function App() {
  const states = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
  const [tab, setTab] = useState("summary");

  const [newDeal, setNewDeal] = useState({
    addressLine1: "",
    suburb: "",
    postcode: "",
    state: "QLD",
    purchasePrice: "800000.00",
    currentValue: "800000.00",
    purchaseDate: "2026-06-15",
    holdingStartDate: "2026-06-15",
    propertyClass: "establishedPost2026",
    buildYear: "2026",
    autoCalculateLoan: "yes",
    targetLvrPct: "80.00",
    loanAmount: "640000.00",
    interestRate: "6.24",
    loanTermYears: "30.00",
    repaymentType: "io",
    cashoutLoanBalance: "120566.68",
    cashoutInterestRate: "5.99",
    cashoutMonthlyRepayment: "743.93",
    cashoutAnnualFee: "395.00",
    lmiOverride: "0.00",
    lmiTreatment: "capitalised",
    weeklyRent: "700.00",
    propertyManagementPct: "7.00",
    vacancyWeeks: "2.00",
    lettingFeeWeeks: "1.00",
    leaseRenewalFeeAnnual: "0.00",
    complianceAnnual: "250.00",
    adminAnnual: "300.00",
    councilMonthly: "180.00",
    waterMonthly: "80.00",
    insuranceMonthly: "150.00",
    maintenanceMonthly: "150.00",
    strataMonthly: "0.00",
    landValue: "450000.00",
    landTaxAnnualOverride: "0.00",
    landTaxGrowthRate: "3.00",
    growthRate: "6.00",
    rentalGrowthRate: "3.00",
    expenseInflationRate: "3.00",
    marginalTaxRateNima: "47.00",
    marginalTaxRateAzadeh: "32.50",
    ownershipNimaPct: "50.00",
    inflationRate: "3.00",
    minimumCgtRate: "30.00",
    otherPurchaseCosts: "3000.00",
    sellingCosts: "25000.00",
  });

  const [armstrong, setArmstrong] = useState({
    addressLine1: "92 Coast Side Drive",
    suburb: "Armstrong Creek",
    postcode: "3217",
    state: "VIC",
    purchaseDate: "2023-06-15",
    holdingStartDate: "2026-05-16",
    purchasePrice: "619000.00",
    currentValue: "690000.00",
    propertyClass: "grandfathered",
    autoCalculateLoan: "no",
    loanCba: "536100.00",
    rateCba: "6.25",
    repaymentCba: "2840.56",
    termCbaYears: "29.25",
    repaymentTypeCba: "io",
    loanBankwest: "120566.68",
    rateBankwest: "5.99",
    repaymentBankwest: "743.93",
    termBankwestYears: "27.75",
    feeBankwestAnnual: "395.00",
    lmiOverride: "0.00",
    lmiTreatment: "capitalised",
    weeklyRent: "560.00",
    propertyManagementPct: "7.00",
    vacancyWeeks: "2.00",
    lettingFeeWeeks: "1.00",
    leaseRenewalFeeAnnual: "0.00",
    complianceAnnual: "350.00",
    adminAnnual: "300.00",
    councilMonthly: "180.00",
    waterMonthly: "80.00",
    insuranceMonthly: "150.00",
    maintenanceMonthly: "150.00",
    strataMonthly: "0.00",
    landValue: "350000.00",
    landTaxAnnualOverride: "0.00",
    landTaxGrowthRate: "3.00",
    growthRate: "6.00",
    rentalGrowthRate: "3.00",
    expenseInflationRate: "3.00",
    marginalTaxRate: "47.00",
    otherPurchaseCosts: "0.00",
    sellingCosts: "0.00",
  });

  const updateNew = (key, value) => setNewDeal((p) => ({ ...p, [key]: value }));
  const updateOld = (key, value) => setArmstrong((p) => ({ ...p, [key]: value }));

  const newModel = useMemo(() => ({
    y10: calculateScenario({ data: newDeal, scenarioType: newDeal.propertyClass === "grandfathered" ? "old" : "new", horizonYears: 10 }),
    y12: calculateScenario({ data: newDeal, scenarioType: newDeal.propertyClass === "grandfathered" ? "old" : "new", horizonYears: 12 }),
    y15: calculateScenario({ data: newDeal, scenarioType: newDeal.propertyClass === "grandfathered" ? "old" : "new", horizonYears: 15 }),
  }), [newDeal]);

  const oldModel = useMemo(() => ({
    y10: calculateScenario({ data: armstrong, scenarioType: "old", horizonYears: 10 }),
    y12: calculateScenario({ data: armstrong, scenarioType: "old", horizonYears: 12 }),
    y15: calculateScenario({ data: armstrong, scenarioType: "old", horizonYears: 15 }),
  }), [armstrong]);

  const rows = [
    ["Estimated stamp duty", oldModel.y10.stampDuty, newModel.y10.stampDuty],
    ["Total purchase costs", oldModel.y10.totalPurchaseCosts, newModel.y10.totalPurchaseCosts],
    ["Deposit required", oldModel.y10.depositRequired, newModel.y10.depositRequired],
    ["Estimated upfront cash required", oldModel.y10.upfrontCashRequired, newModel.y10.upfrontCashRequired],
    ["First modelling-year monthly burn before tax", oldModel.y10.firstYearBurnBeforeTax / 12, newModel.y10.firstYearBurnBeforeTax / 12],
    ["First modelling-year monthly burn after tax", oldModel.y10.firstYearMonthlyBurnAfterTax, newModel.y10.firstYearMonthlyBurnAfterTax],
    ["First post-July 2027 monthly burn after tax", oldModel.y10.firstYearMonthlyBurnAfterTax, newModel.y10.firstPostNgMonthlyBurnAfterTax || newModel.y10.firstYearMonthlyBurnAfterTax],
    ["Average monthly burn over 10 years", oldModel.y10.averageMonthlyBurnBeforeTax, newModel.y10.averageMonthlyBurnBeforeTax],
    ["Average monthly burn over 15 years", oldModel.y15.averageMonthlyBurnBeforeTax, newModel.y15.averageMonthlyBurnBeforeTax],
    ["Value before sale in 10 years", oldModel.y10.value, newModel.y10.value],
    ["Value before sale in 12 years", oldModel.y12.value, newModel.y12.value],
    ["Value before sale in 15 years", oldModel.y15.value, newModel.y15.value],
    ["Estimated CGT at year 15", oldModel.y15.cgt.tax, newModel.y15.cgt.tax],
    ["Deferred rental loss by year 15", oldModel.y15.totalDeferredLoss, newModel.y15.totalDeferredLoss],
    ["Cash/equity after CGT at year 15", oldModel.y15.cashAfterCgt, newModel.y15.cashAfterCgt],
    ["Net after holding cost and tax benefit at year 15", oldModel.y15.netAfterHoldingAndTaxBenefit, newModel.y15.netAfterHoldingAndTaxBenefit],
  ].map(([label, oldValue, newValue]) => ({ label, oldValue: money(oldValue), newValue: money(newValue), diff: money(newValue - oldValue) }));

  return (
    <main>
      <header className="hero">
        <div className="brand"><div className="logo"><img src={logo} alt="Nima Rahimi logo" /></div><div><p>NIMA RAHIMI</p><h1>Property Investment Calculator V3.5</h1><span>Private portfolio modelling tool — 10, 12 and 15-year comparison.</span></div></div>
        <div className="owner"><strong>Owner: Nima Rahimi</strong><span>Unauthorised copying or reuse is not permitted.</span></div>
      </header>

      <nav className="tabs">
        <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>Final Comparison</button>
        <button className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}>New Property</button>
        <button className={tab === "old" ? "active" : ""} onClick={() => setTab("old")}>Armstrong What-If Hold</button>
        <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>Formula Audit</button>
      </nav>

      {tab === "summary" && <>
        <Card title="Final Scenario Comparison"><ScenarioTable rows={rows} /><p className="note">Planning model only. Stamp duty, land tax, LMI and tax outcomes are estimates and must be independently checked before purchase.</p></Card>
        <div className="grid two"><Card title="Armstrong Snapshot"><Row label="Address" value={`${armstrong.addressLine1}, ${armstrong.suburb} ${armstrong.state} ${armstrong.postcode}`} /><Row label="Property loan LVR" value={pct(oldModel.y10.propertyLoanLvr)} /><Row label="Total strategy debt ratio" value={pct(oldModel.y10.totalStrategyDebtRatio)} /><Row label="Stamp duty" value={money(oldModel.y10.stampDuty)} /><Row label="Year 15 cash after CGT" value={money(oldModel.y15.cashAfterCgt)} /></Card><Card title="New Purchase Snapshot"><Row label="Address" value={`${newDeal.addressLine1 || "New Property"}, ${newDeal.suburb} ${newDeal.state} ${newDeal.postcode}`} /><Row label="Property loan LVR" value={pct(newModel.y10.propertyLoanLvr)} /><Row label="Total strategy debt ratio" value={pct(newModel.y10.totalStrategyDebtRatio)} /><Row label="Stamp duty" value={money(newModel.y10.stampDuty)} /><Row label="Year 15 cash after CGT" value={money(newModel.y15.cashAfterCgt)} /></Card></div>
      </>}

      {tab === "new" && <div className="grid layout"><div className="left">
        <Card title="New Property — Address"><div className="grid three"><Input label="Street Address" type="text" step="1" value={newDeal.addressLine1} onChange={(v) => updateNew("addressLine1", v)} /><Input label="Suburb" type="text" step="1" value={newDeal.suburb} onChange={(v) => updateNew("suburb", v)} /><Input label="Postcode" type="text" step="1" value={newDeal.postcode} onChange={(v) => updateNew("postcode", v)} /></div></Card>
        <Card title="New Property — Purchase, Loan and Stamp Duty"><div className="grid three"><Select label="State" value={newDeal.state} onChange={(v) => updateNew("state", v)}>{states.map(s => <option key={s}>{s}</option>)}</Select><Input label="Purchase Price" value={newDeal.purchasePrice} onChange={(v) => updateNew("purchasePrice", v)} /><Input label="Current / Starting Value" value={newDeal.currentValue} onChange={(v) => updateNew("currentValue", v)} /><Select label="Auto-Calculate Loan" value={newDeal.autoCalculateLoan} onChange={(v) => updateNew("autoCalculateLoan", v)}><option value="yes">Yes - calculate from target LVR</option><option value="no">No - manual loan</option></Select><Input label="Target LVR" value={newDeal.targetLvrPct} onChange={(v) => updateNew("targetLvrPct", v)} suffix="%" />{newDeal.autoCalculateLoan === "no" && <Input label="Manual Property Loan" value={newDeal.loanAmount} onChange={(v) => updateNew("loanAmount", v)} />}<Input label="Interest Rate" value={newDeal.interestRate} onChange={(v) => updateNew("interestRate", v)} suffix="%" /><Input label="Loan Term" value={newDeal.loanTermYears} onChange={(v) => updateNew("loanTermYears", v)} suffix="years" /><Select label="Repayment Type" value={newDeal.repaymentType} onChange={(v) => updateNew("repaymentType", v)}><option value="io">Interest Only</option><option value="pi">Principal & Interest</option></Select><Input label="Other Purchase Costs" value={newDeal.otherPurchaseCosts} onChange={(v) => updateNew("otherPurchaseCosts", v)} /></div></Card>
        <Card title="Cash-Out Loan"><div className="grid three"><Input label="Cash-Out Loan Balance" value={newDeal.cashoutLoanBalance} onChange={(v) => updateNew("cashoutLoanBalance", v)} /><Input label="Cash-Out Rate" value={newDeal.cashoutInterestRate} onChange={(v) => updateNew("cashoutInterestRate", v)} suffix="%" /><Input label="Cash-Out Monthly Repayment" value={newDeal.cashoutMonthlyRepayment} onChange={(v) => updateNew("cashoutMonthlyRepayment", v)} /><Input label="Cash-Out Annual Fee" value={newDeal.cashoutAnnualFee} onChange={(v) => updateNew("cashoutAnnualFee", v)} /></div></Card>
        <Card title="Rent and Holding Costs"><div className="grid three"><Input label="Weekly Rent" value={newDeal.weeklyRent} onChange={(v) => updateNew("weeklyRent", v)} /><Input label="Property Management" value={newDeal.propertyManagementPct} onChange={(v) => updateNew("propertyManagementPct", v)} suffix="%" /><Input label="Vacancy Weeks / Year" value={newDeal.vacancyWeeks} onChange={(v) => updateNew("vacancyWeeks", v)} /><Input label="Letting Fee Weeks / Year" value={newDeal.lettingFeeWeeks} onChange={(v) => updateNew("lettingFeeWeeks", v)} /><Input label="Council Monthly" value={newDeal.councilMonthly} onChange={(v) => updateNew("councilMonthly", v)} /><Input label="Water Monthly" value={newDeal.waterMonthly} onChange={(v) => updateNew("waterMonthly", v)} /><Input label="Insurance Monthly" value={newDeal.insuranceMonthly} onChange={(v) => updateNew("insuranceMonthly", v)} /><Input label="Maintenance Monthly" value={newDeal.maintenanceMonthly} onChange={(v) => updateNew("maintenanceMonthly", v)} /><Input label="Strata / Body Corp Monthly" value={newDeal.strataMonthly} onChange={(v) => updateNew("strataMonthly", v)} /><Input label="Compliance Annual" value={newDeal.complianceAnnual} onChange={(v) => updateNew("complianceAnnual", v)} /><Input label="Admin / Accounting Annual" value={newDeal.adminAnnual} onChange={(v) => updateNew("adminAnnual", v)} /><Input label="Land Value" value={newDeal.landValue} onChange={(v) => updateNew("landValue", v)} /><Input label="Land Tax Override, 0 = auto" value={newDeal.landTaxAnnualOverride} onChange={(v) => updateNew("landTaxAnnualOverride", v)} /></div></Card>
        <Card title="Growth and Tax"><div className="grid three"><Input label="Purchase Date" type="date" step="1" value={newDeal.purchaseDate} onChange={(v) => updateNew("purchaseDate", v)} /><Input label="Holding Start Date" type="date" step="1" value={newDeal.holdingStartDate} onChange={(v) => updateNew("holdingStartDate", v)} /><Select label="Property Classification" value={newDeal.propertyClass} onChange={(v) => updateNew("propertyClass", v)}><option value="establishedPost2026">Established Post-2026</option><option value="newBuild">Brand New - Built Same Year</option><option value="grandfathered">Grandfathered</option></Select><Input label="Year Built" value={newDeal.buildYear} onChange={(v) => updateNew("buildYear", v)} step="1" /><Input label="Growth Rate" value={newDeal.growthRate} onChange={(v) => updateNew("growthRate", v)} suffix="%" /><Input label="Rental Growth" value={newDeal.rentalGrowthRate} onChange={(v) => updateNew("rentalGrowthRate", v)} suffix="%" /><Input label="Nima Tax Rate" value={newDeal.marginalTaxRateNima} onChange={(v) => updateNew("marginalTaxRateNima", v)} suffix="%" /><Input label="Azadeh Tax Rate" value={newDeal.marginalTaxRateAzadeh} onChange={(v) => updateNew("marginalTaxRateAzadeh", v)} suffix="%" /><Input label="Nima Ownership" value={newDeal.ownershipNimaPct} onChange={(v) => updateNew("ownershipNimaPct", v)} suffix="%" /><Input label="CGT Inflation" value={newDeal.inflationRate} onChange={(v) => updateNew("inflationRate", v)} suffix="%" /><Input label="Minimum CGT Tax Floor" value={newDeal.minimumCgtRate} onChange={(v) => updateNew("minimumCgtRate", v)} suffix="%" /><Input label="Selling Costs" value={newDeal.sellingCosts} onChange={(v) => updateNew("sellingCosts", v)} /></div></Card>
      </div><div className="right"><Card title="New Purchase Summary"><Row label="Calculated property loan" value={money(newModel.y10.propertyLoan)} /><Row label="Deposit required" value={money(newModel.y10.depositRequired)} /><Row label="Automatic stamp duty" value={money(newModel.y10.stampDuty)} /><Row label="Total purchase costs" value={money(newModel.y10.totalPurchaseCosts)} /><Row label="Upfront cash required" value={money(newModel.y10.upfrontCashRequired)} /><Row label="Property loan LVR" value={pct(newModel.y10.propertyLoanLvr)} /><Row label="Total strategy debt ratio" value={pct(newModel.y10.totalStrategyDebtRatio)} /><Row label="First modelling-year after-tax burn" value={money(newModel.y10.firstYearMonthlyBurnAfterTax)} /><Row label="Post-July 2027 after-tax burn" value={money(newModel.y10.firstPostNgMonthlyBurnAfterTax || newModel.y10.firstYearMonthlyBurnAfterTax)} /><Row label="Deferred loss by year 15" value={money(newModel.y15.totalDeferredLoss)} /><Row label="Brand-new NG test" value={newModel.y10.isEligibleNewBuild ? "Pass" : "Not eligible"} /></Card></div></div>}

      {tab === "old" && <div className="grid layout"><div className="left"><Card title="Armstrong Creek — Address"><div className="grid three"><Input label="Street Address" type="text" step="1" value={armstrong.addressLine1} onChange={(v) => updateOld("addressLine1", v)} /><Input label="Suburb" type="text" step="1" value={armstrong.suburb} onChange={(v) => updateOld("suburb", v)} /><Input label="Postcode" type="text" step="1" value={armstrong.postcode} onChange={(v) => updateOld("postcode", v)} /></div></Card><Card title="Armstrong What-If Hold Inputs"><div className="grid three"><Select label="State" value={armstrong.state} onChange={(v) => updateOld("state", v)}>{states.map(s => <option key={s}>{s}</option>)}</Select><Input label="Original Purchase Date" type="date" step="1" value={armstrong.purchaseDate} onChange={(v) => updateOld("purchaseDate", v)} /><Input label="Holding Start Date" type="date" step="1" value={armstrong.holdingStartDate} onChange={(v) => updateOld("holdingStartDate", v)} /><Input label="Original Purchase Price" value={armstrong.purchasePrice} onChange={(v) => updateOld("purchasePrice", v)} /><Input label="Current / Starting Value" value={armstrong.currentValue} onChange={(v) => updateOld("currentValue", v)} /><Input label="Growth Rate" value={armstrong.growthRate} onChange={(v) => updateOld("growthRate", v)} suffix="%" /><Input label="Weekly Rent" value={armstrong.weeklyRent} onChange={(v) => updateOld("weeklyRent", v)} /><Input label="Property Management" value={armstrong.propertyManagementPct} onChange={(v) => updateOld("propertyManagementPct", v)} suffix="%" /><Input label="Vacancy Weeks" value={armstrong.vacancyWeeks} onChange={(v) => updateOld("vacancyWeeks", v)} /><Input label="Letting Fee Weeks" value={armstrong.lettingFeeWeeks} onChange={(v) => updateOld("lettingFeeWeeks", v)} /><Input label="Council Monthly" value={armstrong.councilMonthly} onChange={(v) => updateOld("councilMonthly", v)} /><Input label="Water Monthly" value={armstrong.waterMonthly} onChange={(v) => updateOld("waterMonthly", v)} /><Input label="Insurance Monthly" value={armstrong.insuranceMonthly} onChange={(v) => updateOld("insuranceMonthly", v)} /><Input label="Maintenance Monthly" value={armstrong.maintenanceMonthly} onChange={(v) => updateOld("maintenanceMonthly", v)} /><Input label="Land Value" value={armstrong.landValue} onChange={(v) => updateOld("landValue", v)} /><Input label="Land Tax Override, 0 = auto" value={armstrong.landTaxAnnualOverride} onChange={(v) => updateOld("landTaxAnnualOverride", v)} /></div></Card><Card title="Armstrong Loans"><div className="grid three"><Input label="CBA Loan Balance" value={armstrong.loanCba} onChange={(v) => updateOld("loanCba", v)} /><Input label="CBA Rate" value={armstrong.rateCba} onChange={(v) => updateOld("rateCba", v)} suffix="%" /><Input label="CBA Monthly Repayment" value={armstrong.repaymentCba} onChange={(v) => updateOld("repaymentCba", v)} /><Input label="Bankwest Loan Balance" value={armstrong.loanBankwest} onChange={(v) => updateOld("loanBankwest", v)} /><Input label="Bankwest Rate" value={armstrong.rateBankwest} onChange={(v) => updateOld("rateBankwest", v)} suffix="%" /><Input label="Bankwest Monthly Repayment" value={armstrong.repaymentBankwest} onChange={(v) => updateOld("repaymentBankwest", v)} /><Input label="Bankwest Annual Fee" value={armstrong.feeBankwestAnnual} onChange={(v) => updateOld("feeBankwestAnnual", v)} /><Input label="Other Purchase Costs" value={armstrong.otherPurchaseCosts} onChange={(v) => updateOld("otherPurchaseCosts", v)} /><Input label="Selling Costs" value={armstrong.sellingCosts} onChange={(v) => updateOld("sellingCosts", v)} /><Input label="Marginal Tax Rate" value={armstrong.marginalTaxRate} onChange={(v) => updateOld("marginalTaxRate", v)} suffix="%" /></div></Card></div><div className="right"><Card title="Armstrong Summary"><Row label="Total loan balance" value={money(oldModel.y10.totalStrategyDebt)} /><Row label="Automatic stamp duty" value={money(oldModel.y10.stampDuty)} /><Row label="Property loan LVR" value={pct(oldModel.y10.propertyLoanLvr)} /><Row label="Total strategy debt ratio" value={pct(oldModel.y10.totalStrategyDebtRatio)} /><Row label="First modelling-year before-tax burn" value={money(oldModel.y10.firstYearBurnBeforeTax / 12)} /><Row label="First modelling-year after-tax burn" value={money(oldModel.y10.firstYearMonthlyBurnAfterTax)} /><Row label="Year 15 cash after CGT" value={money(oldModel.y15.cashAfterCgt)} /></Card></div></div>}

      {tab === "audit" && <Card title="Formula Audit"><ul className="audit"><li>New property loan = Purchase Price × Target LVR when auto loan is ON.</li><li>Cash-out loan is kept separate and included in total strategy debt and monthly burn.</li><li>Stamp duty is automatic from State + Purchase Price and included in upfront cash and CGT cost base.</li><li>Post-12/05/2026 established purchases receive immediate negative gearing only until 01/07/2027. After that, losses become deferred.</li><li>Brand-new exception only passes when Property Classification is Brand New and Year Built equals Purchase Year.</li><li>Armstrong is modelled as a what-if hold from the Holding Start Date, but original purchase date remains for grandfathered tax/CGT treatment.</li><li>Land tax and LMI are estimates; keep independent verification before purchase.</li></ul></Card>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
