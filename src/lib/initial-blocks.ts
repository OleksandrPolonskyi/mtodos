import type { BlockIconName, BlockType } from "@/types/domain";

export interface InitialBlockSeed {
  title: string;
  type: BlockType;
  color: string;
  iconName: BlockIconName;
  x: number;
  y: number;
}

export const initialBlockPreset: InitialBlockSeed[] = [
  { title: "Website", type: "website", color: "#0284C7", iconName: "globe", x: 80, y: 80 },
  { title: "Suppliers", type: "suppliers", color: "#16A34A", iconName: "truck", x: 380, y: 80 },
  { title: "Ads", type: "ads", color: "#DB2777", iconName: "megaphone", x: 680, y: 80 },
  { title: "Orders", type: "orders", color: "#D97706", iconName: "package", x: 80, y: 300 },
  { title: "Content", type: "content", color: "#7C3AED", iconName: "pen", x: 380, y: 300 },
  { title: "Finance", type: "finance", color: "#0F766E", iconName: "wallet", x: 680, y: 300 },
  { title: "Support", type: "support", color: "#334155", iconName: "headset", x: 80, y: 520 },
  {
    title: "Operations",
    type: "operations",
    color: "#9333EA",
    iconName: "gear",
    x: 380,
    y: 520
  }
];
