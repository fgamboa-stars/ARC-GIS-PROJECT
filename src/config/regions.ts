/** U.S. state lookup and the plain-language regions used by automated findings. */

export type Region =
  | "Pacific Northwest"
  | "California"
  | "Southwest"
  | "Mountain West"
  | "Northern Plains"
  | "Southern Plains"
  | "Upper Midwest"
  | "Great Lakes"
  | "Ohio Valley"
  | "Northeast"
  | "Mid-Atlantic"
  | "Southeast"
  | "Alaska"
  | "Hawaii"
  | "Canada";

const STATES: readonly [abbr: string, name: string, region: Region][] = [
  ["AL", "Alabama", "Southeast"],
  ["AK", "Alaska", "Alaska"],
  ["AZ", "Arizona", "Southwest"],
  ["AR", "Arkansas", "Southern Plains"],
  ["CA", "California", "California"],
  ["CO", "Colorado", "Mountain West"],
  ["CT", "Connecticut", "Northeast"],
  ["DE", "Delaware", "Mid-Atlantic"],
  ["DC", "District of Columbia", "Mid-Atlantic"],
  ["FL", "Florida", "Southeast"],
  ["GA", "Georgia", "Southeast"],
  ["HI", "Hawaii", "Hawaii"],
  ["ID", "Idaho", "Mountain West"],
  ["IL", "Illinois", "Great Lakes"],
  ["IN", "Indiana", "Great Lakes"],
  ["IA", "Iowa", "Upper Midwest"],
  ["KS", "Kansas", "Northern Plains"],
  ["KY", "Kentucky", "Ohio Valley"],
  ["LA", "Louisiana", "Southern Plains"],
  ["ME", "Maine", "Northeast"],
  ["MD", "Maryland", "Mid-Atlantic"],
  ["MA", "Massachusetts", "Northeast"],
  ["MI", "Michigan", "Great Lakes"],
  ["MN", "Minnesota", "Upper Midwest"],
  ["MS", "Mississippi", "Southeast"],
  ["MO", "Missouri", "Upper Midwest"],
  ["MT", "Montana", "Mountain West"],
  ["NE", "Nebraska", "Northern Plains"],
  ["NV", "Nevada", "Southwest"],
  ["NH", "New Hampshire", "Northeast"],
  ["NJ", "New Jersey", "Mid-Atlantic"],
  ["NM", "New Mexico", "Southwest"],
  ["NY", "New York", "Northeast"],
  ["NC", "North Carolina", "Southeast"],
  ["ND", "North Dakota", "Northern Plains"],
  ["OH", "Ohio", "Ohio Valley"],
  ["OK", "Oklahoma", "Southern Plains"],
  ["OR", "Oregon", "Pacific Northwest"],
  ["PA", "Pennsylvania", "Mid-Atlantic"],
  ["RI", "Rhode Island", "Northeast"],
  ["SC", "South Carolina", "Southeast"],
  ["SD", "South Dakota", "Northern Plains"],
  ["TN", "Tennessee", "Ohio Valley"],
  ["TX", "Texas", "Southern Plains"],
  ["UT", "Utah", "Mountain West"],
  ["VT", "Vermont", "Northeast"],
  ["VA", "Virginia", "Mid-Atlantic"],
  ["WA", "Washington", "Pacific Northwest"],
  ["WV", "West Virginia", "Ohio Valley"],
  ["WI", "Wisconsin", "Upper Midwest"],
  ["WY", "Wyoming", "Mountain West"],
  ["PR", "Puerto Rico", "Southeast"],
];

const BY_ABBR = new Map(STATES.map(([a, n, r]) => [a, { abbr: a, name: n, region: r }]));
const BY_NAME = new Map(STATES.map(([a, n, r]) => [n.toLowerCase(), { abbr: a, name: n, region: r }]));

export interface StateInfo {
  abbr: string;
  name: string;
  region: Region;
}

/** Accepts "OR", "US-OR" or "Oregon". */
export function lookupState(value: string | null | undefined): StateInfo | null {
  if (!value) return null;
  const v = value.trim().replace(/^US-/i, "");
  return BY_ABBR.get(v.toUpperCase()) ?? BY_NAME.get(v.toLowerCase()) ?? null;
}

export function regionForState(value: string | null | undefined): Region | null {
  return lookupState(value)?.region ?? null;
}

/** Canadian province codes used by CIFFC agency codes. */
export const PROVINCES: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
  PC: "Parks Canada",
};
