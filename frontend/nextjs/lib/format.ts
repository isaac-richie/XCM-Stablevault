import { formatEther, formatUnits, parseEther } from "ethers";

export function formatToken(value: bigint | null | undefined, digits = 4) {
  if (value == null) return "--";
  const num = Number(formatEther(value));
  if (!Number.isFinite(num)) return "--";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

export function formatCompact(value: bigint | null | undefined, digits = 2) {
  if (value == null) return "--";
  const num = Number(formatEther(value));
  if (!Number.isFinite(num)) return "--";
  return Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: digits
  }).format(num);
}

export function parseAmount(value: string) {
  return parseEther(value || "0");
}

export function safeFormatUnits(value: bigint | null | undefined, decimals = 18) {
  if (value == null) return "--";
  return formatUnits(value, decimals);
}

export function shortAddress(value: string | null | undefined) {
  if (!value) return "--";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
