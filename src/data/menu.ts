import brownieImg from "@/assets/brownie.jpg";
import burgerImg from "@/assets/burger.jpg";
import friesImg from "@/assets/fries.jpg";
import fruitBowlImg from "@/assets/fruit-bowl.jpg";
import pizzaImg from "@/assets/pizza.jpg";
import sandwichImg from "@/assets/sandwich.jpg";
import menuSpreadImg from "@/assets/menu-spread.jpg";

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: "Coffee & Drinks" | "Bakery & Desserts" | "Artisanal Mains" | "Bites & Sides" | "Fresh & Bowls";
  tag?: string;
  image?: string;
  prepTimeMinutes: number; // Feature 2: Prep time per item
};

export const menu: MenuItem[] = [
  // Coffee & Drinks
  {
    id: "classic-cappuccino",
    name: "Velvet Cappuccino",
    description: "Rich double espresso with thick velvety microfoam & dusted cocoa.",
    price: 4.5,
    category: "Coffee & Drinks",
    tag: "Popular",
    image: menuSpreadImg,
    prepTimeMinutes: 4,
  },
  {
    id: "vanilla-latte",
    name: "Artisan Vanilla Bean Latte",
    description: "Double shot espresso, Madagascar vanilla, silky steamed milk.",
    price: 4.8,
    category: "Coffee & Drinks",
    tag: "Signature",
    image: menuSpreadImg,
    prepTimeMinutes: 5,
  },
  {
    id: "flat-white",
    name: "Ember Flat White",
    description: "Double ristretto, microfoam with house Ethiopian blend.",
    price: 4.2,
    category: "Coffee & Drinks",
    prepTimeMinutes: 4,
  },
  {
    id: "cardamom-latte",
    name: "Cardamom Honey Latte",
    description: "Crushed green cardamom, wildflower honey, oat or dairy milk.",
    price: 5.1,
    category: "Coffee & Drinks",
    prepTimeMinutes: 5,
  },
  {
    id: "cold-brew",
    name: "24h Slow Cold Brew",
    description: "Slow steeped micro-lot poured over a single clear ice block.",
    price: 4.6,
    category: "Coffee & Drinks",
    prepTimeMinutes: 2,
  },
  {
    id: "matcha-tonic",
    name: "Ceremonial Matcha Tonic",
    description: "Uji ceremonial matcha, premium tonic, sparkling yuzu twist.",
    price: 5.8,
    category: "Coffee & Drinks",
    prepTimeMinutes: 4,
  },
  {
    id: "iced-choc",
    name: "Dark Belgian Iced Chocolate",
    description: "70% single origin cocoa, cold cream, roasted cacao nibs.",
    price: 5.2,
    category: "Coffee & Drinks",
    prepTimeMinutes: 3,
  },

  // Bakery & Desserts
  {
    id: "fudgy-brownie",
    name: "Warm Fudgy Brownie & Gelato",
    description: "Decadent dark chocolate brownie with molten core & vanilla bean gelato.",
    price: 5.5,
    category: "Bakery & Desserts",
    tag: "Chef's Special",
    image: brownieImg,
    prepTimeMinutes: 6,
  },
  {
    id: "butter-croissant",
    name: "Golden Butter Croissant",
    description: "72-hour laminated French pastry, baked fresh at 6am daily.",
    price: 3.8,
    category: "Bakery & Desserts",
    tag: "Sells out",
    image: menuSpreadImg,
    prepTimeMinutes: 2,
  },
  {
    id: "cardamom-bun",
    name: "Cardamom Orange Knot",
    description: "Braided Swedish bun with freshly ground cardamom & orange zest.",
    price: 4.4,
    category: "Bakery & Desserts",
    prepTimeMinutes: 2,
  },
  {
    id: "banana-bread",
    name: "Brown Butter Banana Bread",
    description: "Toasted slice served warm with sea salt whipped honey butter.",
    price: 4.9,
    category: "Bakery & Desserts",
    prepTimeMinutes: 4,
  },

  // Artisanal Mains
  {
    id: "woodfired-pizza",
    name: "Artisanal Margherita Sourdough Pizza",
    description: "48h fermented sourdough crust, San Marzano sauce, fresh mozzarella, torn basil.",
    price: 14.5,
    category: "Artisanal Mains",
    tag: "Wood-fired",
    image: pizzaImg,
    prepTimeMinutes: 16,
  },
  {
    id: "gourmet-burger",
    name: "Gourmet Brioche Cafe Burger",
    description: "Juicy patty (or crispy paneer), melted vintage cheddar, caramelized onions, truffle sauce.",
    price: 13.5,
    category: "Artisanal Mains",
    tag: "Must Try",
    image: burgerImg,
    prepTimeMinutes: 14,
  },
  {
    id: "club-sandwich",
    name: "Toasted Sourdough Club Sandwich",
    description: "Triple-decker sourdough with herb grilled fillings, avocado, heirloom tomato, aioli.",
    price: 12.0,
    category: "Artisanal Mains",
    image: sandwichImg,
    prepTimeMinutes: 10,
  },
  {
    id: "avo-toast",
    name: "Avocado & Dukkah Sourdough Toast",
    description: "Hand-smashed Hass avocado, Egyptian dukkah spice, extra virgin lemon oil.",
    price: 11.5,
    category: "Artisanal Mains",
    tag: "Vegan",
    image: menuSpreadImg,
    prepTimeMinutes: 8,
  },
  {
    id: "shakshuka",
    name: "Small-Batch Skillet Shakshuka",
    description: "Slow-simmered spiced tomatoes, poached eggs, whipped feta & warm focaccia.",
    price: 13.9,
    category: "Artisanal Mains",
    prepTimeMinutes: 15,
  },

  // Bites & Sides
  {
    id: "herb-fries",
    name: "Crispy Herb & Truffle Fries",
    description: "Golden hand-cut fries tossed in fresh rosemary, sea salt, served with truffle mayo.",
    price: 6.5,
    category: "Bites & Sides",
    tag: "Crispy",
    image: friesImg,
    prepTimeMinutes: 8,
  },

  // Fresh & Bowls
  {
    id: "fresh-fruit-bowl",
    name: "Vibrant Seasonal Fruit Bowl",
    description: "Fresh dragonfruit, strawberries, blueberries, kiwi, Greek yogurt & passionfruit drizzle.",
    price: 8.5,
    category: "Fresh & Bowls",
    tag: "Healthy",
    image: fruitBowlImg,
    prepTimeMinutes: 5,
  },
  {
    id: "granola-bowl",
    name: "Roasted Maple Granola Bowl",
    description: "House-toasted oats, nuts, organic yogurt, roasted stone fruits and chia seeds.",
    price: 9.2,
    category: "Fresh & Bowls",
    prepTimeMinutes: 4,
  },
];

