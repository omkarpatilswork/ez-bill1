import {
  Briefcase, Car, Fuel, Gamepad2, GraduationCap, Hotel, MoreHorizontal, ParkingCircle,
  Pill, Plane, Repeat, ShoppingBag, ShoppingBasket, Utensils, Zap, type LucideIcon,
} from 'lucide-react';
import type { BroadCategory } from '@/lib/bill-category';

export const CATEGORY_ICON: Record<BroadCategory, LucideIcon> = {
  'Food & Dining': Utensils, Grocery: ShoppingBasket, Fuel, 'Toll & Parking': ParkingCircle,
  Shopping: ShoppingBag, Subscriptions: Repeat, Travel: Plane, Transport: Car,
  'Hotel & Stay': Hotel, Medical: Pill, Entertainment: Gamepad2, Education: GraduationCap,
  Utilities: Zap, Office: Briefcase, Other: MoreHorizontal,
};
