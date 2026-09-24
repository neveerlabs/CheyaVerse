"use client";

import type { LucideIcon } from "lucide-react";
import {
  Sparkles, Star, Heart, Zap, Flame, Crown, Rocket, Moon, Sun, Cloud,
  Snowflake, Ghost, Skull, Cat, Dog, Bird, Fish, Flower, Leaf, TreePine,
  Mountain, Waves, Umbrella, Coffee, Pizza, Cake, IceCream, Gamepad2,
  Music, Headphones, Camera, Palette, Brush, Feather, Book, Gift,
  Trophy, Target, Compass, Plane, Globe, Atom, Lightbulb, Brain, Eye,
  Gem, Anchor, MapPin,
} from "lucide-react";

export const COVER_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, star: Star, heart: Heart, zap: Zap, flame: Flame,
  crown: Crown, rocket: Rocket, moon: Moon, sun: Sun, cloud: Cloud,
  snowflake: Snowflake, ghost: Ghost, skull: Skull, cat: Cat, dog: Dog,
  bird: Bird, fish: Fish, flower: Flower, leaf: Leaf, tree: TreePine,
  mountain: Mountain, waves: Waves, umbrella: Umbrella, coffee: Coffee,
  pizza: Pizza, cake: Cake, icecream: IceCream, gamepad: Gamepad2,
  music: Music, headphones: Headphones, camera: Camera, palette: Palette,
  brush: Brush, feather: Feather, book: Book, gift: Gift, trophy: Trophy,
  target: Target, compass: Compass, plane: Plane, globe: Globe, atom: Atom,
  lightbulb: Lightbulb, brain: Brain, eye: Eye, gem: Gem, anchor: Anchor,
  map: MapPin,
};

export const COVER_ICON_NAMES = Object.keys(COVER_ICONS);

export function CoverIcon({
  name, size = 96, className,
}: { name: string; size?: number; className?: string }) {
  const Icon = COVER_ICONS[name];
  if (!Icon) return null;
  return <Icon size={size} strokeWidth={1.2} className={className} />;
}