export const categories = [
  "Coffee & Drinks",
  "Bakery & Desserts",
  "Artisanal Mains",
  "Bites & Sides",
  "Fresh & Bowls",
] as const;

// Feature 3: Table Types Definition
export type TableType = {
  id: string;
  name: string;
  description: string;
  minCapacity: number;
  maxCapacity: number;
  totalTables: number;
  tag: string;
};

export const tableTypes: TableType[] = [
  {
    id: "window",
    name: "Window 2-Top",
    description: "Sunlit street-view table with natural wood finish. Ideal for couples or solo coffee.",
    minCapacity: 1,
    maxCapacity: 2,
    totalTables: 5,
    tag: "High Demand",
  },
  {
    id: "booth",
    name: "Cozy Dining Booth",
    description: "Plush upholstered booth with privacy and warm pendant lighting.",
    minCapacity: 2,
    maxCapacity: 4,
    totalTables: 4,
    tag: "Comfort",
  },
  {
    id: "courtyard",
    name: "Garden Courtyard",
    description: "Open-air patio with lush greenery and terracotta planters.",
    minCapacity: 2,
    maxCapacity: 6,
    totalTables: 4,
    tag: "Outdoor",
  },
  {
    id: "communal",
    name: "Long Communal Table",
    description: "Solid oak shared table with ample power outlets and spacious seating.",
    minCapacity: 1,
    maxCapacity: 8,
    totalTables: 6,
    tag: "Work & Social",
  },
  {
    id: "counter",
    name: "Espresso Bar Stools",
    description: "Front-row marble counter overlooking the espresso bar and roastery.",
    minCapacity: 1,
    maxCapacity: 2,
    totalTables: 6,
    tag: "Quick Brew",
  },
];
