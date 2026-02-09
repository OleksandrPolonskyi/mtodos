import {
  BarChart3,
  Cog,
  Globe2,
  Headset,
  Megaphone,
  PackageCheck,
  PenSquare,
  Shapes,
  Store,
  Truck,
  Users,
  Wallet,
  type LucideIcon
} from "lucide-react";
import type { BlockIconName, BlockType, BusinessBlock } from "@/types/domain";

export interface BlockIconOption {
  value: BlockIconName;
  label: string;
  icon: LucideIcon;
}

export const blockIconOptions: BlockIconOption[] = [
  { value: "globe", label: "Сайт", icon: Globe2 },
  { value: "truck", label: "Логістика", icon: Truck },
  { value: "megaphone", label: "Маркетинг", icon: Megaphone },
  { value: "package", label: "Замовлення", icon: PackageCheck },
  { value: "pen", label: "Контент", icon: PenSquare },
  { value: "wallet", label: "Фінанси", icon: Wallet },
  { value: "headset", label: "Підтримка", icon: Headset },
  { value: "gear", label: "Операції", icon: Cog },
  { value: "store", label: "Магазин", icon: Store },
  { value: "chart", label: "Аналітика", icon: BarChart3 },
  { value: "users", label: "Команда", icon: Users },
  { value: "shapes", label: "Кастом", icon: Shapes }
];

const blockIconOptionMap = new Map(blockIconOptions.map((option) => [option.value, option]));

const blockTypeIconFallback: Record<BlockType, BlockIconName> = {
  website: "globe",
  suppliers: "truck",
  ads: "megaphone",
  orders: "package",
  content: "pen",
  finance: "wallet",
  support: "headset",
  operations: "gear",
  custom: "shapes"
};

export const getDefaultIconNameForBlockType = (type: BlockType): BlockIconName => {
  return blockTypeIconFallback[type] ?? "shapes";
};

export const resolveBlockIconName = (
  block: Pick<BusinessBlock, "type" | "iconName">
): BlockIconName => {
  return block.iconName ?? getDefaultIconNameForBlockType(block.type);
};

export const getBlockIconOption = (iconName: BlockIconName): BlockIconOption => {
  return blockIconOptionMap.get(iconName) ?? blockIconOptions[blockIconOptions.length - 1];
};
